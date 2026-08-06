import hashlib
import hmac
import json
import socket
import os
import tempfile
import threading
import unittest
import uuid
from http.client import HTTPConnection
from http.server import BaseHTTPRequestHandler
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
from unittest import mock

from neo_dev_webhook.automation import (
    Consumer,
    Limits,
    Receiver,
    Store,
    TaskRunner,
    has_standalone_marker,
)
from neo_dev_webhook import server as server_module


REPOSITORY = "kingkill85/snap-flow"
ACTOR = {"id": 11455872, "login": "kingkill85"}


def initialize_store(path):
    try:
        store = Store(path)
        store.close()
        return "ok"
    except Exception as error:
        return f"{type(error).__name__}: {error}"


class FakeGitHub:
    def __init__(self, *, open=True, labels=("neo-dev",), is_pr=False):
        self.open = open
        self.labels = labels
        self.is_pr = is_pr
        self.calls = []
        self.error = None

    def revalidate(self, repository, issue_number):
        self.calls.append((repository, issue_number))
        if self.error:
            raise self.error
        return {"open": self.open, "labels": list(self.labels), "is_pr": self.is_pr}


class FakeRunner:
    def __init__(self, failures=0):
        self.failures = failures
        self.calls = []

    def create(self, work, idempotency_key):
        self.calls.append((work, idempotency_key))
        if len(self.calls) <= self.failures:
            raise RuntimeError("simulated crash boundary")
        return f"task-{idempotency_key}"


def payload(event="issues", action=None, body="human update", **changes):
    action = action or ("created" if event == "issue_comment" else "edited")
    data = {
        "action": action,
        "repository": {"full_name": REPOSITORY},
        "sender": ACTOR.copy(),
        "issue": {
            "number": 77,
            "state": "open",
            "labels": [{"name": "neo-dev"}],
        },
    }
    if event == "issue_comment":
        data["comment"] = {"id": 9001, "body": body, "user": ACTOR.copy()}
    data.update(changes)
    return data


def request(secret, data, event="issues", delivery=None):
    raw = json.dumps(data, separators=(",", ":")).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return raw, {
        "X-Hub-Signature-256": f"sha256={signature}",
        "X-GitHub-Event": event,
        "X-GitHub-Delivery": delivery or str(uuid.uuid4()),
        "Content-Type": "application/json",
    }


class MarkerTests(unittest.TestCase):
    def test_exact_standalone_marker_positions(self):
        marker = "<!-- neo-dev -->"
        for value in (marker, marker + "\ntext", "text\n" + marker, "a\n" + marker + "\nb"):
            with self.subTest(value=value):
                self.assertTrue(has_standalone_marker(value))

    def test_marker_lookalikes_are_not_markers(self):
        for value in (
            " <!-- neo-dev -->", "<!-- neo-dev --> ", "<!-- NEO-DEV -->",
            "<!-- neo-dev-->", "<!-- neo-dev -->suffix", "prefix<!-- neo-dev -->",
            "<!-- neo-dev-extra -->", "neo-dev", "<!--  neo-dev  -->", "",
        ):
            with self.subTest(value=value):
                self.assertFalse(has_standalone_marker(value))


class AutomationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = os.path.join(self.temp.name, "queue.sqlite")
        self.store = Store(self.db)
        self.github = FakeGitHub()
        self.receiver = Receiver("secret", self.store, self.github)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def send(self, data=None, event="issues", delivery=None, mutate=None):
        raw, headers = request("secret", data or payload(event=event), event, delivery)
        if mutate:
            mutate(raw, headers)
        return self.receiver.handle(headers, raw)

    def test_accepts_only_after_durable_enqueue_and_replays_uuid_delivery(self):
        delivery = str(uuid.uuid4())
        self.assertEqual(self.send(delivery=delivery), (202, "accepted"))
        self.assertEqual(self.store.count("deliveries"), 1)
        self.assertEqual(self.store.count("wakeups"), 1)
        self.store.close()
        self.store = Store(self.db)
        self.receiver = Receiver("secret", self.store, self.github)
        self.assertEqual(self.send(delivery=delivery), (200, "duplicate"))
        self.assertEqual(self.store.count("wakeups"), 1)

    def test_raw_byte_hmac_and_canonical_delivery_uuid(self):
        raw, headers = request("secret", payload())
        headers["X-Hub-Signature-256"] = hmac.new(b"secret", raw + b" ", hashlib.sha256).hexdigest()
        self.assertEqual(self.receiver.handle(headers, raw)[0], 401)
        for bad in (
            "abc", str(uuid.uuid4()).upper(),
            "{12345678-1234-1234-1234-123456789abc}",
        ):
            with self.subTest(bad=bad):
                self.assertEqual(self.send(delivery=bad)[0], 400)

    def test_repository_event_open_label_and_labeled_action_policy(self):
        cases = [
            (payload(repository={"full_name": "other/repo"}), "issues", 403),
            (payload(), "push", 202),
            (payload(issue={"number": 77, "state": "closed", "labels": [{"name": "neo-dev"}]}), "issues", 202),
            (payload(issue={"number": 77, "state": "open", "labels": [{"name": "NEO-DEV"}]}), "issues", 202),
            (payload(action="labeled", label={"name": "needs-input"}), "issues", 202),
            (payload(action="labeled", label={"name": "neo-dev"}), "issues", 202),
        ]
        for index, (data, event, status) in enumerate(cases):
            with self.subTest(data=data, event=event):
                before = (self.store.count("deliveries"), self.store.count("wakeups"))
                self.assertEqual(self.send(data, event)[0], status)
                after = (self.store.count("deliveries"), self.store.count("wakeups"))
                if index == len(cases) - 1:
                    self.assertEqual(after, (before[0] + 1, before[1] + 1))
                else:
                    self.assertEqual(after, before)

    def test_rejects_pr_comments_and_actor_mismatch(self):
        comment = payload(event="issue_comment")
        comment["issue"]["pull_request"] = {"url": "https://example.invalid"}
        self.assertEqual(self.send(comment, "issue_comment")[0], 202)
        wrong = payload(event="issue_comment")
        wrong["comment"]["user"] = {"id": 1, "login": "kingkill85"}
        self.assertEqual(self.send(wrong, "issue_comment")[0], 403)

    def test_receiver_only_durably_enqueues_without_live_network_work(self):
        self.github.error = RuntimeError("network must not run in receiver")
        self.assertEqual(self.send(), (202, "accepted"))
        self.assertEqual(self.github.calls, [])
        self.assertEqual(self.store.count("wakeups"), 1)

    def test_exact_marker_ignored_only_on_own_line(self):
        for body, ignored in (
            ("<!-- neo-dev -->", True),
            ("<!-- neo-dev -->\nhuman", True),
            ("human\n<!-- neo-dev -->", True),
            ("human\n<!-- neo-dev -->\nmore", True),
            ("human\r\n<!-- neo-dev -->\r\nmore", True),
            ("x<!-- neo-dev -->", False),
            ("<!-- neo-dev -->x", False),
            (" <!-- neo-dev -->", False),
        ):
            with self.subTest(body=body):
                before = self.store.count("wakeups")
                self.assertIn(self.send(payload(event="issue_comment", body=body), "issue_comment")[0], (202, 503))
                self.assertEqual(self.store.count("wakeups"), before + (0 if ignored else 1))

    def test_bounded_headers_body_comment_labels_and_schema(self):
        limits = Limits(body_bytes=512, header_bytes=80, total_header_bytes=240,
                        comment_chars=20, labels=2, label_chars=12)
        receiver = Receiver("secret", self.store, self.github, limits=limits)
        raw, headers = request("secret", payload())
        self.assertEqual(receiver.handle(headers, b"{" + b"x" * 513)[0], 413)
        huge_headers = dict(headers, **{"X-GitHub-Event": "x" * 81})
        self.assertEqual(receiver.handle(huge_headers, raw)[0], 431)
        many_headers = dict(headers)
        many_headers.update({f"X-Filler-{index}": "x" * 50 for index in range(5)})
        self.assertEqual(receiver.handle(many_headers, raw)[0], 431)
        for data, event in (
            (payload(event="issue_comment", body="x" * 21), "issue_comment"),
            (payload(issue={"number": 77, "state": "open", "labels": [{"name": "a"}] * 3}), "issues"),
            (payload(sender={"id": "11455872", "login": "kingkill85"}), "issues"),
        ):
            raw2, headers2 = request("secret", data, event)
            expected = 403 if data.get("sender", {}).get("id") == "11455872" else 400
            self.assertEqual(receiver.handle(headers2, raw2)[0], expected)
        malformed, malformed_headers = request("secret", payload(repository=[]))
        self.assertEqual(receiver.handle(malformed_headers, malformed), (400, "invalid_payload"))

    def test_rate_and_concurrency_limits(self):
        limited = Receiver("secret", self.store, self.github, rate_limit=1, concurrency_limit=0)
        raw, headers = request("secret", payload())
        self.assertEqual(limited.handle(headers, raw)[0], 503)
        limited = Receiver("secret", self.store, self.github, rate_limit=1)
        invalid_headers = dict(headers, **{"X-Hub-Signature-256": "sha256=" + "0" * 64})
        self.assertEqual(limited.handle(invalid_headers, raw)[0], 401)
        self.assertEqual(limited.handle(headers, raw)[0], 202)
        raw2, headers2 = request("secret", payload())
        self.assertEqual(limited.handle(headers2, raw2)[0], 429)

    def test_consumer_claim_lease_retry_task_id_and_issue_coalescing(self):
        first, first_headers = request("secret", payload())
        second, second_headers = request("secret", payload(action="edited"))
        self.assertEqual(self.receiver.handle(first_headers, first)[0], 202)
        self.assertEqual(self.receiver.handle(second_headers, second)[0], 202)
        self.assertEqual(self.store.count("active_work"), 1)
        self.assertEqual(self.store.count("wakeups"), 2)

        runner = FakeRunner(failures=1)
        consumer = Consumer(self.store, runner, self.github, lease_seconds=1)
        self.assertFalse(consumer.run_one(now=100))
        work = self.store.get_active(REPOSITORY, 77)
        self.assertEqual(work["status"], "queued")
        self.assertEqual(work["attempts"], 1)
        self.assertTrue(consumer.run_one(now=102))
        work = self.store.get_active(REPOSITORY, 77)
        self.assertEqual(work["status"], "completed")
        self.assertEqual(work["task_id"], f"task-{first_headers['X-GitHub-Delivery']}")
        self.assertEqual([call[1] for call in runner.calls], [first_headers["X-GitHub-Delivery"]] * 2)

    def test_expired_processing_lease_is_recovered_transactionally(self):
        self.send()
        claimed = self.store.claim(now=10, lease_seconds=5)
        self.assertEqual(claimed["status"], "processing")
        self.assertIsNone(self.store.claim(now=14, lease_seconds=5))
        recovered = self.store.claim(now=16, lease_seconds=5)
        self.assertEqual(recovered["id"], claimed["id"])
        self.assertEqual(recovered["attempts"], 2)

    def test_late_wakeup_after_claim_becomes_successor_work(self):
        first_delivery = str(uuid.uuid4())
        late_delivery = str(uuid.uuid4())
        self.send(delivery=first_delivery)
        claimed = self.store.claim(now=10, lease_seconds=30, max_attempts=5)

        self.assertEqual(self.send(delivery=late_delivery), (202, "accepted"))
        self.store.complete(claimed["id"], claimed["claim_token"], "task-first", now=11)

        successor = self.store.claim(now=12, lease_seconds=30, max_attempts=5)
        self.assertIsNotNone(successor)
        self.assertNotEqual(successor["id"], claimed["id"])
        self.assertEqual(successor["idempotency_key"], late_delivery)
        self.assertEqual([item["delivery_id"] for item in successor["wakeups"]], [late_delivery])
        live_count = self.store.db.execute(
            "SELECT count(*) FROM active_work WHERE repository=? AND issue_number=? "
            "AND status IN ('queued','processing')", (REPOSITORY, 77),
        ).fetchone()[0]
        self.assertEqual(live_count, 1)

    def test_expired_leases_dead_letter_at_attempt_limit_without_fail(self):
        self.send()
        first = self.store.claim(now=10, lease_seconds=1, max_attempts=2)
        self.assertEqual(first["attempts"], 1)
        second = self.store.claim(now=12, lease_seconds=1, max_attempts=2)
        self.assertEqual(second["attempts"], 2)

        self.assertIsNone(self.store.claim(now=14, lease_seconds=1, max_attempts=2))
        work = self.store.get_active(REPOSITORY, 77)
        self.assertEqual(work["status"], "dead")
        self.assertEqual(work["attempts"], 2)

    def test_concurrent_deliveries_create_one_active_issue_task(self):
        requests = [request("secret", payload()) for _ in range(8)]
        results = []
        threads = [threading.Thread(target=lambda item=item: results.append(self.receiver.handle(item[1], item[0]))) for item in requests]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertEqual(results.count((202, "accepted")), 8)
        self.assertEqual(self.store.count("active_work"), 1)
        self.assertEqual(self.store.count("wakeups"), 8)

    def test_simultaneous_process_initialization_of_fresh_database(self):
        with tempfile.TemporaryDirectory() as directory:
            database = os.path.join(directory, "fresh.sqlite3")
            with ProcessPoolExecutor(max_workers=12) as pool:
                results = list(pool.map(initialize_store, [database] * 24))
        self.assertEqual(results, ["ok"] * 24)

    def test_separate_connections_race_to_one_active_issue_task(self):
        requests = [request("secret", payload()) for _ in range(12)]

        def send(item):
            store = Store(self.db)
            try:
                return Receiver("secret", store, FakeGitHub()).handle(item[1], item[0])
            finally:
                store.close()

        with ThreadPoolExecutor(max_workers=12) as pool:
            results = list(pool.map(send, requests))
        self.assertEqual(results.count((202, "accepted")), 12)
        self.assertEqual(self.store.count("active_work"), 1)
        self.assertEqual(self.store.count("wakeups"), 12)

    def test_claim_owner_compare_and_set_rejects_stale_worker(self):
        self.send()
        first = self.store.claim(now=10, lease_seconds=1)
        second_store = Store(self.db)
        try:
            second = second_store.claim(now=12, lease_seconds=10)
            self.assertNotEqual(first["claim_token"], second["claim_token"])
            with self.assertRaises(RuntimeError):
                self.store.complete(first["id"], first["claim_token"], "stale", now=13)
            second_store.complete(second["id"], second["claim_token"], "current", now=13)
        finally:
            second_store.close()
        self.assertEqual(self.store.get_active(REPOSITORY, 77)["task_id"], "current")

    def test_consumer_revalidates_immediately_before_create(self):
        self.send()
        self.github.open = False
        runner = FakeRunner()
        consumer = Consumer(self.store, runner, self.github, max_attempts=2)
        self.assertFalse(consumer.run_one(now=100))
        self.assertEqual(runner.calls, [])
        self.assertEqual(self.github.calls[-1], (REPOSITORY, 77))

    def test_failures_are_bounded_and_dead_lettered(self):
        self.send()
        runner = FakeRunner(failures=10)
        consumer = Consumer(self.store, runner, FakeGitHub(), max_attempts=2)
        self.assertFalse(consumer.run_one(now=100))
        self.assertFalse(consumer.run_one(now=101))
        work = self.store.get_active(REPOSITORY, 77)
        self.assertEqual(work["status"], "dead")
        self.assertFalse(consumer.run_one(now=102))

    def test_task_runner_uses_safe_argv_and_parses_task_id(self):
        help_result = mock.Mock(stdout="usage: task.py [-h] [--body BODY] [--max-runtime MAX_RUNTIME]\n               [--workspace WORKSPACE] [--idempotency-key IDEMPOTENCY_KEY]\n               title\n")
        completed = mock.Mock(stdout='{"task_id":"kanban-77","durable":true}\n')
        runner = TaskRunner(script_path="/test/task.py")
        with mock.patch("subprocess.run", side_effect=[help_result, completed]) as run:
            task_id = runner.create({"issue_number": 77, "wakeups": [{}]}, "delivery-key")
        self.assertEqual(task_id, "kanban-77")
        self.assertEqual(run.call_args_list[0].args[0], ["python3", "/test/task.py", "--help"])
        argv = run.call_args_list[1].args[0]
        self.assertEqual(argv, [
            "python3", "/test/task.py", "SnapFlow issue #77",
            "--body", "Process SnapFlow issue #77 with 1 durable wakeup(s).",
            "--max-runtime", "2h",
            "--workspace", "scratch", "--idempotency-key", "delivery-key",
        ])
        self.assertNotIn("shell", run.call_args.kwargs)

    def test_task_runner_max_runtime_is_configurable(self):
        help_result = mock.Mock(stdout="usage: task.py title --body BODY --max-runtime MAX_RUNTIME --workspace WORKSPACE --idempotency-key KEY")
        completed = mock.Mock(stdout='{"task_id":"kanban-77","durable":true}\n')
        runner = TaskRunner(script_path="/test/task.py", max_runtime="45m")
        with mock.patch("subprocess.run", side_effect=[help_result, completed]) as run:
            runner.create({"issue_number": 77, "wakeups": []}, "delivery-key")
        self.assertIn("45m", run.call_args_list[1].args[0])

    def test_task_runner_rejects_ambiguous_or_unrelated_json_ids(self):
        help_result = mock.Mock(stdout="usage: task.py title --body BODY --max-runtime MAX_RUNTIME --workspace WORKSPACE --idempotency-key KEY")
        invalid_outputs = (
            '{"id":"dispatcher-wakeup-1"}\n',
            '{"data":{"id":"request-1"}}\n',
            '{"task_id":"kanban-77","durable":true}\n{"id":"other"}\n',
            '{"task_id":"kanban-77","durable":false}\n',
        )
        for output in invalid_outputs:
            with self.subTest(output=output):
                runner = TaskRunner(script_path="/test/task.py")
                with mock.patch("subprocess.run", side_effect=[help_result, mock.Mock(stdout=output)]):
                    with self.assertRaises(RuntimeError):
                        runner.create({"issue_number": 77, "wakeups": []}, "delivery-key")

    def test_task_runner_rejects_incompatible_real_help_shape(self):
        runner = TaskRunner(script_path="/test/task.py")
        with mock.patch("subprocess.run", return_value=mock.Mock(stdout="usage: task.py title --body BODY")):
            with self.assertRaisesRegex(RuntimeError, "incompatible"):
                runner.create({"issue_number": 77, "wakeups": []}, "delivery-key")


class ServerAdmissionTest(unittest.TestCase):
    def test_wire_header_limits_apply_during_parsing(self):
        class LimitedHandler(server_module.HeaderLimitHandlerMixin, BaseHTTPRequestHandler):
            header_line_limit = 32
            header_total_limit = 64

            def do_POST(self):
                self.send_response(204)
                self.end_headers()

            def log_message(self, format, *args):
                return

        server = server_module.BoundedThreadingHTTPServer(
            ("127.0.0.1", 0), LimitedHandler,
            concurrency_limit=1, read_timeout=1,
        )
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            for headers in (
                b"X-Oversized: " + b"a" * 40 + b"\r\n",
                b"X-A: 1234567890\r\nX-B: 1234567890\r\nX-C: 1234567890\r\n",
            ):
                with self.subTest(headers=headers):
                    client = socket.create_connection(("127.0.0.1", server.server_port), timeout=1)
                    client.sendall(b"POST / HTTP/1.1\r\nHost: test\r\n" + headers + b"Content-Length: 0\r\n\r\n")
                    response = client.recv(4096)
                    self.assertIn(b" 431 ", response)
                    client.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_server_rejects_before_allocating_second_handler_thread(self):
        entered = threading.Event()
        release = threading.Event()
        handler_calls = 0
        handler_lock = threading.Lock()

        class BlockingHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                nonlocal handler_calls
                with handler_lock:
                    handler_calls += 1
                entered.set()
                release.wait(timeout=2)
                self.send_response(204)
                self.end_headers()

            def log_message(self, format, *args):
                return

        server = server_module.BoundedThreadingHTTPServer(
            ("127.0.0.1", 0), BlockingHandler, concurrency_limit=1
        )
        server_thread = threading.Thread(target=server.serve_forever)
        server_thread.start()
        first = HTTPConnection("127.0.0.1", server.server_port, timeout=2)
        first_thread = threading.Thread(target=lambda: (first.request("POST", "/", b""), first.getresponse().read()))
        try:
            first_thread.start()
            self.assertTrue(entered.wait(timeout=1))
            second = HTTPConnection("127.0.0.1", server.server_port, timeout=2)
            try:
                second.request("POST", "/", b"unread body")
                rejected_status = second.getresponse().status
            except BrokenPipeError:
                rejected_status = 503
            self.assertEqual(rejected_status, 503)
            second.close()
            with handler_lock:
                self.assertEqual(handler_calls, 1)
        finally:
            release.set()
            first_thread.join(timeout=2)
            first.close()
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=2)


    def test_slow_drip_cannot_extend_absolute_request_deadline(self):
        class ReadingHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                self.send_response(204)
                self.end_headers()

            def log_message(self, format, *args):
                return

        server = server_module.BoundedThreadingHTTPServer(
            ("127.0.0.1", 0),
            ReadingHandler,
            concurrency_limit=1,
            read_timeout=0.3,
        )
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        slow = socket.create_connection(("127.0.0.1", server.server_port), timeout=1)
        stop = threading.Event()

        def drip():
            while not stop.wait(0.04):
                try:
                    slow.sendall(b"P")
                except OSError:
                    return

        dripper = threading.Thread(target=drip)
        dripper.start()
        try:
            slow.sendall(b"P")
            stop.wait(0.45)
            connection = HTTPConnection("127.0.0.1", server.server_port, timeout=2)
            connection.request("POST", "/", body=b"x")
            self.assertEqual(connection.getresponse().status, 204)
            connection.close()
        finally:
            stop.set()
            dripper.join(timeout=1)
            slow.close()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_stalled_header_and_body_release_admission_slot(self):
        class ReadingHandler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                self.send_response(204)
                self.end_headers()

            def log_message(self, format, *args):
                return

        server = server_module.BoundedThreadingHTTPServer(
            ("127.0.0.1", 0), ReadingHandler,
            concurrency_limit=1, read_timeout=0.1,
        )
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            for partial in (
                b"POST / HTTP/1.1\r\nHost: localhost\r\n",
                b"POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 5\r\n\r\n",
            ):
                stalled = socket.create_connection(("127.0.0.1", server.server_port), timeout=1)
                stalled.sendall(partial)
                threading.Event().wait(0.2)
                stalled.close()
                healthy = HTTPConnection("127.0.0.1", server.server_port, timeout=1)
                healthy.request("POST", "/", b"")
                self.assertEqual(healthy.getresponse().status, 204)
                healthy.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()

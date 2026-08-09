import hashlib
import hmac
import http.client
import json
import pathlib
import socket
import threading
import time
import unittest
import uuid
from io import BytesIO
from http.server import BaseHTTPRequestHandler
from unittest import mock

from neo_dev_webhook.automation import Limits, Receiver, TaskRunner
from neo_dev_webhook.server import BoundedThreadingHTTPServer, LimitedHeaderReader


REPOSITORY = "kingkill85/snap-flow"
ACTOR = {"id": 11455872, "login": "kingkill85"}


def payload(event="issues", action=None, body="human update", **changes):
    data = {
        "action": action or ("created" if event == "issue_comment" else "edited"),
        "repository": {"full_name": REPOSITORY},
        "sender": ACTOR.copy(),
        "issue": {"number": 77, "state": "open", "labels": [{"name": "neo-dev"}]},
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


class FakeRunner:
    def __init__(self):
        self.calls = []

    def create(self, wakeup):
        self.calls.append(wakeup)
        return f"task-{wakeup['delivery_id']}"


class WebhookInboxTest(unittest.TestCase):
    def setUp(self):
        self.runner = FakeRunner()
        self.receiver = Receiver("secret", self.runner)

    def send(self, data=None, event="issues", delivery=None, secret="secret"):
        raw, headers = request(secret, data or payload(event), event, delivery)
        return self.receiver.handle(headers, raw)

    def test_valid_signed_delivery_creates_exactly_one_durable_dev_task(self):
        delivery = str(uuid.uuid4())
        self.assertEqual(self.send(delivery=delivery), (202, "accepted"))
        self.assertEqual(len(self.runner.calls), 1)
        self.assertEqual(self.runner.calls[0]["delivery_id"], delivery)

    def test_duplicate_delivery_resolves_to_one_durable_task_identity(self):
        delivery = str(uuid.uuid4())
        identities = {}

        class DeduplicatingRunner(FakeRunner):
            def create(self, wakeup):
                self.calls.append(wakeup)
                return identities.setdefault(wakeup["delivery_id"], str(uuid.uuid4()))

        runner = DeduplicatingRunner()
        self.receiver = Receiver("secret", runner)
        self.assertEqual(self.send(delivery=delivery), (202, "accepted"))
        self.assertEqual(self.send(delivery=delivery), (202, "accepted"))
        self.assertEqual(len(runner.calls), 2)
        self.assertEqual(len(identities), 1)

    def test_runner_failure_is_retryable_and_unambiguous(self):
        raw, headers = request("secret", payload())
        for error in (RuntimeError("ambiguous output"), TimeoutError("deadline")):
            with self.subTest(error=error):
                runner = mock.Mock()
                runner.create.side_effect = error
                receiver = Receiver("secret", runner)
                self.assertEqual(receiver.handle(headers, raw), (503, "handoff_unavailable"))
                runner.create.assert_called_once()

    def test_automated_self_marked_and_ineligible_events_create_none(self):
        cases = [
            (payload(event="issue_comment", body="<!-- neo-dev -->"), "issue_comment"),
            (payload(event="issue_comment", sender={"id": 1, "login": "bot"}), "issue_comment"),
            (payload(issue={"number": 77, "state": "open", "labels": []}), "issues"),
            (payload(issue={"number": 77, "state": "closed", "labels": [{"name": "neo-dev"}]}), "issues"),
            (payload(action="unlabeled"), "issues"),
            (payload(event="issue_comment", issue={"number": 77, "state": "open",
                     "labels": [{"name": "neo-dev"}], "pull_request": {}}), "issue_comment"),
        ]
        for data, event in cases:
            with self.subTest(event=event, action=data["action"]):
                self.send(data, event)
        self.assertEqual(self.runner.calls, [])

    def test_exact_marker_lookalikes_remain_human_wakeups(self):
        lookalikes = (
            " <!-- neo-dev -->", "<!-- neo-dev --> ", "<!-- NEO-DEV -->",
            "prefix<!-- neo-dev -->", "<!-- neo-dev -->suffix", "<!-- neo-dev-->",
        )
        for body in lookalikes:
            with self.subTest(body=body):
                self.assertEqual(self.send(payload(event="issue_comment", body=body),
                                           "issue_comment"), (202, "accepted"))
        self.assertEqual(len(self.runner.calls), len(lookalikes))

    def test_subsequent_human_delivery_creates_another_same_inbox_wakeup(self):
        first, second = str(uuid.uuid4()), str(uuid.uuid4())
        self.send(delivery=first)
        self.send(payload(event="issue_comment"), "issue_comment", second)
        self.assertEqual([call["delivery_id"] for call in self.runner.calls], [first, second])
        self.assertEqual([call["issue_number"] for call in self.runner.calls], [77, 77])

    def test_security_and_payload_limits_remain_fail_closed(self):
        data = payload()
        raw, headers = request("wrong", data)
        self.assertEqual(self.receiver.handle(headers, raw), (401, "invalid_signature"))
        self.assertEqual(self.send(data, delivery="not-a-uuid"), (400, "invalid_delivery"))
        wrong_repo = payload(repository={"full_name": "someone/else"})
        self.assertEqual(self.send(wrong_repo), (403, "wrong_repository"))
        large = payload(event="issue_comment", body="x" * (Limits().comment_chars + 1))
        self.assertEqual(self.send(large, "issue_comment"), (400, "invalid_payload"))
        self.assertEqual(self.runner.calls, [])

    def test_rate_and_concurrency_limits_fail_closed(self):
        limited = Receiver("secret", self.runner, rate_limit=1)
        first_raw, first_headers = request("secret", payload())
        second_raw, second_headers = request("secret", payload())
        self.assertEqual(limited.handle(first_headers, first_raw), (202, "accepted"))
        self.assertEqual(limited.handle(second_headers, second_raw), (429, "rate_limited"))
        busy = Receiver("secret", self.runner, concurrency_limit=1)
        self.assertTrue(busy.semaphore.acquire(blocking=False))
        try:
            self.assertEqual(busy.handle(second_headers, second_raw), (503, "busy"))
        finally:
            busy.semaphore.release()

class TaskRunnerTest(unittest.TestCase):
    def test_max_runtime_is_exactly_two_hours(self):
        for value in (None, "", "1h", "120m", "2h "):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "exactly 2h"):
                TaskRunner("/test/task.py", max_runtime=value)

    def test_body_routes_persistent_orchestrator_without_controller_decisions(self):
        delivery = str(uuid.uuid4())
        wakeup = {"delivery_id": delivery, "repository": REPOSITORY,
                  "issue_number": 77, "event": "issue_comment", "action": "created",
                  "comment_id": 9001}
        help_result = mock.Mock(stdout="title --body --max-runtime --workspace --board --assignee --idempotency-key")
        created = mock.Mock(stdout='{"task_id":"kanban-77","durable":true}\n')
        with mock.patch("subprocess.run", side_effect=[help_result, created]) as run:
            self.assertEqual(TaskRunner("/test/task.py").create(wakeup), "kanban-77")
        argv = run.call_args_list[1].args[0]
        body = argv[argv.index("--body") + 1]
        for expected in (
            "Repository: kingkill85/snap-flow", "Issue: #77", "Event: issue_comment",
            "Action: created", f"GitHub delivery ID: {delivery}", "Comment ID: 9001",
            "Assigned profile: dev", "Kanban board: private-dev",
            "Workspace: dir:/opt/data/profiles/dev", "`snapflow-orchestrator` skill",
            "`/opt/data/profiles/dev/projects/snapflow.md`", "Fetch the live Issue",
            "sole resumable Codex implementation worker", "fresh independent reviewers",
        ):
            self.assertIn(expected, body)
        for forbidden in (
            "Current phase", "capability", "controller decision", "transition",
            "snapflow_neo_dev_transition", "neo-dev-project-control",
        ):
            self.assertNotIn(forbidden, body)
        self.assertEqual(argv[-10:], ["--max-runtime", "2h", "--workspace",
                                      "dir:/opt/data/profiles/dev", "--board", "private-dev",
                                      "--assignee", "dev", "--idempotency-key", delivery])

    def test_task_creation_requires_unambiguous_durable_confirmation(self):
        wakeup = {"delivery_id": str(uuid.uuid4()), "repository": REPOSITORY,
                  "issue_number": 1, "event": "issues", "action": "labeled",
                  "comment_id": None}
        help_result = mock.Mock(stdout="title --body --max-runtime --workspace --board --assignee --idempotency-key")
        for output in ('{}', '{"task_id":"x","durable":false}', 'not-json',
                       '{"task_id":"x","durable":true}\n{"task_id":"y","durable":true}'):
            with self.subTest(output=output), mock.patch(
                "subprocess.run", side_effect=[help_result, mock.Mock(stdout=output)]
            ):
                with self.assertRaises(RuntimeError):
                    TaskRunner("/test/task.py").create(wakeup)


class BoundedServerTest(unittest.TestCase):
    def test_header_reader_rejects_individual_and_aggregate_overflow(self):
        reader = LimitedHeaderReader(BytesIO(b"Long: 123456\r\n"), line_limit=8, total_limit=20)
        with self.assertRaises(Exception):
            reader.readline()
        reader = LimitedHeaderReader(BytesIO(b"A: 1\r\nB: 2\r\n"), line_limit=8, total_limit=8)
        reader.readline()
        with self.assertRaises(Exception):
            reader.readline()

    def test_server_rejects_invalid_resource_bounds(self):
        with self.assertRaises(ValueError):
            BoundedThreadingHTTPServer(("127.0.0.1", 0), mock.Mock(), concurrency_limit=0)
        with self.assertRaises(ValueError):
            BoundedThreadingHTTPServer(("127.0.0.1", 0), mock.Mock(), read_timeout=0)

    def test_real_socket_header_and_body_deadlines_release_admission(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                self.server.finish_read_phase(self.request)
                self.send_response(204)
                self.end_headers()

            def log_message(self, _format, *_args):
                return

        server = BoundedThreadingHTTPServer(("127.0.0.1", 0), Handler,
                                            concurrency_limit=1, read_timeout=0.1)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        host, port = server.server_address
        try:
            for partial in (
                b"POST / HTTP/1.1\r\nHost: localhost\r\n",
                b"POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10\r\n\r\nx",
            ):
                stalled = socket.create_connection((host, port), timeout=1)
                stalled.sendall(partial)
                time.sleep(0.2)
                stalled.close()
                healthy = http.client.HTTPConnection(host, port, timeout=1)
                healthy.request("POST", "/", body=b"")
                self.assertEqual(healthy.getresponse().status, 204)
                healthy.close()
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=1)

    def test_slow_trickle_cannot_extend_absolute_read_deadline(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                self.server.finish_read_phase(self.request)
                self.send_response(204)
                self.end_headers()

            def log_message(self, _format, *_args):
                return

        server = BoundedThreadingHTTPServer(("127.0.0.1", 0), Handler,
                                            concurrency_limit=1, read_timeout=0.12)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        host, port = server.server_address
        trickle = socket.create_connection((host, port), timeout=1)
        try:
            trickle.sendall(
                b"POST / HTTP/1.1\r\nHost: localhost\r\nContent-Length: 10\r\n\r\n"
            )
            for _ in range(6):
                time.sleep(0.04)
                try:
                    trickle.sendall(b"x")
                except OSError:
                    break
            trickle.settimeout(0.5)
            self.assertEqual(trickle.recv(1), b"")
            healthy = http.client.HTTPConnection(host, port, timeout=1)
            healthy.request("POST", "/", body=b"")
            self.assertEqual(healthy.getresponse().status, 204)
            healthy.close()
        finally:
            trickle.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=1)

    def test_completed_body_allows_handler_work_beyond_read_timeout(self):
        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                length = int(self.headers.get("Content-Length", "0"))
                self.rfile.read(length)
                self.server.finish_read_phase(self.request)
                time.sleep(0.15)
                self.send_response(204)
                self.end_headers()

            def log_message(self, _format, *_args):
                return

        server = BoundedThreadingHTTPServer(("127.0.0.1", 0), Handler,
                                            concurrency_limit=1, read_timeout=0.05)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        connection = http.client.HTTPConnection(*server.server_address, timeout=1)
        try:
            connection.request("POST", "/", body=b"complete")
            self.assertEqual(connection.getresponse().status, 204)
        finally:
            connection.close()
            server.shutdown()
            server.server_close()
            thread.join(timeout=1)


class CanonicalContractTest(unittest.TestCase):
    def test_canonical_specs_describe_direct_handoff_and_frozen_artifacts(self):
        root = pathlib.Path(__file__).parents[3]
        webhook = (root / "openspec/specs/github-webhook-handoff/spec.md").read_text()
        governed = (root / "openspec/specs/governed-development-workflow/spec.md").read_text()
        for expected in ("exactly one durable Kanban task", "persistent `dev` profile",
                         "`private-dev` Kanban inbox", "canonical `X-GitHub-Delivery`"):
            self.assertIn(expected, webhook)
        self.assertIn("byte-frozen", governed)
        self.assertIn("progress", governed)
        self.assertIn("Kanban", governed)
        self.assertNotIn("coalesced", webhook.casefold())
        self.assertNotIn("controller", webhook.casefold())
        self.assertNotIn("controller", governed.casefold())
        self.assertNotIn("consumer", webhook.casefold())
        self.assertNotIn("queue", webhook.casefold())
        self.assertFalse((root / "openspec/changes/issue-77-enforce-container-boundary").exists())


if __name__ == "__main__":
    unittest.main()

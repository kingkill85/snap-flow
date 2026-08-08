import hashlib
import hmac
import http.client
import json
import os
import pathlib
import sqlite3
import socket
import tempfile
import threading
import time
import unittest
import uuid
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from http.server import BaseHTTPRequestHandler
from unittest import mock

from neo_dev_webhook.automation import Consumer, Limits, Receiver, Store, TaskRunner
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


class FakeGitHub:
    def __init__(self, *, open=True, labels=("neo-dev",), is_pr=False):
        self.result = {"open": open, "labels": list(labels), "is_pr": is_pr}
        self.calls = []

    def revalidate(self, repository, issue_number):
        self.calls.append((repository, issue_number))
        return self.result


class FakeRunner:
    def __init__(self):
        self.calls = []

    def create(self, wakeup):
        self.calls.append(wakeup)
        return f"task-{wakeup['delivery_id']}"


class FlakyRunner(FakeRunner):
    def create(self, wakeup):
        self.calls.append(wakeup)
        if len(self.calls) == 1:
            raise RuntimeError("ambiguous task-runner response")
        return f"task-{wakeup['delivery_id']}"


class WebhookInboxTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.temp.name, "queue.sqlite")
        self.store = Store(self.path)
        self.github = FakeGitHub()
        self.receiver = Receiver("secret", self.store, self.github)

    def tearDown(self):
        self.store.close()
        self.temp.cleanup()

    def send(self, data=None, event="issues", delivery=None, secret="secret"):
        raw, headers = request(secret, data or payload(event), event, delivery)
        return self.receiver.handle(headers, raw)

    def test_valid_signed_delivery_creates_exactly_one_durable_dev_task(self):
        delivery = str(uuid.uuid4())
        self.assertEqual(self.send(delivery=delivery), (202, "accepted"))
        self.assertEqual(self.store.count("deliveries"), 1)
        self.assertEqual(self.store.count("kanban_wakeups"), 1)
        self.store.close()
        self.store = Store(self.path)
        runner = FakeRunner()
        consumer = Consumer(self.store, runner, self.github)
        self.assertTrue(consumer.run_one())
        self.assertFalse(consumer.run_one())
        self.assertEqual(self.github.calls, [(REPOSITORY, 77)])
        self.assertEqual(len(runner.calls), 1)
        wakeup = self.store.list_wakeups()[0]
        self.assertEqual(wakeup["status"], "created")
        self.assertEqual(wakeup["task_id"], f"task-{delivery}")

    def test_duplicate_delivery_creates_no_duplicate_card(self):
        delivery = str(uuid.uuid4())
        self.assertEqual(self.send(delivery=delivery), (202, "accepted"))
        self.assertEqual(self.send(delivery=delivery), (200, "duplicate"))
        runner = FakeRunner()
        consumer = Consumer(self.store, runner, self.github)
        self.assertTrue(consumer.run_one())
        self.assertFalse(consumer.run_one())
        self.assertEqual(len(runner.calls), 1)

    def test_valid_delivery_reports_persistence_failures_as_retryable(self):
        raw, headers = request("secret", payload())
        for error in (
            sqlite3.OperationalError("database is locked"),
            sqlite3.DatabaseError("disk I/O error"),
            sqlite3.Error("unable to open database file"),
        ):
            with self.subTest(error=error):
                store = mock.Mock()
                store.accept.side_effect = error
                receiver = Receiver("secret", store, self.github)
                self.assertEqual(receiver.handle(headers, raw),
                                 (503, "persistence_unavailable"))
                store.accept.assert_called_once()

    def test_concurrent_replay_is_deduplicated_across_store_connections(self):
        delivery = str(uuid.uuid4())
        raw, headers = request("secret", payload(), delivery=delivery)
        results = []

        def send_once():
            store = Store(self.path)
            try:
                results.append(Receiver("secret", store, FakeGitHub()).handle(headers, raw))
            finally:
                store.close()

        threads = [threading.Thread(target=send_once) for _ in range(2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        self.assertCountEqual(results, [(202, "accepted"), (200, "duplicate")])
        self.assertEqual(self.store.count("kanban_wakeups"), 1)

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
        self.assertEqual(self.store.count("kanban_wakeups"), 0)

    def test_exact_marker_lookalikes_remain_human_wakeups(self):
        lookalikes = (
            " <!-- neo-dev -->", "<!-- neo-dev --> ", "<!-- NEO-DEV -->",
            "prefix<!-- neo-dev -->", "<!-- neo-dev -->suffix", "<!-- neo-dev-->",
        )
        for body in lookalikes:
            with self.subTest(body=body):
                self.assertEqual(self.send(payload(event="issue_comment", body=body),
                                           "issue_comment"), (202, "accepted"))
        self.assertEqual(self.store.count("kanban_wakeups"), len(lookalikes))

    def test_subsequent_human_delivery_creates_another_same_inbox_wakeup(self):
        first, second = str(uuid.uuid4()), str(uuid.uuid4())
        self.send(delivery=first)
        self.send(payload(event="issue_comment"), "issue_comment", second)
        runner = FakeRunner()
        consumer = Consumer(self.store, runner, self.github)
        self.assertTrue(consumer.run_one())
        self.assertTrue(consumer.run_one())
        self.assertEqual([call["delivery_id"] for call in runner.calls], [first, second])
        self.assertEqual([call["issue_number"] for call in runner.calls], [77, 77])

    def test_public_revalidation_blocks_card_when_live_issue_is_ineligible(self):
        self.send()
        github = FakeGitHub(labels=())
        runner = FakeRunner()
        self.assertFalse(Consumer(self.store, runner, github, max_attempts=1).run_one())
        self.assertEqual(github.calls, [(REPOSITORY, 77)])
        self.assertEqual(runner.calls, [])
        self.assertEqual(self.store.list_wakeups()[0]["status"], "dead")

    def test_retry_reuses_delivery_identity_and_task_runner_deduplicates(self):
        delivery = str(uuid.uuid4())
        self.send(delivery=delivery)
        runner = FlakyRunner()
        consumer = Consumer(self.store, runner, self.github, max_attempts=2)
        self.assertFalse(consumer.run_one(now=100))
        self.assertTrue(consumer.run_one(now=101))
        self.assertEqual([call["delivery_id"] for call in runner.calls], [delivery, delivery])
        self.assertEqual(self.store.list_wakeups()[0]["status"], "created")

    def test_security_and_payload_limits_remain_fail_closed(self):
        data = payload()
        raw, headers = request("wrong", data)
        self.assertEqual(self.receiver.handle(headers, raw), (401, "invalid_signature"))
        self.assertEqual(self.send(data, delivery="not-a-uuid"), (400, "invalid_delivery"))
        wrong_repo = payload(repository={"full_name": "someone/else"})
        self.assertEqual(self.send(wrong_repo), (403, "wrong_repository"))
        large = payload(event="issue_comment", body="x" * (Limits().comment_chars + 1))
        self.assertEqual(self.send(large, "issue_comment"), (400, "invalid_payload"))
        self.assertEqual(self.store.count("kanban_wakeups"), 0)

    def test_rate_and_concurrency_limits_fail_closed(self):
        limited = Receiver("secret", self.store, self.github, rate_limit=1)
        first_raw, first_headers = request("secret", payload())
        second_raw, second_headers = request("secret", payload())
        self.assertEqual(limited.handle(first_headers, first_raw), (202, "accepted"))
        self.assertEqual(limited.handle(second_headers, second_raw), (429, "rate_limited"))
        busy = Receiver("secret", self.store, self.github, concurrency_limit=1)
        self.assertTrue(busy.semaphore.acquire(blocking=False))
        try:
            self.assertEqual(busy.handle(second_headers, second_raw), (503, "busy"))
        finally:
            busy.semaphore.release()

    def test_expired_lease_recovers_and_stale_owner_is_rejected(self):
        self.send()
        first = self.store.claim(now=100, lease_seconds=5)
        second = self.store.claim(now=106, lease_seconds=5)
        self.assertEqual(first["id"], second["id"])
        self.assertNotEqual(first["claim_token"], second["claim_token"])
        with self.assertRaisesRegex(RuntimeError, "no longer owned"):
            self.store.complete(first["id"], first["claim_token"], "stale", now=107)
        self.store.complete(second["id"], second["claim_token"], "current", now=107)

    def test_attempt_exhaustion_dead_letters_without_another_claim(self):
        self.send()
        first = self.store.claim(now=100, max_attempts=2)
        self.store.fail(first["id"], first["claim_token"], "first", 2, now=101)
        second = self.store.claim(now=102, max_attempts=2)
        self.store.fail(second["id"], second["claim_token"], "second", 2, now=103)
        self.assertIsNone(self.store.claim(now=104, max_attempts=2))
        self.assertEqual(self.store.list_wakeups()[0]["status"], "dead")


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


class StoreInitializationAndMigrationTest(unittest.TestCase):
    def test_simultaneous_fresh_database_initialization(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "fresh.sqlite")

            def initialize(_):
                store = Store(path)
                store.close()
                return True

            with ThreadPoolExecutor(max_workers=4) as executor:
                self.assertEqual(list(executor.map(initialize, range(4))), [True] * 4)

    def test_legacy_wakeups_migrate_once_as_blocked_and_never_run(self):
        with tempfile.TemporaryDirectory() as directory:
            path = os.path.join(directory, "legacy.sqlite")
            db = sqlite3.connect(path)
            db.executescript("""
                CREATE TABLE deliveries(delivery_id TEXT PRIMARY KEY, received_at REAL NOT NULL);
                CREATE TABLE active_work(
                  id INTEGER PRIMARY KEY, repository TEXT NOT NULL, issue_number INTEGER NOT NULL,
                  idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL, attempts INTEGER NOT NULL,
                  lease_until REAL, claim_token TEXT, task_id TEXT, last_error TEXT,
                  processed_wakeup_id INTEGER, created_at REAL NOT NULL, updated_at REAL NOT NULL);
                CREATE TABLE wakeups(
                  id INTEGER PRIMARY KEY, delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries,
                  work_id INTEGER NOT NULL REFERENCES active_work, event TEXT NOT NULL,
                  action TEXT NOT NULL, comment_id INTEGER, command TEXT, created_at REAL NOT NULL);
            """)
            deliveries = [str(uuid.uuid4()) for _ in range(3)]
            for index, (delivery, issue) in enumerate(
                    zip(deliveries, (6, 13, 84)), start=1):
                db.execute("INSERT INTO active_work VALUES (?,?,?,?,?,0,NULL,NULL,NULL,NULL,NULL,1,1)",
                           (index, REPOSITORY, issue, delivery, "waiting"))
                db.execute("INSERT INTO deliveries VALUES (?,?)", (delivery, index))
                db.execute("INSERT INTO wakeups VALUES (?,?,?,?,?,?,?,?)",
                           (index, delivery, index, "issue_comment", "created", 9000 + index,
                            None, index))
            db.commit()
            db.close()

            store = Store(path)
            self.assertEqual(store.count("kanban_wakeups"), 3)
            rows = store.list_wakeups()
            self.assertEqual({row["status"] for row in rows}, {"blocked_legacy"})
            self.assertEqual([row["delivery_id"] for row in rows], deliveries)
            self.assertEqual([row["issue_number"] for row in rows], [6, 13, 84])
            new_delivery = str(uuid.uuid4())
            self.assertEqual(store.accept({
                "delivery_id": new_delivery, "repository": REPOSITORY, "issue_number": 77,
                "event": "issues", "action": "labeled", "comment_id": None,
            }), "accepted")
            claimed = store.claim()
            self.assertEqual(claimed["delivery_id"], new_delivery)
            store.close()
            reopened = Store(path)
            self.assertEqual(reopened.count("kanban_wakeups"), 4)
            self.assertEqual(sum(row["status"] == "blocked_legacy"
                                 for row in reopened.list_wakeups()), 3)
            reopened.close()


class CanonicalContractTest(unittest.TestCase):
    def test_canonical_specs_describe_inbox_and_frozen_artifacts_without_controller(self):
        root = pathlib.Path(__file__).parents[3]
        webhook = (root / "openspec/specs/github-webhook-handoff/spec.md").read_text()
        governed = (root / "openspec/specs/governed-development-workflow/spec.md").read_text()
        for expected in ("one durable Kanban wakeup", "persistent `dev` profile",
                         "`private-dev` Kanban inbox", "canonical `X-GitHub-Delivery`"):
            self.assertIn(expected, webhook)
        self.assertIn("byte-frozen", governed)
        self.assertIn("progress", governed)
        self.assertIn("Kanban", governed)
        self.assertNotIn("coalesced", webhook.casefold())
        self.assertNotIn("controller", webhook.casefold())
        self.assertNotIn("controller", governed.casefold())
        self.assertFalse((root / "openspec/changes/issue-77-enforce-container-boundary").exists())


if __name__ == "__main__":
    unittest.main()

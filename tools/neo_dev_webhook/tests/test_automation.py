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
TASK_KEY = "12345678-1234-4abc-8def-123456789abc"
WAKEUP_KEY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


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


class FakeFinalizer:
    def __init__(self, verified):
        self.verified = verified
        self.calls = []

    def verify(self, repository, issue_number, idempotency_key):
        self.calls.append((repository, issue_number, idempotency_key))
        if isinstance(self.verified, list):
            return self.verified.pop(0)
        return self.verified


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

    def test_approval_command_and_full_sha_are_persisted_for_phase_continuation(self):
        command = "/approve-spec " + "a" * 40
        data = payload(event="issue_comment", body=command)
        self.assertEqual(self.send(data, event="issue_comment"), (202, "accepted"))
        claimed = self.store.claim()
        self.assertEqual(claimed["wakeups"][0]["command"], command)

    def test_revision_request_is_persisted_verbatim_from_authorized_comment(self):
        command = "/revise-spec clarify the failure scenario"
        data = payload(event="issue_comment", body=command)
        self.assertEqual(self.send(data, event="issue_comment"), (202, "accepted"))
        claimed = self.store.claim()
        self.assertEqual(claimed["wakeups"][0]["command"], command)

    def test_fix_request_is_persisted_verbatim_from_authorized_comment(self):
        command = "/fix repair the retry race"
        data = payload(event="issue_comment", body=command)
        self.assertEqual(self.send(data, event="issue_comment"), (202, "accepted"))
        claimed = self.store.claim()
        self.assertEqual(claimed["wakeups"][0]["command"], command)

    def test_accept_requires_exact_full_implementation_sha_and_cancel_is_persisted(self):
        commands = ["/accept " + "b" * 40, "/cancel", "/accept"]
        for command in commands:
            data = payload(event="issue_comment", body=command)
            self.assertEqual(self.send(data, event="issue_comment"), (202, "accepted"))
        claimed = self.store.claim()
        self.assertEqual(
            [wakeup["command"] for wakeup in claimed["wakeups"]],
            [commands[0], commands[1], "finding"],
        )

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
        self.assertEqual(work["status"], "waiting")
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

    def test_late_wakeup_after_claim_continues_same_persistent_work(self):
        first_delivery = str(uuid.uuid4())
        late_delivery = str(uuid.uuid4())
        self.send(delivery=first_delivery)
        claimed = self.store.claim(now=10, lease_seconds=30, max_attempts=5)

        self.assertEqual(self.send(delivery=late_delivery), (202, "accepted"))
        self.store.complete(claimed["id"], claimed["claim_token"], "task-first", now=11)

        successor = self.store.claim(now=12, lease_seconds=30, max_attempts=5)
        self.assertIsNotNone(successor)
        self.assertEqual(successor["id"], claimed["id"])
        self.assertEqual(successor["idempotency_key"], first_delivery)
        self.assertEqual([item["delivery_id"] for item in successor["wakeups"]],
                         [first_delivery, late_delivery])
        live_count = self.store.db.execute(
            "SELECT count(*) FROM active_work WHERE repository=? AND issue_number=? "
            "AND status IN ('queued','processing')", (REPOSITORY, 77),
        ).fetchone()[0]
        self.assertEqual(live_count, 1)

    def test_late_wakeup_after_terminal_failure_becomes_successor_work(self):
        first_delivery = str(uuid.uuid4())
        late_delivery = str(uuid.uuid4())
        self.send(delivery=first_delivery)
        claimed = self.store.claim(now=10, lease_seconds=30, max_attempts=1)
        self.assertEqual(self.send(delivery=late_delivery), (202, "accepted"))

        self.store.fail(claimed["id"], claimed["claim_token"], "terminal", 1, now=11)
        successor = self.store.claim(now=12, lease_seconds=30, max_attempts=1)
        self.assertIsNotNone(successor)
        self.assertNotEqual(successor["id"], claimed["id"])
        self.assertEqual(successor["idempotency_key"], late_delivery)
        self.assertEqual([item["delivery_id"] for item in successor["wakeups"]], [late_delivery])

    def test_late_wakeup_after_exhausted_lease_becomes_successor_work(self):
        first_delivery = str(uuid.uuid4())
        late_delivery = str(uuid.uuid4())
        self.send(delivery=first_delivery)
        claimed = self.store.claim(now=10, lease_seconds=1, max_attempts=1)
        self.assertEqual(self.send(delivery=late_delivery), (202, "accepted"))

        successor = self.store.claim(now=12, lease_seconds=30, max_attempts=1)
        self.assertIsNotNone(successor)
        self.assertNotEqual(successor["id"], claimed["id"])
        self.assertEqual(successor["idempotency_key"], late_delivery)
        self.assertEqual([item["delivery_id"] for item in successor["wakeups"]], [late_delivery])
        dead = self.store.db.execute(
            "SELECT status FROM active_work WHERE id=?", (claimed["id"],)
        ).fetchone()["status"]
        self.assertEqual(dead, "dead")

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

    def test_waiting_issue_does_not_consume_project_worker_capacity(self):
        first = str(uuid.uuid4())
        second = str(uuid.uuid4())
        for issue_number, delivery in ((13, first), (42, second)):
            self.store.accept({"delivery_id": delivery, "event": "issues", "action": "labeled",
                               "repository": REPOSITORY, "issue_number": issue_number,
                               "comment_id": None, "command": None})
        claimed = self.store.claim(now=10)
        self.assertEqual(claimed["issue_number"], 13)
        self.store.complete(claimed["id"], claimed["claim_token"], "task-13", now=11)
        next_claim = self.store.claim(now=12)
        self.assertEqual(next_claim["issue_number"], 42)

    def test_valid_processing_lease_blocks_other_issue_and_expired_lease_recovers(self):
        for issue_number in (13, 42):
            self.store.accept({"delivery_id": str(uuid.uuid4()), "event": "issues",
                               "action": "labeled", "repository": REPOSITORY,
                               "issue_number": issue_number, "comment_id": None,
                               "command": None})

        first_claim = self.store.claim(now=10, lease_seconds=5)
        self.assertEqual(first_claim["issue_number"], 13)
        self.assertIsNone(self.store.claim(now=14, lease_seconds=5))

        recovered = self.store.claim(now=16, lease_seconds=5)
        self.assertEqual(recovered["id"], first_claim["id"])
        self.assertEqual(recovered["attempts"], 2)

    def test_same_issue_wakeup_reuses_waiting_work_and_lifecycle_identity(self):
        lifecycle = str(uuid.uuid4())
        self.store.accept({"delivery_id": lifecycle, "event": "issues", "action": "labeled",
                           "repository": REPOSITORY, "issue_number": 13,
                           "comment_id": None, "command": None})
        claimed = self.store.claim(now=10)
        self.store.complete(claimed["id"], claimed["claim_token"], "task-13", now=11)

        wakeup = str(uuid.uuid4())
        self.store.accept({"delivery_id": wakeup, "event": "issue_comment", "action": "created",
                           "repository": REPOSITORY, "issue_number": 13,
                           "comment_id": 123, "command": "/fix keep coalescing"})

        resumed = self.store.claim(now=12)
        self.assertEqual(resumed["id"], claimed["id"])
        self.assertEqual(resumed["idempotency_key"], lifecycle)
        self.assertEqual([item["delivery_id"] for item in resumed["wakeups"]],
                         [lifecycle, wakeup])
        self.assertEqual(self.store.count("active_work"), 1)

    def test_manual_closure_cannot_finalize_without_controller_merge_verification(self):
        lifecycle = str(uuid.uuid4())
        self.store.accept({"delivery_id": lifecycle, "event": "issues", "action": "labeled",
                           "repository": REPOSITORY, "issue_number": 13,
                           "comment_id": None, "command": None})
        work = self.store.claim(now=1)
        self.store.complete(work["id"], work["claim_token"], "phase-task", now=2)
        closed = payload(action="closed", issue={
            "number": 13, "state": "closed", "labels": [{"name": "neo-dev"}],
        })
        receiver = Receiver("secret", self.store, self.github)
        raw, headers = request("secret", closed)
        self.assertEqual(receiver.handle(headers, raw), (202, "finalization_pending"))
        consumer = Consumer(self.store, FakeRunner(), self.github, max_attempts=2,
                            finalizer=FakeFinalizer(False))
        self.assertFalse(consumer.run_one())
        self.assertFalse(consumer.run_one())
        self.assertEqual(self.store.get_active(REPOSITORY, 13)["status"], "waiting")
        request_state = self.store.db.execute(
            "SELECT status,last_error FROM finalization_requests"
        ).fetchone()
        self.assertEqual(request_state["status"], "blocked")
        self.assertIn("rejected closure", request_state["last_error"])

    def test_closure_before_controller_state_backs_off_then_finalizes(self):
        lifecycle = str(uuid.uuid4())
        self.store.accept({"delivery_id": lifecycle, "event": "issues", "action": "labeled",
                           "repository": REPOSITORY, "issue_number": 13,
                           "comment_id": None, "command": None})
        work = self.store.claim(now=1)
        self.store.complete(work["id"], work["claim_token"], "phase-task", now=2)
        self.store.request_finalization(REPOSITORY, 13, str(uuid.uuid4()))
        finalizer = FakeFinalizer([None, True])
        consumer = Consumer(self.store, FakeRunner(), self.github, max_attempts=2,
                            finalizer=finalizer)
        self.assertFalse(consumer.run_one())
        pending = self.store.db.execute("SELECT * FROM finalization_requests").fetchone()
        self.assertEqual(pending["status"], "pending")
        self.assertEqual(pending["attempts"], 0)
        self.assertIsNone(self.store.claim_finalization(now=pending["next_attempt_at"] - 1))
        claimed = self.store.claim_finalization(now=pending["next_attempt_at"])
        self.store.finish_finalization(claimed["id"], finalizer.verify(
            claimed["repository"], claimed["issue_number"], claimed["idempotency_key"]
        ), None, now=pending["next_attempt_at"])
        self.assertEqual(self.store.get_active(REPOSITORY, 13)["status"], "completed")

    def test_successful_phase_handoffs_reset_retry_budget_beyond_six_wakeups(self):
        lifecycle = str(uuid.uuid4())
        for phase in range(8):
            delivery = lifecycle if phase == 0 else str(uuid.uuid4())
            self.store.accept({"delivery_id": delivery, "event": "issue_comment",
                               "action": "created", "repository": REPOSITORY,
                               "issue_number": 13, "comment_id": phase, "command": "finding"})
            work = self.store.claim(now=100 + phase, max_attempts=5)
            self.assertIsNotNone(work)
            self.store.complete(work["id"], work["claim_token"], "same-controller", now=100 + phase)
            persisted = self.store.get_active(REPOSITORY, 13)
            self.assertEqual(persisted["attempts"], 0)
            self.assertEqual(persisted["idempotency_key"], lifecycle)

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

    def test_pending_attestation_does_not_crash_or_consume_decision(self):
        broker = mock.Mock()
        path = mock.sentinel.path
        record = {
            "decision": "proceed", "issue_number": 13,
            "workflow_id": TASK_KEY,
        }
        broker.claim_decision.return_value = (path, record)
        dispatcher = mock.Mock()
        dispatcher.attest.side_effect = RuntimeError("governed PR not available yet")
        consumer = Consumer(
            self.store, FakeRunner(), self.github,
            dispatcher=dispatcher, capability_broker=broker,
        )

        self.assertFalse(consumer.run_one())
        dispatcher.attest.assert_called_once_with(REPOSITORY, 13, TASK_KEY, None)
        broker.finish_decision.assert_not_called()

    def test_merge_worker_waits_for_controller_archive_attestation_then_auto_resumes(self):
        merge_wakeup = {
            "comment_id": 9001,
            "command": "/merge",
            "created_at": "2026-08-07T00:00:02Z",
            "delivery_id": WAKEUP_KEY,
        }
        broker = mock.Mock()
        path = mock.sentinel.path
        record = {
            "decision": "proceed",
            "issue_number": 13,
            "workflow_id": TASK_KEY,
            "execution_id": "same-worker-execution",
            "current_wakeup": merge_wakeup,
        }
        broker.claim_decision.return_value = (path, record)
        dispatcher = mock.Mock()
        dispatcher.attest.side_effect = [
            RuntimeError("archive SHA and successful checks are not controller-persisted"),
            {
                "controller": {
                    "execution": {
                        "lifecycle_state": "archive_ci_verified",
                        "archive_sha": "d" * 40,
                    },
                },
            },
        ]
        dispatcher.dispatch.return_value = {
            "controller": {
                "execution": {
                    "lifecycle_state": "merge_authorized",
                    "archive_sha": "d" * 40,
                },
            },
            "github": {"current_wakeup": merge_wakeup},
        }
        runner = FakeRunner()
        consumer = Consumer(
            self.store, runner, self.github,
            dispatcher=dispatcher, capability_broker=broker,
        )

        self.assertFalse(consumer.run_one())
        self.assertEqual(runner.calls, [])
        broker.finish_decision.assert_not_called()

        self.assertTrue(consumer.run_one())
        dispatcher.attest.assert_called_with(
            REPOSITORY, 13, TASK_KEY, merge_wakeup,
        )
        dispatcher.dispatch.assert_called_once_with(
            "resume", REPOSITORY, 13, TASK_KEY, merge_wakeup,
        )
        resumed_work, resumed_identity = runner.calls[0]
        self.assertEqual(resumed_identity, TASK_KEY)
        self.assertEqual(resumed_work["task_id"], "same-worker-execution")
        self.assertEqual(resumed_work["wakeups"], [merge_wakeup])
        broker.finish_decision.assert_called_once_with(path, record)

    def test_implementation_attestation_autonomously_starts_independent_review(self):
        broker = mock.Mock()
        path = mock.sentinel.path
        record = {"decision": "proceed", "issue_number": 13,
                  "workflow_id": TASK_KEY, "execution_id": "implementation-worker"}
        broker.claim_decision.return_value = (path, record)
        evidence = {"sha": "a" * 40, "approved_spec_sha": "9" * 40}
        dispatcher = mock.Mock()
        dispatcher.attest.return_value = {"controller": {
            "execution": {"lifecycle_state": "independent_review"},
            "review_evidence": evidence,
        }}
        dispatcher.review.return_value = {"controller": {
            "execution": {"lifecycle_state": "independent_review"},
            "status": "reviewer_starting",
        }}
        consumer = Consumer(self.store, FakeRunner(), self.github,
                            dispatcher=dispatcher, capability_broker=broker)

        self.assertTrue(consumer.run_one())

        dispatcher.review.assert_called_once_with(REPOSITORY, 13, TASK_KEY, evidence)
        broker.finish_decision.assert_called_once_with(path, record)

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
            task_id = runner.create({"issue_number": 77, "wakeups": [{"delivery_id": WAKEUP_KEY}]}, TASK_KEY)
        self.assertEqual(task_id, "kanban-77")
        self.assertEqual(run.call_args_list[0].args[0], ["python3", "/test/task.py", "--help"])
        argv = run.call_args_list[1].args[0]
        self.assertEqual(argv[:4], ["python3", "/test/task.py", "SnapFlow issue #77", "--body"])
        body = argv[4]
        self.assertIn("Repository: kingkill85/snap-flow", body)
        self.assertIn("Issue: #77", body)
        self.assertIn("Current phase: specification", body)
        self.assertIn("/opt/data/profiles/dev/projects/snapflow.md", body)
        self.assertIn("ONLY OpenSpec proposal/design/delta specs/tasks", body)
        self.assertIn("/approve-spec <full-sha>", body)
        self.assertIn("Heartbeats are liveness only", body)
        self.assertIn(f"Durable workflow identity: {TASK_KEY}", body)
        self.assertIn("no project-command capability", body)
        self.assertEqual(argv[-6:], ["--max-runtime", "2h", "--workspace",
                                     "dir:/opt/data/profiles/dev", "--idempotency-key",
                                     str(uuid.uuid5(uuid.UUID(TASK_KEY), str(uuid.UUID(WAKEUP_KEY))))])
        self.assertNotIn("shell", run.call_args.kwargs)
        self.assertNotIn("/opt/data/bin/neo-dev-project-control", argv[argv.index("--body") + 1])
        self.assertNotIn("ssh:snapflow-dev", argv)

    def test_revision_and_fix_prompts_include_exact_trusted_request_and_reuse_worker(self):
        help_result = mock.Mock(stdout="title --body --max-runtime --workspace --idempotency-key")
        for command in ("/revise-spec clarify exact retry behavior", "/fix repair exact retry race"):
            with self.subTest(command=command), mock.patch(
                "subprocess.run", side_effect=[help_result, mock.Mock(
                    stdout='{"task_id":"same-task","durable":true}\n')],
            ) as run:
                runner = TaskRunner(script_path="/test/task.py")
                work = {"issue_number": 77, "task_id": "same-task", "wakeups": [{
                    "delivery_id": WAKEUP_KEY, "event": "issue_comment",
                    "action": "created", "command": command,
                }]}
                self.assertEqual(runner.create(work, TASK_KEY), "same-task")
                body = run.call_args_list[1].args[0][4]
                self.assertIn(command, body)
                self.assertIn("product implementation is forbidden", body)
                self.assertIn("dispatch operation already performed by the consumer: resume", body)
                self.assertIn("never create a duplicate worker/session", body)

    def test_controller_card_is_fixed_and_is_not_the_implementation_target(self):
        with self.assertRaises(TypeError):
            TaskRunner(script_path="/test/task.py", workspace="ssh:snapflow-dev")

    def test_task_runner_max_runtime_is_configurable(self):
        help_result = mock.Mock(stdout="usage: task.py title --body BODY --max-runtime MAX_RUNTIME --workspace WORKSPACE --idempotency-key KEY")
        completed = mock.Mock(stdout='{"task_id":"kanban-77","durable":true}\n')
        runner = TaskRunner(script_path="/test/task.py", max_runtime="45m")
        with mock.patch("subprocess.run", side_effect=[help_result, completed]) as run:
            runner.create({"issue_number": 77, "wakeups": [{"delivery_id": WAKEUP_KEY}]}, TASK_KEY)
        self.assertIn("45m", run.call_args_list[1].args[0])

    def test_task_runner_rejects_empty_or_nonstring_idempotency_keys_before_execution(self):
        for key in ("", "   ", 0, -1, None):
            with self.subTest(key=key):
                runner = TaskRunner(script_path="/test/task.py")
                with mock.patch("subprocess.run") as run:
                    with self.assertRaises(ValueError):
                        runner.create({"issue_number": 77, "wakeups": [{"delivery_id": WAKEUP_KEY}]}, key)
                run.assert_not_called()

    def test_task_runner_rejects_ambiguous_or_unrelated_json_ids(self):
        help_result = mock.Mock(stdout="usage: task.py title --body BODY --max-runtime MAX_RUNTIME --workspace WORKSPACE --idempotency-key KEY")
        invalid_outputs = (
            '{"id":"dispatcher-wakeup-1"}\n',
            '{"data":{"id":"request-1"}}\n',
            '{"task_id":"kanban-77","durable":true}\n{"id":"other"}\n',
            '{"task_id":"kanban-77","durable":false}\n',
            '{"task_id":"","durable":true}\n',
            '{"task_id":"   ","durable":true}\n',
            '{"task_id":0,"durable":true}\n',
            '{"task_id":-1,"durable":true}\n',
            '{"task_id":1,"durable":true}\n',
        )
        for output in invalid_outputs:
            with self.subTest(output=output):
                runner = TaskRunner(script_path="/test/task.py")
                with mock.patch("subprocess.run", side_effect=[help_result, mock.Mock(stdout=output)]):
                    with self.assertRaises(RuntimeError):
                        runner.create({"issue_number": 77, "wakeups": [{"delivery_id": WAKEUP_KEY}]}, TASK_KEY)

    def test_task_runner_rejects_incompatible_real_help_shape(self):
        runner = TaskRunner(script_path="/test/task.py")
        with mock.patch("subprocess.run", return_value=mock.Mock(stdout="usage: task.py title --body BODY")):
            with self.assertRaisesRegex(RuntimeError, "incompatible"):
                runner.create({"issue_number": 77, "wakeups": [{"delivery_id": WAKEUP_KEY}]}, TASK_KEY)


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

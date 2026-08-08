import json
import pathlib
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from unittest import mock

from neo_dev_webhook.automation import Consumer, Receiver, Store
from neo_dev_webhook.project_control import (
    Controller, FileResolutionStore, GovernedTarget, Registry, TerminalObservation,
)
from neo_dev_webhook.tests.test_automation import FakeGitHub, FakeRunner, payload, request
from neo_dev_webhook.tests.test_independent_review import SPEC_SHA, valid_evidence


WORKFLOW = "ecfc6f5a-931b-11f1-9ca7-8a64afe8ca67"
SESSION = "019fe11f-7edd-7420-ba7a-9753456b43f1"
SPEC = "a1c8ce11beb19b9603fae644a5d428890ce87cbb"
IMPLEMENTATION = "e22d7580520c8e1ba63c811a3514169e02ceee0b"
TARGET = GovernedTarget(
    repository="kingkill85/snap-flow", issue_number=84, project="snapflow-dev",
    session="snapflow-dev", window="issue-84", worktree="/workspace/snap-flow-issue-84",
    branch="feature/issue-84", worker="Codex",
)
HANDOFF = {
    "phase": "implementation_complete", "approved_spec_sha": SPEC,
    "implementation_sha": IMPLEMENTATION, "pull_request_number": 85,
}
TERMINAL = {"exit_code": 0, "semantic_outcome": "correctable", "resumable": True}


def _replace_spec(value):
    if isinstance(value, dict):
        return {key: _replace_spec(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_replace_spec(item) for item in value]
    return SPEC if value == SPEC_SHA else value


class Executor:
    def __init__(self): self.windows = []
    def run(self, argv, *, timeout):
        if argv[:2] == ("tmux", "list-windows"):
            return "".join(f"{window}\n" for window in self.windows)
        if argv[:2] == ("tmux", "new-window"):
            self.windows.append(argv[argv.index("-n") + 1])
            return ""
        raise AssertionError(argv)


class Supervisor:
    def __init__(self): self.starts, self.live = 0, False
    def is_live(self, operation, key, session_id=None, run_id=None): return self.live
    def start(self, operation, key, session_id=None, run_id=None):
        self.starts += 1
        self.live = True


class InProcessDispatcher:
    def __init__(self, controller, evidence, status_transform=None):
        self.controller, self.evidence = controller, evidence
        self.status_transform = status_transform or (lambda value: value)
        self.attestations = 0
        self.reviews = 0

    def status(self, repository, issue_number, workflow_id):
        result = self.controller.execute(
            "status", repository, issue_number, workflow_id,
        )
        return {"controller": self.status_transform(result)}

    def attest(self, repository, issue_number, workflow_id):
        self.attestations += 1
        return {"controller": self.controller.execute(
            "attest", repository, issue_number, workflow_id, self.evidence,
        )}

    def review(self, repository, issue_number, workflow_id, evidence):
        self.reviews += 1
        return {"controller": self.controller.execute(
            "review", repository, issue_number, workflow_id, evidence,
        )}


class RealStatusMigrationIntegrationTest(unittest.TestCase):
    def run_case(self, *, terminal=TERMINAL, status_transform=None,
                 evidence_mutation=None, transition_mutation=None):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            state_store = FileResolutionStore(root / "controller-state.json")
            initial = state_store.bind(WORKFLOW, TARGET)
            review_state = {
                "implementation_session_id": SESSION, "approved_spec_sha": SPEC,
                "approval_artifact_sha": SPEC, "review_phase": "awaiting_implementation",
                "review_generation": 0, "fix_cycle": 0, "reviewed_sha": None,
                "reviewer_session_id": None,
            }
            observation = TerminalObservation(**terminal) if terminal is not None else None
            state_store.save(WORKFLOW, initial, replace(
                initial, codex_session_id=SESSION, phase="exited_resumable",
                terminal=observation, lifecycle_state="spec_approved",
                lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha="9" * 40,
                spec_sha=SPEC, approval_at="2026-08-08T00:00:00Z",
                review_state=review_state,
            ))
            evidence = {
                "version": 2, "workflow_id": WORKFLOW, "repository": TARGET.repository,
                "issue_number": 84, "resolution_id": TARGET.resolution_id,
                "expected_state": "spec_approved",
                "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "issue": {"state": "OPEN", "comments": []},
                "pr": {"number": 85, "headRefName": TARGET.branch,
                       "headRefOid": IMPLEMENTATION},
                "checks": [{"state": "SUCCESS", "head_sha": IMPLEMENTATION}],
                "current_wakeup": None,
            }
            if evidence_mutation is not None:
                evidence = evidence_mutation(evidence)
            deterministic = _replace_spec(valid_evidence(
                IMPLEMENTATION, worktree=TARGET.worktree, change="issue-84",
            ))
            transition_values = {
                "verified": True, "blocker": None, "evidence": {
                "lifecycle_state": "independent_review",
                "lifecycle_updated_at": "2026-08-08T01:00:00Z",
                "implementation_sha": IMPLEMENTATION,
                "review_state": {**review_state, "review_phase": "awaiting_review",
                                 "deterministic_evidence": deterministic},
            }}
            if transition_mutation is not None:
                transition_values = transition_mutation(transition_values)
            transition = mock.Mock(**transition_values)
            executor, supervisor = Executor(), Supervisor()
            controller = Controller(Registry((TARGET,)), state_store, executor, supervisor)
            dispatcher = InProcessDispatcher(controller, evidence, status_transform)

            queue = Store(str(root / "queue.sqlite"))
            github = FakeGitHub()
            receiver = Receiver("secret", queue, github)
            raw, headers = request(
                "secret", payload(issue={"number": 84, "state": "open",
                                         "labels": [{"name": "neo-dev"}]}),
                "issues", WORKFLOW,
            )
            self.assertEqual(receiver.handle(headers, raw), (202, "accepted"))
            claimed = queue.claim(now=10)
            queue.complete(claimed["id"], claimed["claim_token"],
                           "implementation-worker", now=11)
            consumer = Consumer(queue, FakeRunner(), github, dispatcher=dispatcher)

            with mock.patch(
                    "neo_dev_webhook.verification.RepositoryGitHubVerifier.verify_next",
                    return_value=transition):
                actionable = consumer.run_one()

            status = controller.execute("status", TARGET.repository, 84, WORKFLOW)
            persisted = state_store.load(WORKFLOW)
            result = {
                "actionable": actionable, "status": status, "persisted": persisted,
                "attestations": dispatcher.attestations, "reviews": dispatcher.reviews,
                "supervisor_starts": supervisor.starts, "windows": executor.windows,
            }
            queue.close()
            return result

    def test_exact_old_issue_84_status_migrates_and_starts_one_reviewer(self):
        result = self.run_case()
        self.assertTrue(result["actionable"])
        terminal = result["status"]["execution"]["terminal"]
        self.assertEqual(terminal, TERMINAL)
        self.assertEqual(set(terminal), {"exit_code", "semantic_outcome", "resumable"})
        persisted = result["persisted"]
        self.assertEqual(persisted.implementation_handoff, HANDOFF)
        self.assertEqual(persisted.lifecycle_state, "independent_review")
        self.assertEqual((result["attestations"], result["reviews"]), (1, 1))
        self.assertEqual((result["supervisor_starts"], result["windows"]),
                         (1, ["issue-84-review-1"]))

    def test_real_status_migration_variants_fail_closed_without_partial_state(self):
        cases = {
            "no_terminal": {"terminal": None},
            "wrong_terminal": {"terminal": {**TERMINAL, "semantic_outcome": "blocked"}},
            "malformed_status": {"status_transform": lambda value: {
                **value, "execution": "malformed",
            }},
            "malformed_terminal": {"status_transform": lambda value: {
                **value, "execution": {**value["execution"], "terminal": {
                    "exit_code": "0", "semantic_outcome": "correctable",
                    "resumable": True,
                }},
            }},
            "wrong_pr": {"evidence_mutation": lambda value: {
                **value, "pr": {**value["pr"], "number": 0},
            }},
            "wrong_head": {"evidence_mutation": lambda value: {
                **value, "pr": {**value["pr"], "headRefOid": "b" * 40},
            }},
            "wrong_spec": {"transition_mutation": lambda value: {
                **value, "verified": False, "blocker": "approved spec SHA is unavailable",
            }},
            "wrong_verifier_sha": {"transition_mutation": lambda value: {
                **value, "evidence": {**value["evidence"], "implementation_sha": "b" * 40},
            }},
        }
        for name, arguments in cases.items():
            with self.subTest(name=name):
                result = self.run_case(**arguments)
                self.assertFalse(result["actionable"])
                if name == "no_terminal":
                    self.assertIsNone(result["status"]["execution"]["terminal"])
                self.assertIsNone(result["persisted"].implementation_handoff)
                self.assertEqual(result["persisted"].lifecycle_state, "spec_approved")
                self.assertEqual((result["reviews"], result["supervisor_starts"],
                                  result["windows"]), (0, 0, []))


if __name__ == "__main__":
    unittest.main()

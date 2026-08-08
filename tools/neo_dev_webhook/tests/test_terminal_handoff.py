import unittest
from dataclasses import replace
from unittest import mock

from neo_dev_webhook.project_control import (
    Controller, GovernedTarget, InMemoryResolutionStore, Registry, WorkState,
)


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
    "phase": "implementation_complete",
    "approved_spec_sha": SPEC,
    "implementation_sha": IMPLEMENTATION,
    "pull_request_number": 85,
}


class TerminalImplementationHandoffTest(unittest.TestCase):
    def setUp(self):
        self.store = InMemoryResolutionStore()
        initial = self.store.bind(WORKFLOW, TARGET)
        state = replace(
            initial, codex_session_id=SESSION, phase="active",
            lifecycle_state="spec_approved", lifecycle_updated_at="2026-08-08T00:00:00Z",
            base_sha="9" * 40, spec_sha=SPEC, approval_at="2026-08-08T00:00:00Z",
            review_state={
                "implementation_session_id": SESSION,
                "approved_spec_sha": SPEC,
                "approval_artifact_sha": SPEC,
                "review_phase": "awaiting_implementation",
                "review_generation": 0,
                "fix_cycle": 0,
                "reviewed_sha": None,
                "reviewer_session_id": None,
            },
        )
        self.store.save(WORKFLOW, initial, state)
        self.collector = mock.Mock()
        self.controller = Controller(
            Registry((TARGET,)), self.store, mock.Mock(), github_collector=self.collector,
        )

    def test_correctable_resumable_terminal_persists_handoff_for_host_finalization(self):
        controller = Controller(Registry((TARGET,)), self.store, mock.Mock())
        result = controller.complete_terminal(
            WORKFLOW, 0, "correctable", True, HANDOFF,
        )
        self.assertEqual(result.lifecycle_state, "spec_approved")
        self.assertEqual(result.phase, "exited_resumable")
        self.assertEqual(result.implementation_handoff, HANDOFF)
        self.assertIsNone(result.implementation_sha)

    def test_correctable_resumable_terminal_attests_exact_sha_and_starts_review(self):
        fresh = {"pr": {"number": 85, "headRefOid": IMPLEMENTATION}}
        self.collector.collect_bound.return_value = fresh
        transition = mock.Mock(verified=True, blocker=None, evidence={
            "lifecycle_state": "independent_review",
            "lifecycle_updated_at": "2026-08-08T01:00:00Z",
            "implementation_sha": IMPLEMENTATION,
            "review_state": {**self.store.load(WORKFLOW).review_state,
                             "review_phase": "awaiting_review",
                             "deterministic_evidence": {"sha": IMPLEMENTATION}},
        })
        with mock.patch("neo_dev_webhook.verification.validate_host_evidence"), \
             mock.patch("neo_dev_webhook.verification.RepositoryGitHubVerifier.verify_next",
                        return_value=transition), \
             mock.patch.object(self.controller, "execute", return_value={}) as execute:
            result = self.controller.complete_terminal(
                WORKFLOW, 0, "correctable", True, HANDOFF,
            )

        self.assertEqual(result.lifecycle_state, "independent_review")
        self.assertEqual(result.implementation_sha, IMPLEMENTATION)
        self.assertEqual(result.phase, "exited_resumable")
        execute.assert_any_call("review", TARGET.repository, 84, WORKFLOW,
                                {"sha": IMPLEMENTATION})

    def test_duplicate_terminal_callback_is_idempotent(self):
        review = {**self.store.load(WORKFLOW).review_state,
                  "review_phase": "reviewing", "reviewed_sha": IMPLEMENTATION,
                  "deterministic_evidence": {"sha": IMPLEMENTATION}}
        current = self.store.load(WORKFLOW)
        advanced = replace(current, phase="exited_resumable",
                           terminal=None, lifecycle_state="independent_review",
                           implementation_sha=IMPLEMENTATION, review_state=review,
                           implementation_handoff=HANDOFF)
        self.store.save(WORKFLOW, current, advanced)
        with mock.patch.object(self.controller, "execute") as execute:
            result = self.controller.complete_terminal(
                WORKFLOW, 0, "correctable", True, HANDOFF,
            )
        self.assertEqual(result, advanced)
        execute.assert_not_called()
        self.collector.collect_bound.assert_not_called()

    def test_duplicate_terminal_callback_requires_complete_canonical_handoff(self):
        review = {**self.store.load(WORKFLOW).review_state,
                  "review_phase": "reviewing", "reviewed_sha": IMPLEMENTATION,
                  "deterministic_evidence": {"sha": IMPLEMENTATION}}
        current = self.store.load(WORKFLOW)
        advanced = replace(current, phase="exited_resumable",
                           lifecycle_state="independent_review",
                           implementation_sha=IMPLEMENTATION, review_state=review,
                           implementation_handoff=HANDOFF)
        self.store.save(WORKFLOW, current, advanced)
        malformed = (
            ({key: value for key, value in HANDOFF.items() if key != "pull_request_number"},
             0, "correctable", True),
            ({**HANDOFF, "approved_spec_sha": "b" * 40}, 0, "correctable", True),
            ({**HANDOFF, "pull_request_number": 999}, 0, "correctable", True),
            ({**HANDOFF, "implementation_sha": "b" * 40}, 0, "correctable", True),
            ({**HANDOFF, "phase": "implementation_started"}, 0, "correctable", True),
            (HANDOFF, 1, "correctable", True),
            (HANDOFF, 0, "blocked", True),
            (HANDOFF, 0, "correctable", False),
        )
        for handoff, exit_code, outcome, resumable in malformed:
            with self.subTest(handoff=handoff, exit_code=exit_code,
                              outcome=outcome, resumable=resumable), \
                    self.assertRaises((ValueError, RuntimeError)):
                self.controller.complete_terminal(
                    WORKFLOW, exit_code, outcome, resumable, handoff,
                )
            self.assertEqual(self.store.load(WORKFLOW), advanced)

    def test_attest_recovery_rejects_fresh_pr_not_bound_to_persisted_handoff(self):
        persisted = Controller(Registry((TARGET,)), self.store, mock.Mock()).complete_terminal(
            WORKFLOW, 0, "correctable", True, HANDOFF,
        )
        fresh = {"pr": {"number": 999, "headRefOid": "b" * 40}}
        transition = mock.Mock(verified=True, blocker=None, evidence={
            "lifecycle_state": "independent_review",
            "lifecycle_updated_at": "2026-08-08T01:00:00Z",
            "implementation_sha": "b" * 40,
            "review_state": {**persisted.review_state, "review_phase": "awaiting_review"},
        })
        with mock.patch("neo_dev_webhook.verification.validate_host_evidence"), \
             mock.patch("neo_dev_webhook.verification.RepositoryGitHubVerifier.verify_next",
                        return_value=transition) as verify:
            with self.assertRaisesRegex(RuntimeError, "persisted implementation handoff"):
                self.controller.execute(
                    "attest", TARGET.repository, TARGET.issue_number, WORKFLOW, fresh,
                )
        verify.assert_not_called()
        state = self.store.load(WORKFLOW)
        self.assertEqual(state.lifecycle_state, "spec_approved")
        self.assertEqual(state.spec_sha, SPEC)
        self.assertEqual(state.implementation_handoff, HANDOFF)

    def test_attest_recovery_rejects_verifier_sha_not_bound_to_persisted_handoff(self):
        persisted = Controller(Registry((TARGET,)), self.store, mock.Mock()).complete_terminal(
            WORKFLOW, 0, "correctable", True, HANDOFF,
        )
        fresh = {"pr": {"number": 85, "headRefOid": IMPLEMENTATION}}
        transition = mock.Mock(verified=True, blocker=None, evidence={
            "lifecycle_state": "independent_review",
            "lifecycle_updated_at": "2026-08-08T01:00:00Z",
            "implementation_sha": "b" * 40,
            "review_state": {**persisted.review_state, "review_phase": "awaiting_review"},
        })
        with mock.patch("neo_dev_webhook.verification.validate_host_evidence"), \
             mock.patch("neo_dev_webhook.verification.RepositoryGitHubVerifier.verify_next",
                        return_value=transition):
            with self.assertRaisesRegex(RuntimeError, "persisted implementation handoff"):
                self.controller.execute(
                    "attest", TARGET.repository, TARGET.issue_number, WORKFLOW, fresh,
                )
        state = self.store.load(WORKFLOW)
        self.assertEqual(state.lifecycle_state, "spec_approved")
        self.assertEqual(state.spec_sha, SPEC)

    def test_missing_malformed_and_stale_handoff_evidence_fail_closed(self):
        invalid = (
            None,
            {**HANDOFF, "implementation_sha": "bad"},
            {**HANDOFF, "approved_spec_sha": "b" * 40},
        )
        for handoff in invalid:
            with self.subTest(handoff=handoff), self.assertRaises((ValueError, RuntimeError)):
                self.controller.complete_terminal(
                    WORKFLOW, 0, "correctable", True, handoff,
                )
            state = self.store.load(WORKFLOW)
            self.assertEqual(state.lifecycle_state, "spec_approved")
            self.assertIsNone(state.implementation_sha)
        self.collector.collect_bound.assert_not_called()

        self.collector.collect_bound.return_value = {
            "pr": {"number": 85, "headRefOid": IMPLEMENTATION},
        }
        with mock.patch("neo_dev_webhook.verification.validate_host_evidence"):
            with self.assertRaisesRegex(RuntimeError, "fresh PR evidence"):
                self.controller.complete_terminal(
                    WORKFLOW, 0, "correctable", True,
                    {**HANDOFF, "pull_request_number": 84},
                )
        state = self.store.load(WORKFLOW)
        self.assertEqual(state.lifecycle_state, "spec_approved")
        self.assertIsNone(state.implementation_sha)


if __name__ == "__main__":
    unittest.main()

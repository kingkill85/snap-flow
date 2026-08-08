from __future__ import annotations

import unittest
import json
import pathlib
import tempfile


class IndependentReviewMigrationTests(unittest.TestCase):
    def test_migrates_inflight_spec_approved_without_reapproval_or_new_implementer(self):
        from tools.neo_dev_webhook.independent_review import migrate_review_state

        session = "12345678-1234-4abc-8def-123456789abc"
        spec = "9fcf912d46afe5fadc40c9fcb7dae3f7ff59f96b"
        migrated = migrate_review_state({
            "lifecycle_state": "spec_approved",
            "codex_session_id": session,
            "spec_sha": spec,
        })

        self.assertEqual(migrated["implementation_session_id"], session)
        self.assertEqual(migrated["approved_spec_sha"], spec)
        self.assertEqual(migrated["review_phase"], "awaiting_implementation")
        self.assertEqual(migrated["review_generation"], 0)
        self.assertNotIn("approval_required", migrated)


class IndependentReviewTopologyTests(unittest.TestCase):
    def test_reviewer_must_be_fresh_and_never_the_implementer(self):
        from tools.neo_dev_webhook.independent_review import begin_review

        state = migrate_fixture()
        with self.assertRaisesRegex(ValueError, "independent"):
            begin_review(state, "a" * 40, state["implementation_session_id"], "run-1", {})

    def test_implementer_prompt_cannot_self_review_or_publish_accept(self):
        from tools.neo_dev_webhook.codex_runtime import continuation_prompt
        prompt = continuation_prompt("kingkill85/snap-flow", 6, "spec_approved")
        self.assertIn("independent fresh-context reviewer", prompt)
        self.assertNotIn("/accept", prompt)
        self.assertNotIn("implementation_verified", prompt)


class IndependentReviewStateMachineTests(unittest.TestCase):
    def test_missing_or_failed_deterministic_evidence_blocks_review_start(self):
        from tools.neo_dev_webhook.independent_review import begin_review
        for mutation in ("missing", "ci_pending", "ci_failure", "wrong_worktree", "ui_missing"):
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                evidence = valid_evidence()
                if mutation == "missing":
                    del evidence["secret_scan"]
                elif mutation == "ci_pending":
                    evidence["checks"][0]["state"] = "PENDING"
                elif mutation == "ci_failure":
                    evidence["checks"][0]["state"] = "FAILURE"
                elif mutation == "wrong_worktree":
                    evidence["worktree"]["correct"] = False
                else:
                    evidence["ui"] = {"required": True, "screenshots": []}
                begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", evidence)

    def test_stale_reviewer_sha_and_malformed_provenance_block(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review
        reviewing = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        for verdict in (clean_verdict(sha="b" * 40), {"disposition": "clean"}):
            with self.subTest(verdict=verdict), self.assertRaises(ValueError):
                apply_verdict(reviewing, "a" * 40, verdict)

    def test_structured_blocking_finding_resumes_same_implementer(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review
        reviewing = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        updated = apply_verdict(reviewing, "a" * 40, finding_verdict("race-1"))
        self.assertEqual(updated["review_phase"], "correction_required")
        self.assertEqual(updated["correction_session_id"], updated["implementation_session_id"])
        self.assertEqual(updated["approved_spec_sha"], migrate_fixture()["approved_spec_sha"])

    def test_fix_changed_sha_requires_new_fresh_reviewer(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review, record_correction
        first = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        fixing = apply_verdict(first, "a" * 40, finding_verdict("race-1"))
        corrected = record_correction(fixing, "b" * 40, fixing["implementation_session_id"])
        self.assertIsNone(corrected["reviewer_session_id"])
        with self.assertRaises(ValueError):
            begin_review(corrected, "b" * 40, reviewer_id(), "run-2", valid_evidence("b" * 40))
        fresh = begin_review(corrected, "b" * 40, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "run-2", valid_evidence("b" * 40))
        self.assertEqual(fresh["review_generation"], 2)

    def test_max_three_fix_cycles_blocks_fourth(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review, record_correction
        state = migrate_fixture()
        for cycle in range(3):
            sha = f"{cycle + 10:040x}"
            reviewer = f"00000000-0000-4000-8000-{cycle + 1:012d}"
            state = begin_review(state, sha, reviewer, f"run-{cycle}", valid_evidence(sha))
            state = apply_verdict(state, sha, finding_verdict(f"finding-{cycle}", sha, reviewer, f"run-{cycle}"))
            state = record_correction(state, f"{cycle + 20:040x}", state["implementation_session_id"])
        sha = "f" * 40
        state = begin_review(state, sha, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "run-4", valid_evidence(sha))
        blocked = apply_verdict(state, sha, finding_verdict("finding-4", sha, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "run-4"))
        self.assertEqual(blocked["review_phase"], "needs_input")
        self.assertIn("maximum 3", blocked["review_disposition"])

    def test_repeated_blocking_finding_blocks_immediately(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review, record_correction
        state = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        state = apply_verdict(state, "a" * 40, finding_verdict("same"))
        state = record_correction(state, "b" * 40, state["implementation_session_id"])
        other = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        state = begin_review(state, "b" * 40, other, "run-2", valid_evidence("b" * 40))
        state = apply_verdict(state, "b" * 40, finding_verdict("same", "b" * 40, other, "run-2"))
        self.assertEqual(state["review_phase"], "needs_input")
        self.assertIn("repeated", state["review_disposition"])

    def test_material_spec_finding_requests_revision_without_editing_spec(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review, render_review_handoff
        state = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        verdict = finding_verdict("spec-gap")
        verdict["findings"][0].update(category="spec-compliance", material_spec_change=True)
        state = apply_verdict(state, "a" * 40, verdict)
        self.assertEqual(state["review_phase"], "needs_input")
        footer = render_review_handoff(state, "a" * 40)
        self.assertIn("/revise-spec <bounded request>", footer)
        self.assertIn("/cancel", footer)
        self.assertNotIn("/accept", footer)

    def test_reviewer_crash_blocks_with_exact_evidence(self):
        from tools.neo_dev_webhook.independent_review import begin_review, record_reviewer_failure
        state = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        state = record_reviewer_failure(state, "timeout after 1800s")
        self.assertEqual(state["review_phase"], "needs_input")
        self.assertIn("timeout after 1800s", state["review_disposition"])

    def test_duplicate_terminal_verdict_is_idempotent(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review
        state = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        verdict = clean_verdict()
        first = apply_verdict(state, "a" * 40, verdict)
        second = apply_verdict(first, "a" * 40, verdict)
        self.assertEqual(first, second)

    def test_clean_review_renders_complete_acceptance_footer(self):
        from tools.neo_dev_webhook.independent_review import apply_verdict, begin_review, render_review_handoff
        state = begin_review(migrate_fixture(), "a" * 40, reviewer_id(), "run-1", valid_evidence())
        state = apply_verdict(state, "a" * 40, clean_verdict())
        self.assertEqual(state["review_phase"], "clean")
        self.assertTrue(render_review_handoff(state, "a" * 40).endswith(
            "/accept " + "a" * 40 + "\n/fix <bounded request>\n/revise-spec <bounded request>\n/cancel"
        ))


class IndependentReviewPersistenceTests(unittest.TestCase):
    def test_legacy_file_state_migrates_and_serializes_review_state(self):
        from tools.neo_dev_webhook.project_control import FileResolutionStore
        from tools.neo_dev_webhook.tests.test_project_control import TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        record = {
            "target": TARGET.as_dict(), "codex_session_id": key, "phase": "active",
            "process_generation": 1, "restart_count": 0, "terminal": None,
            "lifecycle_state": "spec_approved", "lifecycle_updated_at": "2026-08-08T00:00:00Z",
            "base_sha": "0" * 40, "spec_sha": "9fcf912d46afe5fadc40c9fcb7dae3f7ff59f96b",
            "approval_at": "2026-08-08T00:00:00Z",
        }
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "state.json"
            path.write_text(json.dumps({"version": 1, "resolutions": {key: record}}))
            state = FileResolutionStore(path).load(key)
            self.assertEqual(state.review_state["implementation_session_id"], key)
            self.assertEqual(state.review_state["review_phase"], "awaiting_implementation")

    def test_spec_approved_verification_enters_independent_review_not_acceptance_gate(self):
        from tools.neo_dev_webhook.project_control import WorkState
        from tools.neo_dev_webhook.tests.test_verification import EvidenceExecutor, VerificationTest
        from tools.neo_dev_webhook.verification import RepositoryGitHubVerifier
        head = "a" * 40
        evidence = {"head": head, "issue": {"state": "OPEN"},
                    "pr": {"headRefOid": head, "isDraft": True},
                    "comments": [{"body": "/approve-spec " + head}],
                    "checks": [{"state": "SUCCESS"}]}
        with tempfile.TemporaryDirectory() as directory:
            target, head = VerificationTest().repository(pathlib.Path(directory))
            docs = pathlib.Path(target.worktree) / "docs"
            docs.mkdir()
            (docs / "implementation-evidence.md").write_text("evidence\n")
            subprocess_run = __import__("subprocess").run
            subprocess_run(["git", "-C", target.worktree, "add", "docs"], check=True)
            subprocess_run(["git", "-C", target.worktree, "commit", "-m", "test evidence"],
                           check=True, capture_output=True)
            head = subprocess_run(["git", "-C", target.worktree, "rev-parse", "HEAD"],
                                  check=True, capture_output=True, text=True).stdout.strip()
            issue = {"state": "OPEN", "comments": [{"body": "/approve-spec " + head,
                                                       "author": {"login": "kingkill85"}}]}
            pr = {"headRefOid": head, "isDraft": True}
            evidence.update(head=head, issue=issue, pr=pr,
                            comments=issue["comments"])
            transition = RepositoryGitHubVerifier(EvidenceExecutor(issue, pr), evidence).verify_next(
                target, WorkState(target, lifecycle_state="spec_approved",
                                  lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha=head,
                                  spec_sha=head, approval_at="2026-08-08T00:00:00Z")
            )
        self.assertNotEqual(transition.evidence["lifecycle_state"], "implementation_verified")
        self.assertEqual(transition.evidence["lifecycle_state"], "independent_review")

    def test_controller_cannot_enter_acceptance_gate_until_exact_clean_verdict(self):
        from tools.neo_dev_webhook.project_control import Controller, InMemoryResolutionStore, Registry, WorkState
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        store = InMemoryResolutionStore()
        initial = WorkState(TARGET, codex_session_id=key, phase="correctable",
                            lifecycle_state="independent_review",
                            lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha="0" * 40,
                            spec_sha="9" * 40, implementation_sha="a" * 40,
                            approval_at="2026-08-08T00:00:00Z",
                            review_state={**migrate_fixture(), "review_phase": "awaiting_review"})
        store.records[key] = initial
        controller = Controller(Registry([TARGET]), store, FakeExecutor())
        controller.begin_independent_review(key, "a" * 40, reviewer_id(), "run-1", valid_evidence())
        state = controller.record_independent_verdict(key, "a" * 40, clean_verdict(),
                                                      "2026-08-08T00:01:00Z")
        self.assertEqual(state.lifecycle_state, "implementation_verified")
        self.assertEqual(state.implementation_sha, "a" * 40)


class IndependentReviewCanaryTests(unittest.TestCase):
    def test_fixture_canary_exercises_stale_fix_and_clean_review_loop(self):
        from tools.neo_dev_webhook.independent_review_canary import run_canary
        result = run_canary()
        self.assertEqual(result["phases"], [
            "reviewing", "stale_rejected", "correction_required",
            "awaiting_review", "reviewing", "clean",
        ])
        self.assertTrue(result["same_implementer"])
        self.assertTrue(result["fresh_reviewer"])
        self.assertTrue(result["footer"].endswith("/cancel"))

    def test_install_manifest_includes_review_runtime_with_hash_verification(self):
        manifest = json.loads((pathlib.Path(__file__).parents[1] / "controller" /
                               "install-manifest.v1.json").read_text())
        sources = {item["source"] for item in manifest["files"]}
        self.assertIn("../independent_review.py", sources)
        self.assertIn("../independent_review_canary.py", sources)
        self.assertEqual(manifest["verification"], {"backup": True, "sha256": True})


def migrate_fixture():
    from tools.neo_dev_webhook.independent_review import migrate_review_state
    return migrate_review_state({
        "lifecycle_state": "spec_approved",
        "codex_session_id": "12345678-1234-4abc-8def-123456789abc",
        "spec_sha": "9fcf912d46afe5fadc40c9fcb7dae3f7ff59f96b",
    })


def reviewer_id():
    return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


def valid_evidence(sha="a" * 40):
    return {
        "sha": sha,
        "tests": {"focused": "passed", "full": "passed"},
        "lint": "passed", "typecheck": "passed", "build": "passed",
        "openspec": {"validate": "passed", "verify": "passed", "strict": True},
        "checks": [{"sha": sha, "state": "SUCCESS"}],
        "approval_artifacts": {"immutable": True},
        "secret_scan": {"passed": True},
        "worktree": {"correct": True, "clean": True, "synced": True,
                     "tracked_and_relevant_untracked_reviewed": True},
        "ui": {"required": False, "reason": "controller-only change"},
    }


def clean_verdict(sha="a" * 40, reviewer=reviewer_id(), run="run-1"):
    return {"reviewed_sha": sha, "reviewer_session_id": reviewer,
            "reviewer_run_id": run, "disposition": "clean", "findings": []}


def finding_verdict(fingerprint, sha="a" * 40, reviewer=reviewer_id(), run="run-1"):
    return {"reviewed_sha": sha, "reviewer_session_id": reviewer,
            "reviewer_run_id": run, "disposition": "blocking", "findings": [{
                "fingerprint": fingerprint, "severity": "high", "category": "correctness",
                "summary": "retry race", "blocking": True, "material_spec_change": False,
            }]}


if __name__ == "__main__":
    unittest.main()

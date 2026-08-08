from __future__ import annotations

import unittest
import json
import pathlib
import tempfile

SPEC_SHA = "9fcf912d46afe5fadc40c9fcb7dae3f7ff59f96b"


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
                    "checks": [trusted_check(head)]}
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
            evidence.update(head=head, issue=issue, pr=pr, checks=[trusted_check(head)],
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
                            spec_sha=SPEC_SHA, implementation_sha="a" * 40,
                            approval_at="2026-08-08T00:00:00Z",
                            review_state={**migrate_fixture(), "review_phase": "awaiting_review"})
        store.records[key] = initial
        store.records[key] = __import__("dataclasses").replace(
            initial, github_evidence={"pr": {"headRefOid": "a" * 40}},
        )
        controller = Controller(Registry([TARGET]), store, FakeExecutor([
            "a" * 40 + "\n", "", "a" * 40 + f"\trefs/heads/{TARGET.branch}\n",
            "tools/neo_dev_webhook/project_control.py\n",
            "openspec/changes/issue-77/proposal.md\n",
        ]), github_collector=StaticCollector(fresh_github_evidence(TARGET, key, "a" * 40)))
        controller.begin_independent_review(
            key, "a" * 40, reviewer_id(), "run-1",
            valid_evidence(worktree=TARGET.worktree, change="issue-77"),
        )
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


class IndependentReviewEntrypointTests(unittest.TestCase):
    def test_review_entrypoint_persists_intent_and_launches_separate_supervisor(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET

        class Supervisor:
            def __init__(self):
                self.calls = []

            def start(self, operation, key, session_id=None, run_id=None):
                self.calls.append((operation, key, session_id, run_id))

        key = "12345678-1234-4abc-8def-123456789abc"
        implementer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        store = InMemoryResolutionStore()
        initial = store.bind(key, TARGET)
        review = migrate_fixture()
        review.update(implementation_session_id=implementer, review_phase="awaiting_review")
        state = WorkState(
            TARGET, codex_session_id=implementer, phase="exited_resumable",
            lifecycle_state="independent_review", lifecycle_updated_at="2026-08-08T00:00:00Z",
            base_sha="0" * 40, spec_sha=SPEC_SHA, implementation_sha="a" * 40,
            approval_at="2026-08-08T00:00:00Z", review_state=review,
        )
        store.save(key, initial, state)
        supervisor = Supervisor()
        controller = Controller(Registry([TARGET]), store, FakeExecutor(), supervisor)

        result = controller.execute("review", TARGET.repository, TARGET.issue_number, key,
                                    valid_evidence())

        persisted = store.load(key)
        self.assertEqual(result["status"], "reviewer_starting")
        self.assertEqual(persisted.review_state["review_phase"], "reviewer_starting")
        self.assertIsNone(persisted.review_state["reviewer_session_id"])
        self.assertEqual(supervisor.calls, [
            ("review", key, None, persisted.review_state["reviewer_run_id"]),
        ])
        self.assertNotEqual(persisted.review_state["reviewer_run_id"], implementer)

    def test_review_retry_reuses_persisted_run_without_implementer_identity(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET

        class Supervisor:
            def __init__(self): self.calls = []
            def start(self, operation, key, session_id=None, run_id=None):
                self.calls.append((operation, key, session_id, run_id))

        key = "12345678-1234-4abc-8def-123456789abc"
        implementer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        review = migrate_fixture()
        review.update(implementation_session_id=implementer, review_phase="reviewer_starting",
                      reviewer_run_id="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                      reviewed_sha="a" * 40, deterministic_evidence=valid_evidence())
        store = InMemoryResolutionStore()
        store.records[key] = WorkState(
            TARGET, codex_session_id=implementer, phase="exited_resumable",
            lifecycle_state="independent_review", lifecycle_updated_at="2026-08-08T00:00:00Z",
            base_sha="0" * 40, spec_sha=SPEC_SHA, implementation_sha="a" * 40,
            approval_at="2026-08-08T00:00:00Z", review_state=review,
        )
        supervisor = Supervisor()
        controller = Controller(Registry([TARGET]), store, FakeExecutor(["issue-77-review-1\n"]), supervisor)
        controller.execute("review", TARGET.repository, TARGET.issue_number, key, valid_evidence())
        self.assertEqual(supervisor.calls, [])

    def test_runtime_builds_fresh_reviewer_process_and_schema(self):
        from tools.neo_dev_webhook.codex_runtime import (
            REVIEW_COMPLETION_SCHEMA, build_exec_argv, independent_review_prompt,
        )
        from tools.neo_dev_webhook.tests.test_project_control import TARGET
        prompt = independent_review_prompt(TARGET.repository, TARGET.issue_number,
                                           "a" * 40, "9" * 40, "run-1")
        argv = build_exec_argv("review", TARGET, None, pathlib.Path("/tmp/schema"), prompt)
        self.assertEqual(argv[:3], ("/usr/local/bin/codex", "exec", "--json"))
        self.assertNotIn("resume", argv)
        self.assertIn(("--sandbox", "read-only"), tuple(zip(argv, argv[1:])))
        self.assertNotIn("--dangerously-bypass-approvals-and-sandbox", argv)
        self.assertIn("fresh-context independent reviewer", prompt)
        self.assertIn("a" * 40, prompt)
        self.assertIn("9" * 40, prompt)
        self.assertEqual(REVIEW_COMPLETION_SCHEMA["required"],
                         ["reviewed_sha", "reviewer_run_id", "disposition", "findings"])

    def test_correction_prompt_contains_exact_findings_and_preserves_spec(self):
        from tools.neo_dev_webhook.codex_runtime import implementation_correction_prompt
        finding = finding_verdict("IR-001")["findings"]
        prompt = implementation_correction_prompt(
            "kingkill85/snap-flow", 6, SPEC_SHA,
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", finding,
        )
        self.assertIn("IR-001", prompt)
        self.assertIn(SPEC_SHA, prompt)
        self.assertIn("same durable implementation session", prompt)
        self.assertNotIn("/accept", prompt)

    def test_supervisor_callbacks_bind_reviewer_and_render_clean_handoff(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        implementer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        run_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        review = migrate_fixture()
        review.update(implementation_session_id=implementer, review_phase="reviewer_starting",
                      reviewer_run_id=run_id, reviewed_sha="a" * 40,
                      deterministic_evidence=valid_evidence(
                          worktree=TARGET.worktree, change="issue-77"))
        store = InMemoryResolutionStore()
        store.records[key] = WorkState(
            TARGET, codex_session_id=implementer, phase="exited_resumable",
            lifecycle_state="independent_review", lifecycle_updated_at="2026-08-08T00:00:00Z",
            base_sha="0" * 40, spec_sha=SPEC_SHA, implementation_sha="a" * 40,
            approval_at="2026-08-08T00:00:00Z", review_state=review,
            github_evidence={"pr": {"headRefOid": "a" * 40}},
        )
        controller = Controller(Registry([TARGET]), store, FakeExecutor([
            "a" * 40 + "\n", "", "a" * 40 + f"\trefs/heads/{TARGET.branch}\n",
            "tools/neo_dev_webhook/project_control.py\n",
            "openspec/changes/issue-77/proposal.md\n",
        ]), github_collector=StaticCollector(fresh_github_evidence(TARGET, key, "a" * 40)))
        active = controller.observe_reviewer_session(key, reviewer, run_id)
        self.assertEqual(active.review_state["review_phase"], "reviewing")
        verdict = clean_verdict(reviewer=reviewer, run=run_id)
        clean = controller.record_independent_verdict(
            key, "a" * 40, verdict, "2026-08-08T00:01:00Z",
        )
        result = controller._result("review", key, clean, "review_clean")
        self.assertEqual(clean.codex_session_id, implementer)
        self.assertEqual(clean.lifecycle_state, "implementation_verified")
        self.assertTrue(result["handoff"].endswith("/cancel"))

    def test_duplicate_supervisor_clean_terminal_is_idempotent_after_promotion(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        run_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        review = migrate_fixture()
        review.update(review_phase="reviewing", reviewer_session_id=reviewer,
                      reviewer_run_id=run_id, reviewed_sha="a" * 40,
                      deterministic_evidence=valid_evidence(
                          worktree=TARGET.worktree, change="issue-77"))
        store = InMemoryResolutionStore()
        store.records[key] = WorkState(
            TARGET, codex_session_id=review["implementation_session_id"], phase="exited_resumable",
            lifecycle_state="independent_review", lifecycle_updated_at="2026-08-08T00:00:00Z",
            base_sha="0" * 40, spec_sha=SPEC_SHA, implementation_sha="a" * 40,
            approval_at="2026-08-08T00:00:00Z", review_state=review,
            github_evidence={"pr": {"headRefOid": "a" * 40}},
        )
        controller = Controller(Registry([TARGET]), store, FakeExecutor([
            "a" * 40 + "\n", "", "a" * 40 + f"\trefs/heads/{TARGET.branch}\n",
            "tools/neo_dev_webhook/project_control.py\n",
            "openspec/changes/issue-77/proposal.md\n",
        ]), github_collector=StaticCollector(fresh_github_evidence(TARGET, key, "a" * 40)))
        verdict = clean_verdict(reviewer=reviewer, run=run_id)
        first = controller.record_independent_verdict(
            key, "a" * 40, verdict, "2026-08-08T00:01:00Z",
        )
        second = controller.record_independent_verdict(
            key, "a" * 40, verdict, "2026-08-08T00:01:00Z",
        )
        self.assertEqual(second, first)

    def test_review_start_and_clean_promotion_reject_spec_approval_mismatch(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        implementer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        review = migrate_fixture()
        review.update(implementation_session_id=implementer, review_phase="awaiting_review")
        store = InMemoryResolutionStore()
        store.records[key] = WorkState(
            TARGET, codex_session_id=implementer, phase="exited_resumable",
            lifecycle_state="independent_review", lifecycle_updated_at="2026-08-08T00:00:00Z",
            base_sha="0" * 40, spec_sha=review["approved_spec_sha"],
            implementation_sha="a" * 40, approval_at="2026-08-08T00:00:00Z",
            review_state=review,
        )
        controller = Controller(Registry([TARGET]), store, FakeExecutor())
        bad = valid_evidence()
        bad["approved_spec_sha"] = "8" * 40
        with self.assertRaisesRegex((ValueError, RuntimeError), "approved spec"):
            controller.execute("review", TARGET.repository, TARGET.issue_number, key, bad)

        good = valid_evidence()
        controller.execute("review", TARGET.repository, TARGET.issue_number, key, good)
        started = store.load(key)
        reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        controller.observe_reviewer_session(
            key, reviewer, started.review_state["reviewer_run_id"],
        )
        tampered = store.load(key)
        review_state = dict(tampered.review_state)
        review_state["approval_artifact_sha"] = "7" * 40
        store.records[key] = __import__("dataclasses").replace(tampered, review_state=review_state)
        verdict = clean_verdict(reviewer=reviewer, run=started.review_state["reviewer_run_id"])
        with self.assertRaisesRegex((ValueError, RuntimeError), "approval artifact"):
            controller.record_independent_verdict(
                key, "a" * 40, verdict, "2026-08-08T00:01:00Z",
            )

    def test_blocking_verdict_autonomously_resumes_same_implementer_with_findings(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET

        class Supervisor:
            def __init__(self): self.calls = []
            def start(self, operation, key, session_id=None, run_id=None):
                self.calls.append((operation, key, session_id, run_id))

        key = "12345678-1234-4abc-8def-123456789abc"
        implementer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        run_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        review = migrate_fixture()
        review.update(implementation_session_id=implementer, review_phase="reviewing",
                      reviewer_session_id=reviewer, reviewer_run_id=run_id,
                      reviewed_sha="a" * 40, deterministic_evidence=valid_evidence())
        store = InMemoryResolutionStore()
        store.records[key] = WorkState(
            TARGET, codex_session_id=implementer, phase="exited_resumable",
            lifecycle_state="independent_review", lifecycle_updated_at="2026-08-08T00:00:00Z",
            base_sha="0" * 40, spec_sha=SPEC_SHA, implementation_sha="a" * 40,
            approval_at="2026-08-08T00:00:00Z", review_state=review,
        )
        supervisor = Supervisor()
        executor = FakeExecutor(["issue-77\n", "1\t4242\t/workspace/snap-flow-issue-77\n",
                                 "chore/issue-77-openspec-workflow\n", ""])
        controller = Controller(Registry([TARGET]), store, executor, supervisor)
        state = controller.record_independent_verdict(
            key, "a" * 40, finding_verdict("IR-001", reviewer=reviewer, run=run_id),
            "2026-08-08T00:01:00Z",
        )
        self.assertEqual(state.phase, "resuming")
        self.assertEqual(state.codex_session_id, implementer)
        self.assertEqual(supervisor.calls, [("resume", key, implementer, None)])
        self.assertEqual(state.review_state["review_findings"][0]["fingerprint"], "IR-001")

    def test_correction_attestation_records_new_sha_and_returns_to_fresh_review(self):
        import subprocess
        from tools.neo_dev_webhook.independent_review import migrate_review_state
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_verification import EvidenceExecutor, VerificationTest
        with tempfile.TemporaryDirectory() as directory:
            target, spec_sha = VerificationTest().repository(pathlib.Path(directory))
            evidence_doc = pathlib.Path(target.worktree) / "docs" / "implementation-evidence.md"
            evidence_doc.parent.mkdir()
            evidence_doc.write_text("gates passed\n")
            subprocess.run(["git", "-C", target.worktree, "add", "docs"], check=True)
            subprocess.run(["git", "-C", target.worktree, "commit", "-m", "fix implementation"],
                           check=True, capture_output=True)
            fixed_sha = subprocess.run(
                ["git", "-C", target.worktree, "rev-parse", "HEAD"], check=True,
                capture_output=True, text=True,
            ).stdout.strip()
            issue = {"state": "OPEN", "comments": [{"body": "/approve-spec " + spec_sha,
                                                       "author": {"login": "kingkill85"}}]}
            pr = {"headRefOid": fixed_sha, "isDraft": True}
            github = {"issue": issue, "pr": pr, "checks": [trusted_check(fixed_sha)],
                      "current_wakeup": None}
            review = migrate_review_state({"codex_session_id": reviewer_id(), "spec_sha": spec_sha})
            review.update(review_phase="correction_required", reviewed_sha=spec_sha,
                          review_findings=finding_verdict("IR-001")["findings"])
            key = "12345678-1234-4abc-8def-123456789abc"
            store = InMemoryResolutionStore()
            store.records[key] = WorkState(
                target, codex_session_id=reviewer_id(), phase="exited_resumable",
                lifecycle_state="independent_review", lifecycle_updated_at="2026-08-08T00:00:00Z",
                base_sha=spec_sha, spec_sha=spec_sha, implementation_sha=spec_sha,
                approval_at="2026-08-08T00:00:00Z", review_state=review,
                github_evidence=github,
            )
            result = Controller(Registry([target]), store, EvidenceExecutor(issue, pr)).execute(
                "attest", target.repository, target.issue_number, key,
            )
            state = store.load(key)
            self.assertEqual(state.implementation_sha, fixed_sha)
            self.assertEqual(state.review_state["review_phase"], "awaiting_review")
            self.assertEqual(result["review_evidence"]["sha"], fixed_sha)


class IndependentReviewSecurityTests(unittest.TestCase):
    def test_runtime_clean_waits_for_fresh_host_attestation_then_promotes(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        reviewer, run_id = ("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                            "cccccccc-cccc-4ccc-8ccc-cccccccccccc")
        review = migrate_fixture()
        review.update(review_phase="reviewing", reviewer_session_id=reviewer,
                      reviewer_run_id=run_id, reviewed_sha="a" * 40,
                      deterministic_evidence=valid_evidence(
                          worktree=TARGET.worktree, change="issue-77"))
        store = InMemoryResolutionStore()
        store.records[key] = WorkState(
            TARGET, codex_session_id=review["implementation_session_id"],
            phase="exited_resumable", lifecycle_state="independent_review",
            lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha="0" * 40,
            spec_sha=SPEC_SHA, implementation_sha="a" * 40,
            approval_at="2026-08-08T00:00:00Z", review_state=review,
            github_evidence=fresh_github_evidence(TARGET, key, "a" * 40),
        )
        executor = FakeExecutor([
            "a" * 40 + "\n", "", "a" * 40 + f"\trefs/heads/{TARGET.branch}\n",
            "tools/neo_dev_webhook/project_control.py\n",
            "openspec/changes/issue-77/proposal.md\n",
        ])
        controller = Controller(Registry([TARGET]), store, executor)
        pending = controller.record_independent_verdict(
            key, "a" * 40, clean_verdict(reviewer=reviewer, run=run_id),
            "2026-08-08T00:01:00Z",
        )
        self.assertEqual(pending.review_state["review_phase"], "clean_pending_evidence")
        promoted = controller.execute(
            "attest", TARGET.repository, TARGET.issue_number, key,
            fresh_github_evidence(TARGET, key, "a" * 40),
        )
        self.assertEqual(promoted["execution"]["lifecycle_state"], "implementation_verified")

    def test_other_sha_check_runs_cannot_enter_independent_review(self):
        import subprocess
        from tools.neo_dev_webhook.project_control import WorkState
        from tools.neo_dev_webhook.tests.test_verification import EvidenceExecutor, VerificationTest
        from tools.neo_dev_webhook.verification import RepositoryGitHubVerifier
        with tempfile.TemporaryDirectory() as directory:
            target, head = VerificationTest().repository(pathlib.Path(directory))
            document = pathlib.Path(target.worktree) / "docs/implementation-evidence.md"
            document.parent.mkdir()
            document.write_text("evidence\n")
            subprocess.run(["git", "-C", target.worktree, "add", "docs"], check=True)
            subprocess.run(["git", "-C", target.worktree, "commit", "-m", "evidence"],
                           check=True, capture_output=True)
            head = subprocess.run(["git", "-C", target.worktree, "rev-parse", "HEAD"],
                                  check=True, capture_output=True, text=True).stdout.strip()
            issue = {"state": "OPEN", "comments": [{"body": "/approve-spec " + head,
                                                       "author": {"login": "kingkill85"}}]}
            pr = {"headRefOid": head, "isDraft": True}
            stale = trusted_check("b" * 40)
            transition = RepositoryGitHubVerifier(EvidenceExecutor(issue, pr, [stale]), {
                "issue": issue, "pr": pr, "checks": [stale], "current_wakeup": None,
            }).verify_next(target, WorkState(
                target, lifecycle_state="spec_approved", lifecycle_updated_at="x",
                base_sha=head, spec_sha=head, approval_at="x",
            ))
            self.assertFalse(transition.verified)
            self.assertIn("CI", transition.blocker)

    def test_clean_promotion_uses_fresh_pr_issue_branch_base_and_checks(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        run_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        review = migrate_fixture()
        review.update(review_phase="reviewing", reviewer_session_id=reviewer,
                      reviewer_run_id=run_id, reviewed_sha="a" * 40,
                      deterministic_evidence=valid_evidence(
                          worktree=TARGET.worktree, change="issue-77"))
        cached = fresh_github_evidence(TARGET, key, "a" * 40)
        for mutation, blocker in (({"state": "CLOSED"}, "state"),
                                  ({"headRefOid": "b" * 40}, "head"),
                                  ({"headRefName": "wrong"}, "branch"),
                                  ({"baseRefName": "release"}, "base"),
                                  ({"body": "unrelated"}, "Issue")):
            fresh = fresh_github_evidence(TARGET, key, "a" * 40)
            fresh["pr"].update(mutation)
            collector = type("Collector", (), {"collect_bound": lambda self, *args, value=fresh: value})()
            store = InMemoryResolutionStore()
            store.records[key] = WorkState(
                TARGET, codex_session_id=review["implementation_session_id"],
                phase="exited_resumable", lifecycle_state="independent_review",
                lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha="0" * 40,
                spec_sha=SPEC_SHA, implementation_sha="a" * 40,
                approval_at="2026-08-08T00:00:00Z", review_state=dict(review),
                github_evidence=cached,
            )
            controller = Controller(Registry([TARGET]), store, FakeExecutor(),
                                    github_collector=collector)
            with self.subTest(mutation=mutation), self.assertRaisesRegex(RuntimeError, blocker):
                controller.record_independent_verdict(
                    key, "a" * 40, clean_verdict(reviewer=reviewer, run=run_id),
                    "2026-08-08T00:01:00Z",
                )
        stale_checks = fresh_github_evidence(TARGET, key, "a" * 40)
        stale_checks["checks"][0]["head_sha"] = "b" * 40
        store = InMemoryResolutionStore()
        store.records[key] = WorkState(
            TARGET, codex_session_id=review["implementation_session_id"],
            phase="exited_resumable", lifecycle_state="independent_review",
            lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha="0" * 40,
            spec_sha=SPEC_SHA, implementation_sha="a" * 40,
            approval_at="2026-08-08T00:00:00Z", review_state=dict(review),
            github_evidence=cached,
        )
        controller = Controller(
            Registry([TARGET]), store, FakeExecutor(),
            github_collector=StaticCollector(stale_checks),
        )
        with self.assertRaisesRegex(RuntimeError, "checks"):
            controller.record_independent_verdict(
                key, "a" * 40, clean_verdict(reviewer=reviewer, run=run_id),
                "2026-08-08T00:01:00Z",
            )

    def test_clean_promotion_rechecks_head_pr_and_clean_worktree(self):
        from tools.neo_dev_webhook.project_control import (
            Controller, InMemoryResolutionStore, Registry, WorkState,
        )
        from tools.neo_dev_webhook.tests.test_project_control import FakeExecutor, TARGET
        key = "12345678-1234-4abc-8def-123456789abc"
        reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
        run_id = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
        verdict = clean_verdict(reviewer=reviewer, run=run_id)
        review = migrate_fixture()
        review.update(review_phase="reviewing", reviewer_session_id=reviewer,
                      reviewer_run_id=run_id, reviewed_sha="a" * 40,
                      deterministic_evidence=valid_evidence(
                          worktree=TARGET.worktree, change="issue-77"))
        for outputs, blocker in (
            (["b" * 40 + "\n"], "HEAD"),
            (["a" * 40 + "\n", "untracked.txt\n"], "worktree"),
            (["a" * 40 + "\n", "", "b" * 40 + "\n"], "PR"),
        ):
            with self.subTest(blocker=blocker):
                store = InMemoryResolutionStore()
                store.records[key] = WorkState(
                    TARGET, codex_session_id=review["implementation_session_id"],
                    phase="exited_resumable", lifecycle_state="independent_review",
                    lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha="0" * 40,
                    spec_sha=SPEC_SHA, implementation_sha="a" * 40,
                    approval_at="2026-08-08T00:00:00Z", review_state=dict(review),
                    github_evidence={"pr": {"headRefOid": "a" * 40}},
                )
                controller = Controller(
                    Registry([TARGET]), store, FakeExecutor(outputs),
                    github_collector=StaticCollector(fresh_github_evidence(TARGET, key, "a" * 40)),
                )
                with self.assertRaisesRegex(RuntimeError, blocker):
                    controller.record_independent_verdict(
                        key, "a" * 40, verdict, "2026-08-08T00:01:00Z",
                    )

    def test_modified_approved_tasks_blocks_review_transition(self):
        import subprocess
        from tools.neo_dev_webhook.project_control import WorkState
        from tools.neo_dev_webhook.tests.test_verification import EvidenceExecutor, VerificationTest
        from tools.neo_dev_webhook.verification import RepositoryGitHubVerifier
        with tempfile.TemporaryDirectory() as directory:
            target, approved = VerificationTest().repository(pathlib.Path(directory))
            change = next((pathlib.Path(target.worktree) / "openspec/changes").iterdir())
            (change / "tasks.md").write_text("changed after approval\n")
            subprocess.run(["git", "-C", target.worktree, "add", str(change / "tasks.md")], check=True)
            subprocess.run(["git", "-C", target.worktree, "commit", "-m", "tamper tasks"],
                           check=True, capture_output=True)
            head = subprocess.run(["git", "-C", target.worktree, "rev-parse", "HEAD"],
                                  check=True, capture_output=True, text=True).stdout.strip()
            issue = {"state": "OPEN", "comments": [{"body": "/approve-spec " + approved,
                                                       "author": {"login": "kingkill85"}}]}
            pr = {"headRefOid": head, "isDraft": True}
            transition = RepositoryGitHubVerifier(EvidenceExecutor(issue, pr), {
                "issue": issue, "pr": pr, "checks": [trusted_check(head)],
                "current_wakeup": None,
            }).verify_next(target, WorkState(
                target, lifecycle_state="spec_approved", lifecycle_updated_at="x",
                base_sha=approved, spec_sha=approved, approval_at="x",
            ))
            self.assertFalse(transition.verified)
            self.assertIn("tasks", transition.blocker)


def migrate_fixture():
    from tools.neo_dev_webhook.independent_review import migrate_review_state
    return migrate_review_state({
        "lifecycle_state": "spec_approved",
        "codex_session_id": "12345678-1234-4abc-8def-123456789abc",
        "spec_sha": "9fcf912d46afe5fadc40c9fcb7dae3f7ff59f96b",
    })


def reviewer_id():
    return "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


class StaticCollector:
    def __init__(self, evidence): self.evidence = evidence
    def collect_bound(self, *args): return self.evidence


def trusted_check(sha):
    from neo_dev_webhook.tests.test_deterministic_gates import artifact_attestation
    return {"id": 42, "name": "E2E (Cucumber + Playwright)", "head_sha": sha,
            "status": "completed", "conclusion": "success", "state": "SUCCESS",
            "artifacts": [f"cucumber-report-{sha}"],
            "artifact_attestation": artifact_attestation(sha)}


def fresh_github_evidence(target, workflow_id, sha):
    from datetime import datetime, timezone
    return {"version": 2, "workflow_id": workflow_id,
        "repository": target.repository, "issue_number": target.issue_number,
        "resolution_id": target.resolution_id, "expected_state": "independent_review",
        "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "issue": {"state": "OPEN", "labels": [], "comments": []},
        "pr": {"number": 9, "state": "OPEN", "isDraft": True, "headRefOid": sha,
               "headRefName": target.branch, "baseRefName": "main",
               "body": f"Closes #{target.issue_number}"},
        "checks": [trusted_check(sha)],
        "current_wakeup": None}


def valid_evidence(sha="a" * 40, *, worktree="/workspace/snap-flow-issue-6",
                   change="issue-6"):
    from tools.neo_dev_webhook.deterministic_gates import REQUIRED_GATES, expected_gate_commands
    context = {"changed_paths": ["tools/neo_dev_webhook/project_control.py"],
               "worktree": worktree, "change": change}
    gates = {}
    for name in REQUIRED_GATES:
        plan = expected_gate_commands(name, context["changed_paths"], context["worktree"],
                                      context["change"], SPEC_SHA)
        gates[name] = {"status": "passed", "gate": name, "head_sha": sha,
            "approved_spec_sha": SPEC_SHA, "result": {}, "commands": [
                {**item, "exit_code": 0, "stdout_sha256": "0" * 64,
                 "stderr_sha256": "1" * 64, "observed_at": "2026-08-08T00:00:00Z",
                 "head_sha": sha, "approved_spec_sha": SPEC_SHA}
                for item in plan]}
    return {
        "sha": sha,
        "approved_spec_sha": SPEC_SHA,
        "approval_artifact_sha": SPEC_SHA,
        "tests": {"focused": "passed", "full": "passed"},
        "lint": "passed", "typecheck": "passed", "build": "passed",
        "openspec": {"validate": "passed", "verify": "passed", "strict": True},
        "checks": [{"id": 42, "name": "E2E (Cucumber + Playwright)", "head_sha": sha,
                    "status": "completed", "conclusion": "success", "state": "SUCCESS"}],
        "e2e": {
            "head_sha": sha,
            "local": {"status": "passed", "command": "npm run e2e"},
            "mapping": {"status": "passed", "required": 0, "mapped": 0},
            "github_check": trusted_check(sha),
            "artifacts": {"cucumber_report": f"cucumber-report-{sha}"},
        },
        "approval_artifacts": {"immutable": True},
        "gates": gates,
        "gate_context": context,
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

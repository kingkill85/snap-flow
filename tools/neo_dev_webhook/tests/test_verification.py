import json
import pathlib
import subprocess
import tempfile
import unittest

from neo_dev_webhook.project_control import GovernedTarget, WorkState
from neo_dev_webhook.verification import HostGitHubEvidenceCollector, RepositoryGitHubVerifier, validate_host_evidence


class EvidenceExecutor:
    def __init__(self, issue, pr, checks=None):
        self.issue = issue
        self.pr = pr
        self.checks = [{"state": "SUCCESS"}] if checks is None else checks
        comments = issue.get("comments", [])
        latest = comments[-1] if comments else None
        self.current_wakeup = ({
            "comment_id": int(latest.get("id", 1)),
            "command": latest.get("body"),
            "delivery_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "created_at": latest.get("createdAt"),
        } if latest is not None and latest.get("createdAt") else None)
        self.calls = []

    def run(self, argv, *, timeout):
        self.calls.append(tuple(argv))
        if argv[0] == "gate":
            return f"{argv[2]} ok\n"
        if argv[0] == "git":
            if "ls-remote" in argv:
                return f'{self.pr["headRefOid"]}\t{argv[-1]}\n'
            return subprocess.run(argv, check=True, capture_output=True, text=True,
                                  timeout=timeout, shell=False).stdout
        if "issue" in argv and "view" in argv:
            return json.dumps(self.issue)
        if "pr" in argv and "list" in argv:
            return json.dumps([self.pr])
        if "pr" in argv and "checks" in argv:
            return json.dumps(self.checks)
        raise AssertionError(f"unexpected verifier command: {argv}")


class VerificationTest(unittest.TestCase):
    def test_accept_is_sha_bound_and_cancel_is_a_safe_terminal_transition(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory))
            common = dict(
                lifecycle_updated_at="2026-08-07T00:00:01Z", base_sha=head,
                spec_sha=head, implementation_sha=head,
                approval_at="2026-08-06T00:00:00Z",
            )
            pr = {"number": 10, "state": "OPEN", "isDraft": True,
                  "headRefOid": head, "mergeCommit": None}

            for body, expected in (("/accept", False), (f"/accept {head}", True)):
                issue = {"state": "OPEN", "labels": [], "comments": [{
                    "body": body, "createdAt": "2026-08-07T00:00:02Z",
                    "author": {"login": "kingkill85"},
                }]}
                transition = RepositoryGitHubVerifier(EvidenceExecutor(issue, pr)).authorize(
                    target, WorkState(target, lifecycle_state="implementation_verified", **common),
                )
                self.assertEqual(transition.verified, expected)
                if expected:
                    self.assertEqual(transition.evidence["lifecycle_state"], "accepted")

            issue = {"state": "OPEN", "labels": [], "comments": [{
                "body": "/cancel", "createdAt": "2026-08-07T00:00:02Z",
                "author": {"login": "kingkill85"},
            }]}
            transition = RepositoryGitHubVerifier(EvidenceExecutor(issue, pr)).authorize(
                target, WorkState(target, lifecycle_state="implementation_verified", **common),
            )
            self.assertTrue(transition.verified, transition.blocker)
            self.assertEqual(transition.evidence, {
                "lifecycle_state": "cancelled",
                "lifecycle_updated_at": "2026-08-07T00:00:02Z",
            })

            archive_state = WorkState(
                target, lifecycle_state="archive_authorized",
                lifecycle_updated_at="2026-08-07T00:00:01Z", base_sha=head,
                spec_sha=head, implementation_sha=head, accepted_sha=head,
                approval_at="2026-08-06T00:00:00Z",
                accepted_at="2026-08-07T00:00:00Z",
                merge_authorized_at="2026-08-07T00:00:01Z",
            )
            archive_cancel = RepositoryGitHubVerifier(EvidenceExecutor(issue, pr)).authorize(
                target, archive_state,
            )
            self.assertTrue(archive_cancel.verified, archive_cancel.blocker)
            self.assertEqual(archive_cancel.evidence["lifecycle_state"], "cancelled")

    def test_authorization_is_bound_to_exact_persisted_wakeup_comment(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory))
            issue = {"state": "OPEN", "labels": [], "comments": [
                {"id": "101", "body": "/revise-spec clarify the scenario",
                 "createdAt": "2026-08-07T00:00:02Z",
                 "author": {"login": "kingkill85"}},
                {"id": "102", "body": "/fix repair the race",
                 "createdAt": "2026-08-07T00:00:03Z",
                 "author": {"login": "kingkill85"}},
            ]}
            exact_comment = {
                "id": 102, "body": "/fix repair the race",
                "created_at": "2026-08-07T00:00:03Z",
                "user": {"id": 11455872, "login": "kingkill85"},
                "issue_url": "https://api.github.com/repos/kingkill85/snap-flow/issues/13",
            }

            class ExactWakeupExecutor(EvidenceExecutor):
                def run(self, argv, *, timeout):
                    if "api" in argv:
                        self.calls.append(tuple(argv))
                        return json.dumps(exact_comment)
                    return super().run(argv, timeout=timeout)

            executor = ExactWakeupExecutor(
                issue, {"number": 10, "state": "OPEN", "isDraft": True,
                        "headRefOid": head, "mergeCommit": None},
            )
            evidence = HostGitHubEvidenceCollector(executor).collect_bound(
                target.repository, target.issue_number, target.branch, target.resolution_id,
                "accepted", "12345678-1234-4abc-8def-123456789abc",
                {"comment_id": 102, "command": "/fix repair the race",
                 "delivery_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"},
            )
            state = WorkState(
                target, lifecycle_state="accepted",
                lifecycle_updated_at="2026-08-07T00:00:01Z", base_sha=head,
                spec_sha=head, implementation_sha=head, accepted_sha=head,
                approval_at="2026-08-06T00:00:00Z", accepted_at="2026-08-07T00:00:01Z",
                github_evidence=evidence,
            )
            validate_host_evidence(
                evidence, state, "12345678-1234-4abc-8def-123456789abc",
            )
            transition = RepositoryGitHubVerifier(executor, evidence).authorize(target, state)

            self.assertTrue(transition.verified, transition.blocker)
            self.assertEqual(transition.evidence["lifecycle_state"], "spec_approved")
            self.assertEqual(
                evidence["current_wakeup"],
                {"comment_id": 102, "command": "/fix repair the race",
                 "delivery_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                 "created_at": "2026-08-07T00:00:03Z"},
            )

    def test_host_collector_uses_fixed_gh_and_config_directory(self):
        class HostExecutor:
            def __init__(self): self.calls = []
            def run(self, argv, *, timeout):
                self.calls.append(tuple(argv))
                if "issue" in argv: return json.dumps({"state": "OPEN", "comments": []})
                if "list" in argv: return json.dumps([{"number": 9, "headRefOid": "a" * 40}])
                return json.dumps([{"state": "SUCCESS"}])
        executor = HostExecutor()
        evidence = HostGitHubEvidenceCollector(executor).collect_bound(
            "kingkill85/snap-flow", 13, "feature/issue-13", "b" * 64, "label",
            "12345678-1234-4abc-8def-123456789abc",
        )
        self.assertEqual(evidence["expected_state"], "label")
        for call in executor.calls:
            self.assertEqual(call[:3], ("/usr/bin/env",
                                        "GH_CONFIG_DIR=/opt/data/home/.config/gh",
                                        "/opt/data/bin/gh"))

    def test_host_evidence_is_fresh_and_bound_to_controller_state(self):
        with tempfile.TemporaryDirectory() as directory:
            target, _ = self.repository(pathlib.Path(directory))
            state = WorkState(target)
            evidence = {
                "version": 2, "workflow_id": "12345678-1234-4abc-8def-123456789abc",
                "repository": target.repository,
                "issue_number": target.issue_number, "resolution_id": target.resolution_id,
                "expected_state": "label", "observed_at": "2099-01-01T00:00:00Z",
                "issue": {}, "pr": {}, "checks": [], "current_wakeup": None,
            }
            with self.assertRaisesRegex(ValueError, "stale"):
                validate_host_evidence(evidence, state)
            from datetime import datetime, timezone
            evidence["observed_at"] = datetime.now(timezone.utc).isoformat()
            evidence["resolution_id"] = "forged"
            with self.assertRaisesRegex(ValueError, "not bound"):
                validate_host_evidence(evidence, state)
    def repository(self, root, *, active=True):
        subprocess.run(["git", "init", "-q", "-b", "feature/issue-13", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
        (root / "README.md").write_text("test\n")
        subprocess.run(["git", "-C", str(root), "add", "README.md"], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-qm", "base"], check=True)
        subprocess.run(["git", "-C", str(root), "branch", "origin/main", "HEAD"], check=True)
        if active:
            change = root / "openspec" / "changes" / "issue-13-mass-switch-items"
            (change / "specs" / "workflow").mkdir(parents=True)
            for name in ("proposal.md", "design.md", "tasks.md"):
                (change / name).write_text(name + "\n")
            (change / ".openspec.yaml").write_text("schema: spec-driven\n")
            (change / "specs" / "workflow" / "spec.md").write_text("spec\n")
        else:
            archive = root / "openspec" / "changes" / "archive" / "issue-13"
            archive.mkdir(parents=True)
            (archive / "proposal.md").write_text("archived\n")
        subprocess.run(["git", "-C", str(root), "add", "."], check=True)
        subprocess.run(["git", "-C", str(root), "commit", "-qm", "evidence"], check=True)
        head = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                              capture_output=True, text=True).stdout.strip()
        target = GovernedTarget("kingkill85/snap-flow", 13, "snap-flow", "snapflow-dev",
                                "issue-13", str(root), "feature/issue-13", "Codex")
        return target, head

    def test_specification_verifies_actual_repository_and_github_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory))
            executor = EvidenceExecutor(
                {"state": "OPEN", "labels": [{"name": "neo-dev"}], "comments": []},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            )
            result = RepositoryGitHubVerifier(executor).verify(target, "specification")
            self.assertTrue(result.verified, result.blocker)
            (pathlib.Path(directory) / "openspec" / "changes" / "issue-13-mass-switch-items" /
             "proposal.md").unlink()
            forged = RepositoryGitHubVerifier(executor).verify(target, "specification")
            self.assertFalse(forged.verified)
            self.assertIn("not clean", forged.blocker)

    def test_specification_rejects_product_code_even_with_complete_planning(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            target, _head = self.repository(root)
            (root / "product.py").write_text("print('not spec only')\n")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "smuggle runtime"], check=True)
            head = subprocess.run(["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                                  capture_output=True, text=True).stdout.strip()
            result = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [{"name": "neo-dev"}], "comments": []},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            )).verify(target, "specification")
            self.assertFalse(result.verified)
            self.assertIn("product.py", result.blocker)

    def test_accept_cannot_skip_approval_and_early_merge_never_becomes_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory))
            comments = [
                {"body": "/merge", "createdAt": "2026-08-07T00:00:01Z",
                 "author": {"login": "kingkill85"}},
                {"body": f"/accept {head}", "createdAt": "2026-08-07T00:00:02Z",
                 "author": {"login": "kingkill85"}},
            ]
            verifier = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": comments[:1]},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            ))
            specification = WorkState(target, lifecycle_state="specification_ready",
                                      lifecycle_updated_at="2026-08-07T00:00:00Z",
                                      base_sha=head, spec_sha=head)
            self.assertFalse(verifier.authorize(target, specification).verified)
            archive = WorkState(
                target, lifecycle_state="archive_ci_verified",
                lifecycle_updated_at="2026-08-07T00:00:03Z", spec_sha=head,
                base_sha=head,
                implementation_sha=head, accepted_sha=head, archive_sha=head,
                approval_at="2026-08-07T00:00:01Z", accepted_at="2026-08-07T00:00:02Z",
            )
            self.assertFalse(verifier.authorize(target, archive).verified)

    def test_merge_finalization_requires_archive_merge_authorization_and_closure(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory), active=False)
            pr = {"number": 10, "state": "MERGED", "isDraft": False,
                  "headRefOid": head, "mergeCommit": {"oid": "f" * 40}}
            premature = EvidenceExecutor(
                {"state": "CLOSED", "labels": [], "comments": [
                    {"body": "/merge", "author": {"login": "kingkill85"}},
                ]}, pr,
            )
            result = RepositoryGitHubVerifier(premature).verify(target, "merge-finalization")
            self.assertFalse(result.verified)
            trusted = EvidenceExecutor(
                {"state": "CLOSED", "labels": [], "comments": [
                    {"body": f"/accept {head}", "author": {"login": "kingkill85"}},
                    {"body": "/merge", "author": {"login": "kingkill85"}},
                ]}, pr,
            )
            result = RepositoryGitHubVerifier(trusted).verify(
                target, "merge-finalization", expected_archive_sha=head,
            )
            self.assertTrue(result.verified, result.blocker)
            mismatch = RepositoryGitHubVerifier(trusted).verify(
                target, "merge-finalization", expected_archive_sha="e" * 40,
            )
            self.assertFalse(mismatch.verified)
            self.assertIn("exact SHA", mismatch.blocker)

            transition = RepositoryGitHubVerifier(trusted).verify_next(
                target, WorkState(
                    target, lifecycle_state="merge_authorized",
                    lifecycle_updated_at="2026-08-07T00:00:02Z", base_sha=head,
                    spec_sha=head, implementation_sha=head, accepted_sha=head,
                    archive_sha=head,
                    approval_at="2026-08-06T00:00:00Z",
                    accepted_at="2026-08-07T00:00:01Z",
                    merge_authorized_at="2026-08-07T00:00:02Z",
                ),
            )
            self.assertTrue(transition.verified, transition.blocker)
            self.assertEqual(transition.evidence["archive_sha"], head)

    def test_merge_finalization_requires_nonempty_successful_current_pr_checks(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory), active=False)
            issue = {"state": "CLOSED", "labels": [], "comments": [
                {"body": f"/accept {head}", "author": {"login": "kingkill85"}},
                {"body": "/merge", "author": {"login": "kingkill85"}},
            ]}
            pr = {"number": 10, "state": "MERGED", "isDraft": False,
                  "headRefOid": head, "mergeCommit": {"oid": "f" * 40}}
            for checks in ([], [{"state": "FAILURE"}]):
                with self.subTest(checks=checks):
                    result = RepositoryGitHubVerifier(
                        EvidenceExecutor(issue, pr, checks=checks),
                    ).verify(target, "merge-finalization", expected_archive_sha=head)
                    self.assertFalse(result.verified)
                    self.assertIn("checks", result.blocker)

    def test_acceptance_delays_archive_until_merge_authorizes_finalization(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory))
            verifier = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [{"name": "needs-approval"}], "comments": [
                    {"body": f"/accept {head}", "createdAt": "2026-08-07T00:00:01Z",
                     "author": {"login": "kingkill85"}},
                    {"body": "/merge", "createdAt": "2026-08-07T00:00:02Z",
                     "author": {"login": "kingkill85"}},
                ]},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            ))
            awaiting_merge = WorkState(
                target, lifecycle_state="accepted",
                lifecycle_updated_at="2026-08-07T00:00:01Z", base_sha=head,
                spec_sha=head, implementation_sha=head, accepted_sha=head,
                approval_at="2026-08-06T00:00:00Z",
                accepted_at="2026-08-07T00:00:01Z",
            )
            transition = verifier.authorize(target, awaiting_merge)
            self.assertTrue(transition.verified, transition.blocker)
            self.assertEqual(transition.evidence["lifecycle_state"], "archive_authorized")
            self.assertEqual(
                transition.evidence["merge_authorized_at"], "2026-08-07T00:00:02Z",
            )
            self.assertIsNone(awaiting_merge.archive_sha)

    def test_controller_archive_attestation_records_exact_successful_pr_head(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory), active=False)
            state = WorkState(
                target, lifecycle_state="archive_authorized",
                lifecycle_updated_at="2026-08-07T00:00:02Z", base_sha=head,
                spec_sha=head, implementation_sha=head, accepted_sha=head,
                approval_at="2026-08-06T00:00:00Z",
                accepted_at="2026-08-07T00:00:01Z",
                merge_authorized_at="2026-08-07T00:00:02Z",
            )
            transition = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": [{
                    "body": f"/accept {head}", "createdAt": "2026-08-07T00:00:01Z",
                    "author": {"login": "kingkill85"},
                }]},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            )).verify_next(target, state)
            self.assertTrue(transition.verified, transition.blocker)
            self.assertEqual(transition.evidence["lifecycle_state"], "archive_ci_verified")
            self.assertEqual(transition.evidence["archive_sha"], head)

    def test_revision_and_fix_commands_reopen_with_the_required_evidence_semantics(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory))
            comments = [
                {"body": "/revise-spec clarify the scenario",
                 "createdAt": "2026-08-07T00:00:02Z", "author": {"login": "kingkill85"}},
                {"body": "/fix repair the race",
                 "createdAt": "2026-08-07T00:00:03Z", "author": {"login": "kingkill85"}},
            ]
            verifier = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": comments[:1]},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            ))
            common = dict(
                lifecycle_updated_at="2026-08-07T00:00:01Z", base_sha=head,
                spec_sha=head, implementation_sha=head, accepted_sha=head,
                approval_at="2026-08-06T00:00:00Z", accepted_at="2026-08-07T00:00:01Z",
            )
            for lifecycle in ("specification_ready", "accepted"):
                with self.subTest(command="revision", lifecycle=lifecycle):
                    values = dict(common)
                    if lifecycle == "specification_ready":
                        values.update(implementation_sha=None, accepted_sha=None, accepted_at=None)
                    transition = verifier.authorize(
                        target, WorkState(target, lifecycle_state=lifecycle, **values),
                    )
                    self.assertEqual(transition.evidence["lifecycle_state"], "label")
                    self.assertIsNone(transition.evidence["spec_sha"])
                    self.assertIsNone(transition.evidence["approval_at"])
                    self.assertIsNone(transition.evidence["accepted_at"])

            fix_only = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": comments[1:]},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            ))
            for lifecycle in ("implementation_verified", "accepted"):
                with self.subTest(command="fix", lifecycle=lifecycle):
                    transition = fix_only.authorize(
                        target, WorkState(target, lifecycle_state=lifecycle, **common),
                    )
                    self.assertEqual(transition.evidence["lifecycle_state"], "spec_approved")
                    self.assertNotIn("spec_sha", transition.evidence)
                    self.assertNotIn("approval_at", transition.evidence)
                    self.assertIsNone(transition.evidence["implementation_sha"])
                    self.assertIsNone(transition.evidence["accepted_at"])

    def test_archived_legacy_state_rejects_revision_but_preserves_merge_compatibility(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory), active=False)
            common = dict(
                lifecycle_state="archive_ci_verified",
                lifecycle_updated_at="2026-08-07T00:00:01Z", base_sha=head,
                spec_sha=head, implementation_sha=head, accepted_sha=head, archive_sha=head,
                approval_at="2026-08-06T00:00:00Z", accepted_at="2026-08-07T00:00:00Z",
            )
            pr = {"number": 10, "state": "OPEN", "isDraft": True,
                  "headRefOid": head, "mergeCommit": None}
            revision = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": [{
                    "body": "/revise-spec reopen archived planning",
                    "createdAt": "2026-08-07T00:00:02Z",
                    "author": {"login": "kingkill85"},
                }]}, pr,
            )).authorize(target, WorkState(target, **common))
            self.assertFalse(revision.verified)

            merge = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": [{
                    "body": "/merge", "createdAt": "2026-08-07T00:00:02Z",
                    "author": {"login": "kingkill85"},
                }]}, pr,
            )).authorize(target, WorkState(target, **common))
            self.assertTrue(merge.verified, merge.blocker)
            self.assertEqual(merge.evidence["lifecycle_state"], "merge_authorized")

            modern = {**common,
                      "lifecycle_updated_at": "2026-08-07T00:00:03Z",
                      "merge_authorized_at": "2026-08-07T00:00:02Z"}
            continued = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": [{
                    "body": "/merge", "createdAt": "2026-08-07T00:00:02Z",
                    "author": {"login": "kingkill85"},
                }]}, pr,
            )).authorize(target, WorkState(target, **modern))
            self.assertTrue(continued.verified, continued.blocker)
            self.assertEqual(continued.evidence["lifecycle_state"], "merge_authorized")

    def test_revision_baseline_allows_prior_product_code_but_rejects_new_product_edits(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            target, _initial_spec = self.repository(root)
            (root / "product.py").write_text("already implemented\n")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "implementation"], check=True)
            implementation_head = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                capture_output=True, text=True,
            ).stdout.strip()
            issue = {"state": "OPEN", "labels": [], "comments": [{
                "body": "/revise-spec clarify the scenario",
                "createdAt": "2026-08-07T00:00:02Z",
                "author": {"login": "kingkill85"},
            }]}

            authorized = RepositoryGitHubVerifier(EvidenceExecutor(
                issue, {"number": 10, "state": "OPEN", "isDraft": True,
                        "headRefOid": implementation_head, "mergeCommit": None},
            )).authorize(target, WorkState(
                target, lifecycle_state="implementation_verified",
                lifecycle_updated_at="2026-08-07T00:00:01Z", base_sha="b" * 40,
                spec_sha="a" * 40, implementation_sha=implementation_head,
                approval_at="2026-08-06T00:00:00Z",
            ))
            self.assertTrue(authorized.verified, authorized.blocker)
            self.assertEqual(authorized.evidence["base_sha"], implementation_head)

            planning = root / "openspec" / "changes" / "issue-13-mass-switch-items" / "design.md"
            planning.write_text("revised planning\n")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "revise spec"], check=True)
            revised_head = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                capture_output=True, text=True,
            ).stdout.strip()
            revised = RepositoryGitHubVerifier(EvidenceExecutor(
                issue, {"number": 10, "state": "OPEN", "isDraft": True,
                        "headRefOid": revised_head, "mergeCommit": None},
            )).verify_next(target, WorkState(
                target, lifecycle_state="label", lifecycle_updated_at="2026-08-07T00:00:02Z",
                base_sha=implementation_head,
            ))
            self.assertTrue(revised.verified, revised.blocker)
            merge_base = subprocess.run(
                ["git", "-C", str(root), "merge-base", "HEAD", "origin/main"], check=True,
                capture_output=True, text=True,
            ).stdout.strip()
            self.assertEqual(revised.evidence["base_sha"], merge_base)

            non_planning = (
                root / "openspec" / "changes" / "issue-13-mass-switch-items" / "runtime.py"
            )
            non_planning.write_text("not a planning artifact\n")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "smuggle runtime"], check=True)
            non_planning_head = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                capture_output=True, text=True,
            ).stdout.strip()
            non_planning_result = RepositoryGitHubVerifier(EvidenceExecutor(
                issue, {"number": 10, "state": "OPEN", "isDraft": True,
                        "headRefOid": non_planning_head, "mergeCommit": None},
            )).verify(target, "specification", revision_base_sha=revised_head)
            self.assertFalse(non_planning_result.verified)
            self.assertIn("runtime.py", non_planning_result.blocker)
            non_planning.unlink()
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "remove runtime"], check=True)

            (root / "product.py").write_text("edited during revision\n")
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "edit product"], check=True)
            prohibited_head = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                capture_output=True, text=True,
            ).stdout.strip()
            prohibited = RepositoryGitHubVerifier(EvidenceExecutor(
                issue, {"number": 10, "state": "OPEN", "isDraft": True,
                        "headRefOid": prohibited_head, "mergeCommit": None},
            )).verify(target, "specification", revision_base_sha=revised_head)
            self.assertFalse(prohibited.verified)
            self.assertIn("product.py", prohibited.blocker)

    def test_approval_before_revision_timestamp_cannot_approve_new_spec(self):
        with tempfile.TemporaryDirectory() as directory:
            target, head = self.repository(pathlib.Path(directory))
            verifier = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": [{
                    "body": f"/approve-spec {head}",
                    "createdAt": "2026-08-07T00:00:01Z",
                    "author": {"login": "kingkill85"},
                }]},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            ))
            state = WorkState(
                target, lifecycle_state="specification_ready",
                lifecycle_updated_at="2026-08-07T00:00:02Z", base_sha=head, spec_sha=head,
            )
            self.assertFalse(verifier.authorize(target, state).verified)

    def test_implementation_rejects_material_changes_after_immutable_approval(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            target, approved = self.repository(root)
            (root / "openspec" / "changes" / "issue-13-mass-switch-items" / "design.md").write_text(
                "materially changed after approval\n"
            )
            subprocess.run(["git", "-C", str(root), "add", "."], check=True)
            subprocess.run(["git", "-C", str(root), "commit", "-qm", "mutate spec"], check=True)
            head = subprocess.run(
                ["git", "-C", str(root), "rev-parse", "HEAD"], check=True,
                capture_output=True, text=True,
            ).stdout.strip()
            executor = EvidenceExecutor(
                {"state": "OPEN", "labels": [{"name": "in-progress"}], "comments": [
                    {"body": f"/approve-spec {approved}",
                     "author": {"login": "kingkill85"}},
                ]},
                {"number": 10, "state": "OPEN", "isDraft": True,
                 "headRefOid": head, "mergeCommit": None},
            )
            result = RepositoryGitHubVerifier(executor).verify(target, "implementation")
            self.assertFalse(result.verified)
            self.assertIn("returned non-zero", result.blocker)


if __name__ == "__main__":
    unittest.main()

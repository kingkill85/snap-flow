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
        self.checks = checks or [{"state": "SUCCESS"}]
        self.calls = []

    def run(self, argv, *, timeout):
        self.calls.append(tuple(argv))
        if argv[0] == "git":
            return subprocess.run(argv, check=True, capture_output=True, text=True,
                                  timeout=timeout, shell=False).stdout
        if argv[1:3] == ("issue", "view"):
            return json.dumps(self.issue)
        if argv[1:3] == ("pr", "list"):
            return json.dumps([self.pr])
        if argv[1:3] == ("pr", "checks"):
            return json.dumps(self.checks)
        raise AssertionError(f"unexpected verifier command: {argv}")


class VerificationTest(unittest.TestCase):
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
                "version": 1, "workflow_id": "12345678-1234-4abc-8def-123456789abc",
                "repository": target.repository,
                "issue_number": target.issue_number, "resolution_id": target.resolution_id,
                "expected_state": "label", "observed_at": "2099-01-01T00:00:00Z",
                "issue": {}, "pr": {}, "checks": [],
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
                {"body": "/accept", "createdAt": "2026-08-07T00:00:02Z",
                 "author": {"login": "kingkill85"}},
            ]
            verifier = RepositoryGitHubVerifier(EvidenceExecutor(
                {"state": "OPEN", "labels": [], "comments": comments},
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
                    {"body": "/accept", "author": {"login": "kingkill85"}},
                    {"body": "/merge", "author": {"login": "kingkill85"}},
                ]}, pr,
            )
            result = RepositoryGitHubVerifier(trusted).verify(target, "merge-finalization")
            self.assertTrue(result.verified, result.blocker)

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

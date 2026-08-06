import json
import pathlib
import subprocess
import tempfile
import unittest

from neo_dev_webhook.project_control import GovernedTarget
from neo_dev_webhook.verification import RepositoryGitHubVerifier


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
    def repository(self, root, *, active=True):
        subprocess.run(["git", "init", "-q", "-b", "feature/issue-13", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.email", "test@example.com"], check=True)
        subprocess.run(["git", "-C", str(root), "config", "user.name", "Test"], check=True)
        (root / "README.md").write_text("test\n")
        if active:
            change = root / "openspec" / "changes" / "issue-13"
            (change / "specs" / "workflow").mkdir(parents=True)
            for name in ("proposal.md", "design.md", "tasks.md"):
                (change / name).write_text(name + "\n")
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
            (pathlib.Path(directory) / "openspec" / "changes" / "issue-13" /
             "proposal.md").unlink()
            forged = RepositoryGitHubVerifier(executor).verify(target, "specification")
            self.assertFalse(forged.verified)
            self.assertIn("not clean", forged.blocker)

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
            (root / "openspec" / "changes" / "issue-13" / "design.md").write_text(
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

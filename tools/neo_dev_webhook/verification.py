from __future__ import annotations

import json
import pathlib
import re
import subprocess
from dataclasses import dataclass
from typing import Protocol

from .project_control import GovernedTarget, ProcessExecutor

APPROVAL = re.compile(r"^/approve-spec ([0-9a-f]{40})$")


@dataclass(frozen=True)
class VerificationResult:
    verified: bool
    blocker: str | None = None


class PhaseVerifier(Protocol):
    def verify(self, target: GovernedTarget, phase: str) -> VerificationResult: ...


class RepositoryGitHubVerifier:
    """Controller-owned verification; worker JSON is never evidence."""

    def __init__(self, executor: ProcessExecutor):
        self.executor = executor

    def _run(self, *argv: str, timeout: float = 20.0) -> str:
        return self.executor.run(argv, timeout=timeout).strip()

    @staticmethod
    def _comments(issue: dict) -> list[str]:
        comments = issue.get("comments")
        if not isinstance(comments, list):
            raise RuntimeError("GitHub Issue comments are unavailable")
        return [item.get("body", "") for item in comments if isinstance(item, dict)
                and item.get("author", {}).get("login") == "kingkill85"]

    def verify(self, target: GovernedTarget, phase: str) -> VerificationResult:
        try:
            head = self._run("git", "-C", target.worktree, "rev-parse", "HEAD")
            if re.fullmatch(r"[0-9a-f]{40}", head) is None:
                return VerificationResult(False, "repository HEAD is not a full commit SHA")
            if self._run("git", "-C", target.worktree, "status", "--porcelain"):
                return VerificationResult(False, "repository worktree is not clean")
            issue = json.loads(self._run(
                "/usr/local/bin/gh", "issue", "view", str(target.issue_number), "--repo",
                target.repository, "--json", "state,labels,comments",
            ))
            prs = json.loads(self._run(
                "/usr/local/bin/gh", "pr", "list", "--repo", target.repository, "--head",
                target.branch, "--state", "all", "--json",
                "number,state,isDraft,headRefOid,mergeCommit,reviewDecision",
            ))
            if not isinstance(prs, list) or len(prs) != 1:
                return VerificationResult(False, "expected exactly one Issue Draft PR")
            pr = prs[0]
            comments = self._comments(issue)
            if phase != "merge-finalization" and pr.get("headRefOid") != head:
                return VerificationResult(False, "PR head does not match repository HEAD")
            root = pathlib.Path(target.worktree)
            active = [path for path in (root / "openspec" / "changes").iterdir()
                      if path.is_dir() and path.name.startswith(f"issue-{target.issue_number}")]
            if phase == "specification":
                if issue.get("state") != "OPEN" or not pr.get("isDraft"):
                    return VerificationResult(False, "specification requires an open Issue and Draft PR")
                if len(active) != 1:
                    return VerificationResult(False, "expected exactly one active OpenSpec change")
                required = ("proposal.md", "design.md", "tasks.md")
                if any(not (active[0] / name).is_file() for name in required):
                    return VerificationResult(False, "required OpenSpec planning artifacts are missing")
                if not any((active[0] / "specs").glob("*/spec.md")):
                    return VerificationResult(False, "OpenSpec delta specification is missing")
            elif phase in {"implementation", "review"}:
                approvals = [match.group(1) for body in comments
                             if (match := APPROVAL.fullmatch(body.strip()))]
                if len(approvals) != 1:
                    return VerificationResult(False, "exactly one immutable spec approval is required")
                self._run("git", "-C", target.worktree, "merge-base", "--is-ancestor",
                          approvals[0], head)
                if len(active) != 1:
                    return VerificationResult(False, "approved OpenSpec change is unavailable")
                self._run(
                    "git", "-C", target.worktree, "diff", "--quiet", approvals[0], head, "--",
                    str((active[0] / "proposal.md").relative_to(root)),
                    str((active[0] / "design.md").relative_to(root)),
                    str((active[0] / "specs").relative_to(root)),
                )
                if phase == "review":
                    if not any((root / "docs").glob("*evidence*.md")):
                        return VerificationResult(False, "review evidence is missing")
                    checks = json.loads(self._run(
                        "/usr/local/bin/gh", "pr", "checks", str(pr["number"]), "--repo",
                        target.repository, "--json", "state",
                    ))
                    if not checks or any(item.get("state") != "SUCCESS" for item in checks):
                        return VerificationResult(False, "review CI evidence is not successful")
            elif phase == "archive":
                if "/accept" not in [body.strip() for body in comments]:
                    return VerificationResult(False, "archive requires trusted /accept")
                if active:
                    return VerificationResult(False, "OpenSpec change is not archived")
                checks = json.loads(self._run(
                    "/usr/local/bin/gh", "pr", "checks", str(pr["number"]), "--repo",
                    target.repository, "--json", "state",
                ))
                if not checks or any(item.get("state") != "SUCCESS" for item in checks):
                    return VerificationResult(False, "exact-SHA CI checks are not successful")
            elif phase == "merge-finalization":
                stripped = [body.strip() for body in comments]
                if "/accept" not in stripped or "/merge" not in stripped:
                    return VerificationResult(False, "merge and acceptance authorizations are missing")
                if stripped.index("/merge") < stripped.index("/accept"):
                    return VerificationResult(False, "merge authorization predates acceptance")
                if active or pr.get("state") != "MERGED" or not pr.get("mergeCommit"):
                    return VerificationResult(False, "PR is not merged with archived OpenSpec state")
                if issue.get("state") != "CLOSED":
                    return VerificationResult(False, "Issue is not closed")
            else:
                return VerificationResult(False, "unsupported workflow phase")
            return VerificationResult(True)
        except (OSError, ValueError, KeyError, TypeError, RuntimeError,
                subprocess.SubprocessError, json.JSONDecodeError) as error:
            return VerificationResult(False, str(error))

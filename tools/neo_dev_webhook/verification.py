from __future__ import annotations

import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Protocol

from .project_control import GovernedTarget, ProcessExecutor, WorkState

APPROVAL = re.compile(r"^/approve-spec ([0-9a-f]{40})$")


@dataclass(frozen=True)
class VerificationResult:
    verified: bool
    blocker: str | None = None


class PhaseVerifier(Protocol):
    def verify(self, target: GovernedTarget, phase: str) -> VerificationResult: ...


@dataclass(frozen=True)
class LifecycleTransition:
    verified: bool
    evidence: dict | None = None
    blocker: str | None = None


class RepositoryGitHubVerifier:
    """Controller-owned verification; worker JSON is never evidence."""

    def __init__(self, executor: ProcessExecutor):
        self.executor = executor

    def _run(self, *argv: str, timeout: float = 20.0) -> str:
        return self.executor.run(argv, timeout=timeout).strip()

    @staticmethod
    def _comments(issue: dict) -> list[dict]:
        comments = issue.get("comments")
        if not isinstance(comments, list):
            raise RuntimeError("GitHub Issue comments are unavailable")
        return [item for item in comments if isinstance(item, dict)
                and item.get("author", {}).get("login") == "kingkill85"]

    @staticmethod
    def _bodies(comments: list[dict]) -> list[str]:
        return [item.get("body", "") for item in comments]

    def _snapshot(self, target: GovernedTarget):
        head = self._run("git", "-C", target.worktree, "rev-parse", "HEAD")
        if re.fullmatch(r"[0-9a-f]{40}", head) is None:
            raise RuntimeError("repository HEAD is not a full commit SHA")
        if self._run("git", "-C", target.worktree, "status", "--porcelain"):
            raise RuntimeError("repository worktree is not clean")
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
            raise RuntimeError("expected exactly one Issue Draft PR")
        return head, issue, prs[0], self._comments(issue)

    @staticmethod
    def _command_after(comments: list[dict], pattern: re.Pattern | str,
                       after: str | None) -> dict | None:
        def instant(value: str) -> datetime:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        matches = []
        for comment in comments:
            body = comment.get("body", "").strip()
            matched = pattern.fullmatch(body) if isinstance(pattern, re.Pattern) else body == pattern
            created = comment.get("createdAt")
            if matched and isinstance(created, str):
                try:
                    if after is None or instant(created) > instant(after):
                        matches.append(comment)
                except ValueError:
                    continue
        return matches[0] if len(matches) == 1 else None

    def authorize(self, target: GovernedTarget, state: WorkState) -> LifecycleTransition:
        """Authorize only the command legal for the persisted predecessor state."""
        try:
            head, _issue, pr, comments = self._snapshot(target)
            evidence = None
            if state.lifecycle_state == "specification_ready":
                command = self._command_after(comments, APPROVAL, state.lifecycle_updated_at)
                if command and APPROVAL.fullmatch(command["body"].strip()).group(1) == state.spec_sha:
                    evidence = {"lifecycle_state": "spec_approved", "approval_at": command["createdAt"],
                                "lifecycle_updated_at": command["createdAt"]}
            elif state.lifecycle_state == "implementation_verified":
                command = self._command_after(comments, "/accept", state.lifecycle_updated_at)
                if command and head == state.implementation_sha:
                    evidence = {"lifecycle_state": "accepted", "accepted_sha": head,
                                "accepted_at": command["createdAt"],
                                "lifecycle_updated_at": command["createdAt"]}
            elif state.lifecycle_state == "archive_ci_verified":
                command = self._command_after(comments, "/merge", state.lifecycle_updated_at)
                if command and head == state.archive_sha and pr.get("headRefOid") == state.archive_sha:
                    evidence = {"lifecycle_state": "merge_authorized",
                                "merge_authorized_at": command["createdAt"],
                                "lifecycle_updated_at": command["createdAt"]}
            if evidence is None:
                return LifecycleTransition(False, blocker="no legal trusted command for current lifecycle state")
            return LifecycleTransition(True, evidence)
        except (OSError, ValueError, KeyError, TypeError, RuntimeError,
                subprocess.SubprocessError, json.JSONDecodeError) as error:
            return LifecycleTransition(False, blocker=str(error))

    def verify_next(self, target: GovernedTarget, state: WorkState) -> LifecycleTransition:
        phase = {
            "label": "specification",
            "spec_approved": "review",
            "accepted": "archive",
            "merge_authorized": "merge-finalization",
        }.get(state.lifecycle_state)
        if phase is None:
            return LifecycleTransition(False, blocker="current lifecycle state requires a trusted command")
        result = self.verify(target, phase)
        if not result.verified:
            return LifecycleTransition(False, blocker=result.blocker)
        try:
            head = self._run("git", "-C", target.worktree, "rev-parse", "HEAD")
            now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            next_state = {"label": "specification_ready", "spec_approved": "implementation_verified",
                          "accepted": "archive_ci_verified", "merge_authorized": "merged_closed"}[
                              state.lifecycle_state]
            evidence = {"lifecycle_state": next_state, "lifecycle_updated_at": now}
            if next_state == "specification_ready":
                evidence["spec_sha"] = head
                evidence["base_sha"] = self._run(
                    "git", "-C", target.worktree, "merge-base", "HEAD", "origin/main",
                )
            elif next_state == "implementation_verified": evidence["implementation_sha"] = head
            elif next_state == "archive_ci_verified": evidence["archive_sha"] = head
            return LifecycleTransition(True, evidence)
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            return LifecycleTransition(False, blocker=str(error))

    def verify(self, target: GovernedTarget, phase: str) -> VerificationResult:
        try:
            head, issue, pr, comment_records = self._snapshot(target)
            comments = self._bodies(comment_records)
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
                base = self._run("git", "-C", target.worktree, "merge-base", "HEAD", "origin/main")
                changed = self._run("git", "-C", target.worktree, "diff", "--name-only", base, "HEAD")
                allowed_root = f"openspec/changes/issue-{target.issue_number}"
                for path in changed.splitlines():
                    evidence_doc = (path.startswith(f"docs/issue-{target.issue_number}-")
                                    and path.endswith(".md") and "/" not in path[5:])
                    if not (path == allowed_root or path.startswith(allowed_root + "/")
                            or evidence_doc):
                        return VerificationResult(False, f"specification changed prohibited path: {path}")
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

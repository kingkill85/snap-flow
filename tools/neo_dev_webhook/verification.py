from __future__ import annotations

import json
import pathlib
import re
import subprocess
from datetime import datetime, timezone
from dataclasses import dataclass
from typing import Protocol

from .project_control import GovernedTarget, ProcessExecutor, WorkState
from .operator_commands import (
    ACCEPT_PATTERN, APPROVE_SPEC_PATTERN, FIX_PATTERN, REVISE_SPEC_PATTERN,
    classify_command,
)

APPROVAL = APPROVE_SPEC_PATTERN
REVISION = REVISE_SPEC_PATTERN
FIX = FIX_PATTERN
AUTHORIZED_ACTOR_ID = 11455872
AUTHORIZED_ACTOR_LOGIN = "kingkill85"


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


def validate_host_evidence(evidence: dict, state: WorkState, workflow_id: str | None = None) -> None:
    required = {"version", "workflow_id", "repository", "issue_number", "resolution_id",
                "expected_state", "observed_at", "issue", "pr", "checks", "current_wakeup"}
    if not isinstance(evidence, dict) or set(evidence) != required:
        raise ValueError("host GitHub evidence schema is invalid")
    if (evidence["version"] != 2 or evidence["repository"] != state.target.repository
            or evidence["issue_number"] != state.target.issue_number
            or evidence["resolution_id"] != state.target.resolution_id
            or (workflow_id is not None and evidence["workflow_id"] != workflow_id)
            or evidence["expected_state"] != state.lifecycle_state):
        raise ValueError("host GitHub evidence is not bound to current controller state")
    observed = datetime.fromisoformat(evidence["observed_at"].replace("Z", "+00:00"))
    age = abs((datetime.now(timezone.utc) - observed).total_seconds())
    if age > 300:
        raise ValueError("host GitHub evidence is stale")
    if not isinstance(evidence["issue"], dict) or not isinstance(evidence["pr"], dict):
        raise ValueError("host GitHub evidence payload is invalid")
    wakeup = evidence["current_wakeup"]
    if wakeup is not None:
        if not isinstance(wakeup, dict) or set(wakeup) != {
            "comment_id", "command", "delivery_id", "created_at",
        }:
            raise ValueError("host GitHub evidence wakeup schema is invalid")
        if (type(wakeup["comment_id"]) is not int or wakeup["comment_id"] <= 0
                or not isinstance(wakeup["command"], str)
                or not 1 <= len(wakeup["command"]) <= 4096
                or not isinstance(wakeup["delivery_id"], str)
                or not isinstance(wakeup["created_at"], str)
                or not re.fullmatch(
                    r"[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
                    wakeup["delivery_id"], re.IGNORECASE,
                )):
            raise ValueError("host GitHub evidence wakeup identity is invalid")
        datetime.fromisoformat(wakeup["created_at"].replace("Z", "+00:00"))


class HostGitHubEvidenceCollector:
    """Hermes-side fixed-gh collector; controller containers never need GitHub credentials."""

    def __init__(self, executor: ProcessExecutor):
        self.executor = executor

    def collect(self, state: WorkState) -> dict:
        target = state.target
        raise RuntimeError("collect_bound requires the explicit workflow identity")

    def collect_bound(self, repository: str, issue_number: int, branch: str,
                      resolution_id: str, expected_state: str, workflow_id: str,
                      current_wakeup: dict | None = None) -> dict:
        gh = ("/usr/bin/env", "GH_CONFIG_DIR=/opt/data/home/.config/gh", "/opt/data/bin/gh")
        issue = json.loads(self.executor.run((
            *gh, "issue", "view", str(issue_number), "--repo",
            repository, "--json", "state,labels,comments",
        ), timeout=20.0))
        issue = {
            "state": issue.get("state"), "labels": issue.get("labels", []),
            "comments": [comment for comment in issue.get("comments", [])
                         if isinstance(comment, dict)
                         and comment.get("author", {}).get("login") == "kingkill85"
                         and (APPROVAL.fullmatch(comment.get("body", "").strip())
                              or REVISION.fullmatch(comment.get("body", "").strip())
                              or FIX.fullmatch(comment.get("body", "").strip())
                              or classify_command(comment.get("body", "").strip()) is not None)],
        }
        verified_wakeup = None
        if current_wakeup is not None and current_wakeup.get("command") is not None:
            comment_id = current_wakeup.get("comment_id")
            command = current_wakeup.get("command")
            delivery_id = current_wakeup.get("delivery_id")
            if (type(comment_id) is not int or comment_id <= 0 or not isinstance(command, str)
                    or not isinstance(delivery_id, str)):
                raise RuntimeError("persisted wakeup comment identity is invalid")
            comment = json.loads(self.executor.run((
                *gh, "api", f"repos/{repository}/issues/comments/{comment_id}",
            ), timeout=20.0))
            expected_issue_url = f"https://api.github.com/repos/{repository}/issues/{issue_number}"
            command_is_valid = (
                classify_command(command.strip()) is not None
            )
            if (not isinstance(comment, dict) or comment.get("id") != comment_id
                    or comment.get("user", {}).get("id") != AUTHORIZED_ACTOR_ID
                    or comment.get("user", {}).get("login") != AUTHORIZED_ACTOR_LOGIN
                    or comment.get("issue_url") != expected_issue_url
                    or comment.get("body") != command
                    or not command_is_valid):
                raise RuntimeError("persisted wakeup does not match the exact trusted Issue comment")
            created_at = comment.get("created_at")
            if not isinstance(created_at, str):
                raise RuntimeError("trusted Issue comment timestamp is unavailable")
            datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            verified_wakeup = {
                "comment_id": comment_id, "command": command, "delivery_id": delivery_id,
                "created_at": created_at,
            }
        prs = json.loads(self.executor.run((
            *gh, "pr", "list", "--repo", repository, "--head",
            branch, "--state", "all", "--json",
            "number,state,isDraft,headRefOid,headRefName,baseRefName,body,mergeCommit,reviewDecision",
        ), timeout=20.0))
        if not isinstance(prs, list) or len(prs) != 1:
            raise RuntimeError("expected exactly one governed PR")
        checks = []
        if expected_state != "label":
            head_sha = prs[0].get("headRefOid")
            if not isinstance(head_sha, str) or re.fullmatch(r"[0-9a-f]{40}", head_sha) is None:
                raise RuntimeError("governed PR head SHA is invalid")
            response = json.loads(self.executor.run((
                *gh, "api", f"repos/{repository}/commits/{head_sha}/check-runs",
            ), timeout=20.0))
            raw_checks = response.get("check_runs") if isinstance(response, dict) else None
            if not isinstance(raw_checks, list) or not raw_checks:
                raise RuntimeError("exact-SHA check runs are absent")
            checks = []
            for item in raw_checks:
                if (not isinstance(item, dict) or type(item.get("id")) is not int
                        or item.get("head_sha") != head_sha
                        or item.get("status") != "completed"
                        or item.get("conclusion") != "success"
                        or not isinstance(item.get("name"), str)):
                    raise RuntimeError("check-run SHA/status provenance is invalid")
                checks.append({"id": item["id"], "name": item["name"],
                               "head_sha": item["head_sha"], "status": item["status"],
                               "conclusion": item["conclusion"], "state": "SUCCESS"})
        return {
            "version": 2, "workflow_id": workflow_id, "repository": repository,
            "issue_number": issue_number, "resolution_id": resolution_id,
            "expected_state": expected_state,
            "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "issue": issue, "pr": prs[0], "checks": checks,
            "current_wakeup": verified_wakeup,
        }


class RepositoryGitHubVerifier:
    """Controller-owned verification; worker JSON is never evidence."""

    def __init__(self, executor: ProcessExecutor, github_evidence: dict | None = None):
        self.executor = executor
        if github_evidence is None and all(hasattr(executor, name) for name in ("issue", "pr", "checks")):
            github_evidence = {"issue": executor.issue, "pr": executor.pr,
                               "checks": executor.checks,
                               "current_wakeup": getattr(executor, "current_wakeup", None)}
        self.github_evidence = github_evidence

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
        if self.github_evidence is None:
            raise RuntimeError("fresh host-side GitHub evidence is required")
        issue = self.github_evidence["issue"]
        pr = self.github_evidence["pr"]
        return head, issue, pr, self._comments(issue)

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
            wakeup = self.github_evidence.get("current_wakeup")
            if not isinstance(wakeup, dict):
                return LifecycleTransition(False, blocker="exact trusted wakeup comment is required")
            command = {"body": wakeup.get("command"), "createdAt": wakeup.get("created_at")}
            internal_archive_continuation = (
                state.lifecycle_state == "archive_ci_verified"
                and command["body"] == "/merge"
                and command["createdAt"] == state.merge_authorized_at
            )
            if (not isinstance(command["body"], str) or not isinstance(command["createdAt"], str)
                    or (not internal_archive_continuation
                        and self._command_after(
                            [command], command["body"], state.lifecycle_updated_at,
                        ) is None)):
                return LifecycleTransition(False, blocker="exact trusted wakeup is not current")
            revision = command if REVISION.fullmatch(command["body"].strip()) else None
            fix = command if FIX.fullmatch(command["body"].strip()) else None
            if command["body"].strip() == "/cancel" and state.lifecycle_state in {
                "specification_ready", "spec_approved", "implementation_verified", "accepted",
                "archive_authorized", "archive_ci_verified",
            }:
                evidence = {"lifecycle_state": "cancelled",
                            "lifecycle_updated_at": command["createdAt"]}
            elif revision and state.lifecycle_state in {
                "specification_ready", "spec_approved", "implementation_verified", "accepted",
            }:
                evidence = {
                    "lifecycle_state": "label", "lifecycle_updated_at": revision["createdAt"],
                    "base_sha": head,
                    "spec_sha": None, "implementation_sha": None, "accepted_sha": None,
                    "archive_sha": None, "approval_at": None, "accepted_at": None,
                    "merge_authorized_at": None,
                }
            elif fix and state.lifecycle_state in {
                "spec_approved", "implementation_verified", "accepted",
            }:
                evidence = {
                    "lifecycle_state": "spec_approved", "lifecycle_updated_at": fix["createdAt"],
                    "implementation_sha": None, "accepted_sha": None, "archive_sha": None,
                    "accepted_at": None, "merge_authorized_at": None,
                }
            elif state.lifecycle_state == "specification_ready":
                command = command if APPROVAL.fullmatch(command["body"].strip()) else None
                if command and APPROVAL.fullmatch(command["body"].strip()).group(1) == state.spec_sha:
                    evidence = {"lifecycle_state": "spec_approved", "approval_at": command["createdAt"],
                                "lifecycle_updated_at": command["createdAt"]}
            elif state.lifecycle_state == "implementation_verified":
                match = ACCEPT_PATTERN.fullmatch(command["body"].strip())
                command = command if match else None
                if command and match.group(1) == state.implementation_sha and head == state.implementation_sha:
                    evidence = {"lifecycle_state": "accepted", "accepted_sha": head,
                                "accepted_at": command["createdAt"],
                                "lifecycle_updated_at": command["createdAt"]}
            elif state.lifecycle_state == "accepted":
                command = command if command["body"].strip() == "/merge" else None
                if command and head == state.accepted_sha and pr.get("headRefOid") == state.accepted_sha:
                    evidence = {"lifecycle_state": "archive_authorized",
                                "merge_authorized_at": command["createdAt"],
                                "lifecycle_updated_at": command["createdAt"]}
            elif state.lifecycle_state == "archive_ci_verified":
                command = command if command["body"].strip() == "/merge" else None
                same_authorization = command and command["createdAt"] == state.merge_authorized_at
                legacy_authorization = command and state.merge_authorized_at is None
                checks = self.github_evidence.get("checks")
                if ((same_authorization or legacy_authorization)
                        and head == state.archive_sha and pr.get("headRefOid") == state.archive_sha
                        and checks and all(item.get("state") == "SUCCESS" for item in checks)):
                    evidence = {"lifecycle_state": "merge_authorized",
                                "merge_authorized_at": state.merge_authorized_at or command["createdAt"],
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
            "archive_authorized": "archive",
            "merge_authorized": "merge-finalization",
        }.get(state.lifecycle_state)
        if phase is None:
            return LifecycleTransition(False, blocker="current lifecycle state requires a trusted command")
        result = self.verify(
            target, phase, approved_spec_sha=state.spec_sha,
            expected_archive_sha=state.archive_sha,
            revision_base_sha=state.base_sha if state.lifecycle_state == "label" else None,
        )
        if not result.verified:
            return LifecycleTransition(False, blocker=result.blocker)
        try:
            head = self._run("git", "-C", target.worktree, "rev-parse", "HEAD")
            now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
            next_state = {"label": "specification_ready", "spec_approved": "independent_review",
                          "archive_authorized": "archive_ci_verified",
                          "merge_authorized": "merged_closed"}[
                              state.lifecycle_state]
            evidence = {"lifecycle_state": next_state, "lifecycle_updated_at": now}
            if next_state == "specification_ready":
                evidence["spec_sha"] = head
                evidence["base_sha"] = self._run(
                    "git", "-C", target.worktree, "merge-base", "HEAD", "origin/main",
                )
            elif next_state == "independent_review":
                from .independent_review import migrate_review_state
                review_state = migrate_review_state(state.as_dict())
                review_state["review_phase"] = "awaiting_review"
                from .deterministic_gates import run_gates
                review_state["deterministic_evidence"] = run_gates(
                    self.executor, target, head, state.spec_sha or "",
                    self.github_evidence["checks"],
                )
                evidence["implementation_sha"] = head
                evidence["review_state"] = review_state
            elif next_state == "archive_ci_verified": evidence["archive_sha"] = head
            elif next_state == "merged_closed": evidence["archive_sha"] = head
            return LifecycleTransition(True, evidence)
        except (OSError, RuntimeError, subprocess.SubprocessError) as error:
            return LifecycleTransition(False, blocker=str(error))

    def verify(self, target: GovernedTarget, phase: str, *,
               approved_spec_sha: str | None = None,
               expected_archive_sha: str | None = None,
               revision_base_sha: str | None = None) -> VerificationResult:
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
                base = revision_base_sha or self._run(
                    "git", "-C", target.worktree, "merge-base", "HEAD", "origin/main",
                )
                changed = self._run("git", "-C", target.worktree, "diff", "--name-only", base, "HEAD")
                allowed_root = active[0].relative_to(root).as_posix()
                for path in changed.splitlines():
                    evidence_doc = (path.startswith(f"docs/issue-{target.issue_number}-")
                                    and path.endswith(".md") and "/" not in path[5:])
                    planning_artifact = (
                        path in {f"{allowed_root}/proposal.md", f"{allowed_root}/design.md",
                                 f"{allowed_root}/tasks.md"}
                        or path.startswith(f"{allowed_root}/specs/")
                    )
                    allowed = (planning_artifact or evidence_doc) if revision_base_sha else (
                        path == allowed_root or path.startswith(allowed_root + "/") or evidence_doc
                    )
                    if not allowed:
                        return VerificationResult(False, f"specification changed prohibited path: {path}")
            elif phase in {"implementation", "review"}:
                approvals = [match.group(1) for body in comments
                             if (match := APPROVAL.fullmatch(body.strip()))]
                if not approvals:
                    return VerificationResult(False, "immutable spec approval is required")
                approved_sha = approved_spec_sha
                if approved_sha is None and len(approvals) == 1:
                    approved_sha = approvals[0]
                if approved_sha is None or approved_sha not in approvals:
                    return VerificationResult(False, "controller-approved spec SHA is unavailable")
                self._run("git", "-C", target.worktree, "merge-base", "--is-ancestor",
                          approved_sha, head)
                if len(active) != 1:
                    return VerificationResult(False, "approved OpenSpec change is unavailable")
                self._run(
                    "git", "-C", target.worktree, "diff", "--quiet", approved_sha, head, "--",
                    str((active[0] / "proposal.md").relative_to(root)),
                    str((active[0] / "design.md").relative_to(root)),
                    str((active[0] / "tasks.md").relative_to(root)),
                    str((active[0] / "specs").relative_to(root)),
                )
                if phase == "review":
                    if not any((root / "docs").glob("*evidence*.md")):
                        return VerificationResult(False, "review evidence is missing")
                    checks = self.github_evidence["checks"]
                    if not checks or any(item.get("state") != "SUCCESS" for item in checks):
                        return VerificationResult(False, "review CI evidence is not successful")
            elif phase == "archive":
                if not any(ACCEPT_PATTERN.fullmatch(body.strip()) for body in comments):
                    return VerificationResult(False, "archive requires trusted /accept")
                if active:
                    return VerificationResult(False, "OpenSpec change is not archived")
                checks = self.github_evidence["checks"]
                if not checks or any(item.get("state") != "SUCCESS" for item in checks):
                    return VerificationResult(False, "exact-SHA CI checks are not successful")
            elif phase == "merge-finalization":
                stripped = [body.strip() for body in comments]
                accept_indexes = [index for index, body in enumerate(stripped)
                                  if ACCEPT_PATTERN.fullmatch(body)]
                merge_indexes = [index for index, body in enumerate(stripped) if body == "/merge"]
                if not accept_indexes or not merge_indexes:
                    return VerificationResult(False, "merge and acceptance authorizations are missing")
                if merge_indexes[-1] < accept_indexes[-1]:
                    return VerificationResult(False, "merge authorization predates acceptance")
                if active or pr.get("state") != "MERGED" or not pr.get("mergeCommit"):
                    return VerificationResult(False, "PR is not merged with archived OpenSpec state")
                if expected_archive_sha is not None and (
                    head != expected_archive_sha or pr.get("headRefOid") != expected_archive_sha
                ):
                    return VerificationResult(False, "merged archive head does not match exact SHA")
                checks = self.github_evidence["checks"]
                if not checks or any(item.get("state") != "SUCCESS" for item in checks):
                    return VerificationResult(False, "merge-finalization checks are not successful")
                if issue.get("state") != "CLOSED":
                    return VerificationResult(False, "Issue is not closed")
            else:
                return VerificationResult(False, "unsupported workflow phase")
            return VerificationResult(True)
        except (OSError, ValueError, KeyError, TypeError, RuntimeError,
                subprocess.SubprocessError, json.JSONDecodeError) as error:
            return VerificationResult(False, str(error))

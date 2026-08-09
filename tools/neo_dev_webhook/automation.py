from __future__ import annotations

import hashlib
import hmac
import json
import os
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Mapping


REPOSITORY = "kingkill85/snap-flow"
ACTOR_ID = 11455872
ACTOR_LOGIN = "kingkill85"
MARKER = "<!-- neo-dev -->"
PROFILE = "dev"
BOARD = "private-dev"
WORKSPACE = "dir:/opt/data/profiles/dev"
PROJECT_CONTEXT = "/opt/data/profiles/dev/projects/snapflow.md"
ORCHESTRATOR_SKILL = "snapflow-orchestrator"


def has_standalone_marker(body: str) -> bool:
    return any(line == MARKER for line in body.splitlines()) or body == MARKER


@dataclass(frozen=True)
class Limits:
    body_bytes: int = 256 * 1024
    header_bytes: int = 1024
    total_header_bytes: int = 16 * 1024
    comment_chars: int = 64 * 1024
    labels: int = 100
    label_chars: int = 100


class Receiver:
    def __init__(self, secret, runner, *, limits=Limits(), rate_limit=60,
                 concurrency_limit=8):
        if not secret:
            raise ValueError("webhook secret is required")
        self.secret, self.runner, self.limits = secret.encode(), runner, limits
        self.rate_limit, self.timestamps = rate_limit, []
        self.semaphore = threading.BoundedSemaphore(concurrency_limit) if concurrency_limit > 0 else None
        self.rate_lock = threading.Lock()

    def handle(self, headers: Mapping[str, str], raw: bytes):
        if self.semaphore is None or not self.semaphore.acquire(blocking=False):
            return 503, "busy"
        try:
            if len(raw) > self.limits.body_bytes:
                return 413, "body_too_large"
            wanted = {key.lower(): value for key, value in headers.items()}
            if any(len(str(value).encode()) > self.limits.header_bytes for value in wanted.values()):
                return 431, "header_too_large"
            header_size = sum(len(str(name).encode()) + len(str(value).encode()) + 4
                              for name, value in headers.items())
            if header_size > self.limits.total_header_bytes:
                return 431, "headers_too_large"
            supplied = wanted.get("x-hub-signature-256", "")
            expected = "sha256=" + hmac.new(self.secret, raw, hashlib.sha256).hexdigest()
            if len(supplied) != len(expected) or not hmac.compare_digest(supplied, expected):
                return 401, "invalid_signature"
            delivery = wanted.get("x-github-delivery", "")
            try:
                canonical_delivery = str(uuid.UUID(delivery))
            except (ValueError, AttributeError):
                canonical_delivery = ""
            if canonical_delivery != delivery:
                return 400, "invalid_delivery"
            try:
                data = json.loads(raw)
            except (UnicodeDecodeError, json.JSONDecodeError):
                return 400, "invalid_json"
            if not isinstance(data, dict) or not isinstance(data.get("repository"), dict):
                return 400, "invalid_payload"
            if data["repository"].get("full_name") != REPOSITORY:
                return 403, "wrong_repository"
            event = wanted.get("x-github-event")
            if event not in {"issues", "issue_comment"}:
                return 202, "ignored"
            invalid = self._validate(data, event)
            if invalid is not None:
                return invalid
            issue = data["issue"]
            action = data["action"]
            if issue["state"] != "open" or "neo-dev" not in [label["name"] for label in issue["labels"]]:
                return 202, "ignored"
            if event == "issues":
                if action not in {"opened", "reopened", "edited", "labeled"}:
                    return 202, "ignored"
                if action == "labeled" and data.get("label", {}).get("name") != "neo-dev":
                    return 202, "ignored"
            elif (action != "created" or "pull_request" in issue
                  or has_standalone_marker(data["comment"]["body"])):
                return 202, "ignored"
            now = time.monotonic()
            with self.rate_lock:
                self.timestamps = [stamp for stamp in self.timestamps if stamp > now - 60]
                if len(self.timestamps) >= self.rate_limit:
                    return 429, "rate_limited"
                self.timestamps.append(now)
            try:
                self.runner.create({
                    "delivery_id": delivery,
                    "event": event,
                    "action": action,
                    "repository": REPOSITORY,
                    "issue_number": issue["number"],
                    "comment_id": data.get("comment", {}).get("id"),
                })
            except Exception:
                return 503, "handoff_unavailable"
            return 202, "accepted"
        except (KeyError, TypeError, ValueError):
            return 400, "invalid_payload"
        finally:
            self.semaphore.release()

    def _validate(self, data, event):
        sender = data.get("sender")
        issue = data.get("issue")
        if (not isinstance(data.get("action"), str) or not isinstance(sender, dict)
                or sender.get("id") != ACTOR_ID or sender.get("login") != ACTOR_LOGIN):
            return 403, "actor_forbidden"
        if (not isinstance(issue, dict) or type(issue.get("number")) is not int
                or issue["number"] <= 0 or issue.get("state") not in {"open", "closed"}):
            return 400, "invalid_payload"
        labels = issue.get("labels")
        if (not isinstance(labels, list) or len(labels) > self.limits.labels
                or any(not isinstance(label, dict) or not isinstance(label.get("name"), str)
                       or len(label["name"]) > self.limits.label_chars for label in labels)):
            return 400, "invalid_payload"
        if event == "issue_comment":
            comment = data.get("comment")
            if (not isinstance(comment, dict) or type(comment.get("id")) is not int
                    or not isinstance(comment.get("body"), str)
                    or len(comment["body"]) > self.limits.comment_chars):
                return 400, "invalid_payload"
            user = comment.get("user")
            if (not isinstance(user, dict) or user.get("id") != ACTOR_ID
                    or user.get("login") != ACTOR_LOGIN):
                return 403, "actor_forbidden"
        return None


class TaskRunner:
    def __init__(self, script_path: str | None = None, python: str = "python3",
                 max_runtime: str = "2h"):
        if max_runtime != "2h":
            raise ValueError("max_runtime must be exactly 2h")
        self.script = script_path or os.environ.get("NEO_DEV_TASK_RUNNER")
        if not self.script:
            raise ValueError("NEO_DEV_TASK_RUNNER is required")
        self.python, self.max_runtime, self.validated = python, max_runtime, False

    def _validate_contract(self):
        if self.validated:
            return
        result = subprocess.run([self.python, self.script, "--help"], check=True,
                                capture_output=True, text=True, timeout=10)
        required = ("--body", "--max-runtime", "--workspace", "--idempotency-key",
                    "--board", "--assignee", "title")
        if any(option not in result.stdout for option in required):
            raise RuntimeError("task.py contract is incompatible")
        self.validated = True

    def create(self, wakeup: dict) -> str:
        delivery_id = wakeup.get("delivery_id")
        try:
            if str(uuid.UUID(delivery_id)) != delivery_id:
                raise ValueError
        except (ValueError, TypeError, AttributeError) as error:
            raise ValueError("delivery identity must be a canonical UUID") from error
        self._validate_contract()
        comment = (f"\nComment ID: {wakeup['comment_id']}"
                   if wakeup.get("comment_id") is not None else "")
        body = f"""SnapFlow Neo Dev Kanban wakeup
Repository: {wakeup['repository']}
Issue: #{wakeup['issue_number']}
Event: {wakeup['event']}
Action: {wakeup['action']}
GitHub delivery ID: {delivery_id}{comment}
Assigned profile: {PROFILE}
Kanban board: {BOARD}
Workspace: {WORKSPACE}

Route this wakeup to the `{ORCHESTRATOR_SKILL}` skill. Read `{PROJECT_CONTEXT}` before acting. Fetch the live Issue, labels, comments, linked OpenSpec artifacts, branch, worktree, Draft PR, CI, and review state. Decide the next governed action from live evidence and supervise the sole resumable Codex implementation worker and fresh independent reviewers through the normal Neo Dev tool surface. Track progress in Kanban."""
        result = subprocess.run(
            [self.python, self.script, f"SnapFlow issue #{wakeup['issue_number']}",
             "--body", body, "--max-runtime", self.max_runtime,
             "--workspace", WORKSPACE, "--board", BOARD, "--assignee", PROFILE,
             "--idempotency-key", delivery_id],
            check=True, capture_output=True, text=True, timeout=70,
        )
        try:
            document = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise RuntimeError("task.py returned invalid JSON output") from error
        task_id = document.get("task_id") if isinstance(document, dict) else None
        if (not isinstance(document, dict) or document.get("durable") is not True
                or not isinstance(task_id, str) or not task_id.strip()):
            raise RuntimeError("task.py did not confirm durable task creation")
        return task_id.strip()

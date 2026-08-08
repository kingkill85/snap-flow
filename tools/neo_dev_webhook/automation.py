from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import subprocess
import threading
import time
import urllib.request
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


def retry_database_lock(operation, *, attempts=60, delay=0.05):
    for attempt in range(attempts):
        try:
            return operation()
        except sqlite3.OperationalError as error:
            if "locked" not in str(error).lower() or attempt + 1 >= attempts:
                raise
            time.sleep(delay)


class Store:
    """Durable delivery inbox. Every accepted delivery owns exactly one wakeup."""

    def __init__(self, path: str):
        if not path or path == ":memory:":
            raise ValueError("a durable filesystem database path is required")
        self.db = sqlite3.connect(path, isolation_level=None, check_same_thread=False, timeout=30)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA busy_timeout=30000")
        self.lock = threading.Lock()
        retry_database_lock(lambda: self.db.execute("PRAGMA journal_mode=WAL"))
        retry_database_lock(lambda: self.db.execute("PRAGMA synchronous=FULL"))
        retry_database_lock(lambda: self.db.execute("PRAGMA foreign_keys=ON"))
        retry_database_lock(lambda: self.db.executescript("""
            CREATE TABLE IF NOT EXISTS deliveries(
              delivery_id TEXT PRIMARY KEY, received_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS kanban_wakeups(
              id INTEGER PRIMARY KEY,
              delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries(delivery_id),
              repository TEXT NOT NULL,
              issue_number INTEGER NOT NULL,
              event TEXT NOT NULL,
              action TEXT NOT NULL,
              comment_id INTEGER,
              status TEXT NOT NULL DEFAULT 'queued',
              attempts INTEGER NOT NULL DEFAULT 0,
              lease_until REAL,
              claim_token TEXT,
              task_id TEXT,
              last_error TEXT,
              created_at REAL NOT NULL,
              updated_at REAL NOT NULL);
            CREATE INDEX IF NOT EXISTS queued_kanban_wakeups
              ON kanban_wakeups(status, id);
        """))
        self._migrate_legacy_wakeups()

    def _migrate_legacy_wakeups(self) -> None:
        """Retain old queue identity without authorizing the retired workflow to run."""
        tables = {row["name"] for row in self.db.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        )}
        if not {"active_work", "wakeups"}.issubset(tables):
            return

        def migrate():
            self.db.execute("BEGIN IMMEDIATE")
            try:
                self.db.execute("""
                    INSERT OR IGNORE INTO kanban_wakeups(
                      delivery_id,repository,issue_number,event,action,comment_id,status,
                      attempts,lease_until,claim_token,task_id,last_error,created_at,updated_at)
                    SELECT wakeup.delivery_id,work.repository,work.issue_number,
                           wakeup.event,wakeup.action,wakeup.comment_id,'blocked_legacy',
                           0,NULL,NULL,NULL,
                           'retired controller workflow requires separately authorized disposition',
                           wakeup.created_at,wakeup.created_at
                    FROM wakeups AS wakeup
                    JOIN active_work AS work ON work.id=wakeup.work_id
                """)
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

        retry_database_lock(migrate)

    def close(self):
        self.db.close()

    def count(self, table: str) -> int:
        if table not in {"deliveries", "kanban_wakeups"}:
            raise ValueError("invalid table")
        return self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

    def accept(self, record: dict) -> str:
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                now = time.time()
                try:
                    self.db.execute(
                        "INSERT INTO deliveries(delivery_id,received_at) VALUES (?,?)",
                        (record["delivery_id"], now),
                    )
                except sqlite3.IntegrityError:
                    self.db.execute("COMMIT")
                    return "duplicate"
                self.db.execute(
                    "INSERT INTO kanban_wakeups("
                    "delivery_id,repository,issue_number,event,action,comment_id,created_at,updated_at"
                    ") VALUES (?,?,?,?,?,?,?,?)",
                    (record["delivery_id"], record["repository"], record["issue_number"],
                     record["event"], record["action"], record.get("comment_id"), now, now),
                )
                self.db.execute("COMMIT")
                return "accepted"
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def claim(self, now: float | None = None, lease_seconds: int = 300,
              max_attempts: int = 5):
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        now = time.time() if now is None else now
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                self.db.execute(
                    "UPDATE kanban_wakeups SET status='dead',lease_until=NULL,claim_token=NULL,"
                    "last_error='maximum attempts exhausted during lease recovery',updated_at=? "
                    "WHERE attempts>=? AND (status='queued' OR "
                    "(status='processing' AND lease_until<=?))",
                    (now, max_attempts, now),
                )
                row = self.db.execute(
                    "SELECT * FROM kanban_wakeups WHERE attempts<? AND "
                    "(status='queued' OR (status='processing' AND lease_until<=?)) "
                    "ORDER BY id LIMIT 1", (max_attempts, now),
                ).fetchone()
                if row is None:
                    self.db.execute("COMMIT")
                    return None
                token = str(uuid.uuid4())
                changed = self.db.execute(
                    "UPDATE kanban_wakeups SET status='processing',attempts=attempts+1,"
                    "lease_until=?,claim_token=?,updated_at=? WHERE id=? AND "
                    "(status='queued' OR (status='processing' AND lease_until<=?))",
                    (now + lease_seconds, token, now, row["id"], now),
                ).rowcount
                if changed != 1:
                    raise RuntimeError("wakeup claim race")
                result = dict(self.db.execute(
                    "SELECT * FROM kanban_wakeups WHERE id=?", (row["id"],),
                ).fetchone())
                self.db.execute("COMMIT")
                return result
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def complete(self, wakeup_id: int, claim_token: str, task_id: str,
                 now: float | None = None):
        now = time.time() if now is None else now
        with self.lock:
            changed = self.db.execute(
                "UPDATE kanban_wakeups SET status='created',task_id=?,attempts=0,"
                "lease_until=NULL,claim_token=NULL,last_error=NULL,updated_at=? "
                "WHERE id=? AND status='processing' AND claim_token=?",
                (task_id, now, wakeup_id, claim_token),
            ).rowcount
            if changed != 1:
                raise RuntimeError("wakeup claim is no longer owned")

    def fail(self, wakeup_id: int, claim_token: str, error: str, max_attempts: int,
             now: float | None = None):
        now = time.time() if now is None else now
        with self.lock:
            row = self.db.execute(
                "SELECT attempts FROM kanban_wakeups WHERE id=? AND status='processing' "
                "AND claim_token=?", (wakeup_id, claim_token),
            ).fetchone()
            if row is None:
                raise RuntimeError("wakeup claim is no longer owned")
            status = "dead" if row["attempts"] >= max_attempts else "queued"
            self.db.execute(
                "UPDATE kanban_wakeups SET status=?,lease_until=NULL,claim_token=NULL,"
                "last_error=?,updated_at=? WHERE id=? AND claim_token=?",
                (status, error[:1000], now, wakeup_id, claim_token),
            )

    def list_wakeups(self):
        return [dict(row) for row in self.db.execute(
            "SELECT * FROM kanban_wakeups ORDER BY id"
        )]


class PublicGitHubAdapter:
    """Fail-closed public API adapter. Intentionally sends no Authorization header."""

    def revalidate(self, repository: str, issue_number: int):
        url = f"https://api.github.com/repos/{repository}/issues/{issue_number}"
        request = urllib.request.Request(url, headers={
            "Accept": "application/vnd.github+json",
            "User-Agent": "snapflow-neo-dev-webhook",
        })
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.load(response)
        return {
            "open": data.get("state") == "open",
            "labels": [item.get("name") for item in data.get("labels", [])
                       if isinstance(item, dict)],
            "is_pr": "pull_request" in data,
        }


class Receiver:
    def __init__(self, secret, store, github, *, limits=Limits(), rate_limit=60,
                 concurrency_limit=8):
        if not secret:
            raise ValueError("webhook secret is required")
        self.secret, self.store, self.github, self.limits = secret.encode(), store, github, limits
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
                status = self.store.accept({
                    "delivery_id": delivery,
                    "event": event,
                    "action": action,
                    "repository": REPOSITORY,
                    "issue_number": issue["number"],
                    "comment_id": data.get("comment", {}).get("id"),
                })
            except sqlite3.Error:
                return 503, "persistence_unavailable"
            return (202 if status == "accepted" else 200), status
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


class Consumer:
    def __init__(self, store: Store, runner: TaskRunner, github: PublicGitHubAdapter,
                 lease_seconds: int = 300, max_attempts: int = 5):
        self.store, self.runner, self.github = store, runner, github
        self.lease_seconds, self.max_attempts = lease_seconds, max_attempts

    def run_one(self, now=None) -> bool:
        wakeup = self.store.claim(now, self.lease_seconds, self.max_attempts)
        if wakeup is None:
            return False
        try:
            live = self.github.revalidate(wakeup["repository"], wakeup["issue_number"])
            if not live.get("open") or live.get("is_pr") or "neo-dev" not in live.get("labels", []):
                raise RuntimeError("GitHub issue is no longer eligible")
            task_id = self.runner.create(wakeup)
            self.store.complete(wakeup["id"], wakeup["claim_token"], task_id, now)
            return True
        except Exception as error:
            self.store.fail(wakeup["id"], wakeup["claim_token"], str(error),
                            self.max_attempts, now)
            return False

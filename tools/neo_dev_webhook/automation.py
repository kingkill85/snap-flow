from __future__ import annotations

import hashlib
import hmac
import json
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
TASK_SCRIPT = "/opt/data/scripts/neo-dev/task.py"


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
            CREATE TABLE IF NOT EXISTS active_work(
              id INTEGER PRIMARY KEY, repository TEXT NOT NULL, issue_number INTEGER NOT NULL,
              idempotency_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0, lease_until REAL,
              claim_token TEXT, task_id TEXT, last_error TEXT,
              processed_wakeup_id INTEGER,
              created_at REAL NOT NULL, updated_at REAL NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS one_live_work_per_issue
              ON active_work(repository, issue_number) WHERE status IN ('queued','processing');
            CREATE TABLE IF NOT EXISTS wakeups(
              id INTEGER PRIMARY KEY, delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries,
              work_id INTEGER NOT NULL REFERENCES active_work, event TEXT NOT NULL,
              action TEXT NOT NULL, comment_id INTEGER, created_at REAL NOT NULL);
        """))
        columns = {row["name"] for row in retry_database_lock(
            lambda: self.db.execute("PRAGMA table_info(active_work)")
        )}
        if "claim_token" not in columns:
            retry_database_lock(lambda: self.db.execute("ALTER TABLE active_work ADD COLUMN claim_token TEXT"))
        if "processed_wakeup_id" not in columns:
            retry_database_lock(lambda: self.db.execute("ALTER TABLE active_work ADD COLUMN processed_wakeup_id INTEGER"))

    def close(self):
        self.db.close()

    def count(self, table: str) -> int:
        if table not in {"deliveries", "wakeups", "active_work"}:
            raise ValueError("invalid table")
        return self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

    def accept(self, record: dict) -> str:
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                try:
                    self.db.execute("INSERT INTO deliveries VALUES (?,?)", (record["delivery_id"], time.time()))
                except sqlite3.IntegrityError:
                    self.db.execute("COMMIT")
                    return "duplicate"
                row = self.db.execute(
                    "SELECT id FROM active_work WHERE repository=? AND issue_number=? "
                    "AND status IN ('queued','processing')",
                    (record["repository"], record["issue_number"]),
                ).fetchone()
                now = time.time()
                if row is None:
                    cursor = self.db.execute(
                        "INSERT INTO active_work(repository,issue_number,idempotency_key,status,created_at,updated_at) "
                        "VALUES (?,?,?,'queued',?,?)",
                        (record["repository"], record["issue_number"], record["delivery_id"], now, now),
                    )
                    work_id = cursor.lastrowid
                else:
                    work_id = row["id"]
                self.db.execute(
                    "INSERT INTO wakeups(delivery_id,work_id,event,action,comment_id,created_at) VALUES (?,?,?,?,?,?)",
                    (record["delivery_id"], work_id, record["event"], record["action"], record["comment_id"], now),
                )
                self.db.execute("COMMIT")
                return "accepted"
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def claim(self, now: float | None = None, lease_seconds: int = 300, max_attempts: int = 5):
        if max_attempts < 1:
            raise ValueError("max_attempts must be positive")
        now = time.time() if now is None else now
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                self.db.execute(
                    "UPDATE active_work SET status='dead',lease_until=NULL,claim_token=NULL,"
                    "last_error='maximum attempts exhausted during lease recovery',updated_at=? "
                    "WHERE attempts>=? AND (status='queued' OR "
                    "(status='processing' AND lease_until<=?))",
                    (now, max_attempts, now),
                )
                row = self.db.execute(
                    "SELECT * FROM active_work WHERE attempts<? AND (status='queued' OR "
                    "(status='processing' AND lease_until<=?)) ORDER BY id LIMIT 1",
                    (max_attempts, now),
                ).fetchone()
                if row is None:
                    self.db.execute("COMMIT")
                    return None
                claim_token = str(uuid.uuid4())
                wakeup_boundary = self.db.execute(
                    "SELECT max(id) FROM wakeups WHERE work_id=?", (row["id"],)
                ).fetchone()[0]
                changed = self.db.execute(
                    "UPDATE active_work SET status='processing',attempts=attempts+1,lease_until=?,"
                    "claim_token=?,processed_wakeup_id=?,updated_at=? "
                    "WHERE id=? AND (status='queued' OR (status='processing' AND lease_until<=?))",
                    (now + lease_seconds, claim_token, wakeup_boundary, now, row["id"], now),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("work claim race")
                result = dict(self.db.execute("SELECT * FROM active_work WHERE id=?", (row["id"],)).fetchone())
                result["wakeups"] = [dict(x) for x in self.db.execute(
                    "SELECT * FROM wakeups WHERE work_id=? AND id<=? ORDER BY id",
                    (row["id"], wakeup_boundary),
                )]
                self.db.execute("COMMIT")
                return result
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def complete(self, work_id: int, claim_token: str, task_id: str, now: float | None = None):
        completed_at = time.time() if now is None else now
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                work = self.db.execute(
                    "SELECT * FROM active_work WHERE id=? AND status='processing' AND claim_token=?",
                    (work_id, claim_token),
                ).fetchone()
                if work is None:
                    raise RuntimeError("work is not processing")
                late_wakeups = list(self.db.execute(
                    "SELECT * FROM wakeups WHERE work_id=? AND id>? ORDER BY id",
                    (work_id, work["processed_wakeup_id"]),
                ))
                changed = self.db.execute(
                    "UPDATE active_work SET status='completed',task_id=?,lease_until=NULL,claim_token=NULL,last_error=NULL,updated_at=? "
                    "WHERE id=? AND status='processing' AND claim_token=?",
                    (task_id, completed_at, work_id, claim_token),
                ).rowcount
                if changed != 1:
                    raise RuntimeError("work is not processing")
                if late_wakeups:
                    first_delivery = late_wakeups[0]["delivery_id"]
                    successor = self.db.execute(
                        "INSERT INTO active_work(repository,issue_number,idempotency_key,status,created_at,updated_at) "
                        "VALUES (?,?,?,'queued',?,?)",
                        (work["repository"], work["issue_number"], first_delivery,
                         completed_at, completed_at),
                    ).lastrowid
                    self.db.execute(
                        "UPDATE wakeups SET work_id=? WHERE work_id=? AND id>?",
                        (successor, work_id, work["processed_wakeup_id"]),
                    )
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def fail(self, work_id: int, claim_token: str, error: str, max_attempts: int, now: float | None = None):
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                changed = self.db.execute(
                    "UPDATE active_work SET status=CASE WHEN attempts>=? THEN 'dead' ELSE 'queued' END,"
                    "lease_until=NULL,claim_token=NULL,last_error=?,updated_at=? "
                    "WHERE id=? AND status='processing' AND claim_token=?",
                    (max_attempts, error[:1000], time.time() if now is None else now, work_id, claim_token),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("work claim is no longer owned")
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def get_active(self, repository: str, issue_number: int):
        row = self.db.execute("SELECT * FROM active_work WHERE repository=? AND issue_number=? ORDER BY id DESC LIMIT 1", (repository, issue_number)).fetchone()
        return None if row is None else dict(row)


class PublicGitHubAdapter:
    """Fail-closed public API adapter. Intentionally sends no Authorization header."""
    def revalidate(self, repository: str, issue_number: int):
        url = f"https://api.github.com/repos/{repository}/issues/{issue_number}"
        request = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "snapflow-neo-dev-webhook"})
        with urllib.request.urlopen(request, timeout=10) as response:
            data = json.load(response)
        return {
            "open": data.get("state") == "open",
            "labels": [item.get("name") for item in data.get("labels", []) if isinstance(item, dict)],
            "is_pr": "pull_request" in data,
        }


class Receiver:
    def __init__(self, secret, store, github, *, limits=Limits(), rate_limit=60, concurrency_limit=8):
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
            wanted = {k.lower(): v for k, v in headers.items()}
            if any(len(str(value).encode()) > self.limits.header_bytes for value in wanted.values()):
                return 431, "header_too_large"
            header_size = sum(
                len(str(name).encode()) + len(str(value).encode()) + 4
                for name, value in headers.items()
            )
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
            if not isinstance(data, dict):
                return 400, "invalid_payload"
            repository = data.get("repository")
            if not isinstance(repository, dict):
                return 400, "invalid_payload"
            if repository.get("full_name") != REPOSITORY:
                return 403, "wrong_repository"
            event = wanted.get("x-github-event")
            if event not in {"issues", "issue_comment"}:
                return 202, "ignored"
            valid = self._validate(data, event)
            if valid is not None:
                return valid
            issue = data["issue"]
            if issue["state"] != "open" or "neo-dev" not in [x["name"] for x in issue["labels"]]:
                return 202, "ignored"
            action = data["action"]
            if event == "issues":
                if action not in {"opened", "reopened", "edited", "labeled"}:
                    return 202, "ignored"
                if action == "labeled" and data.get("label", {}).get("name") != "neo-dev":
                    return 202, "ignored"
            else:
                if action != "created" or "pull_request" in issue or has_standalone_marker(data["comment"]["body"]):
                    return 202, "ignored"
            now = time.monotonic()
            with self.rate_lock:
                self.timestamps = [stamp for stamp in self.timestamps if stamp > now - 60]
                if len(self.timestamps) >= self.rate_limit:
                    return 429, "rate_limited"
                self.timestamps.append(now)
            status = self.store.accept({"delivery_id": delivery, "event": event, "action": action, "repository": REPOSITORY, "issue_number": issue["number"], "comment_id": data.get("comment", {}).get("id")})
            return (202 if status == "accepted" else 200), status
        except (KeyError, TypeError, ValueError, sqlite3.Error):
            return 400, "invalid_payload"
        finally:
            self.semaphore.release()

    def _validate(self, data, event):
        sender = data.get("sender")
        issue = data.get("issue")
        if not isinstance(data.get("action"), str) or not isinstance(sender, dict) or sender.get("id") != ACTOR_ID or sender.get("login") != ACTOR_LOGIN:
            return 403, "actor_forbidden"
        if not isinstance(issue, dict) or type(issue.get("number")) is not int or issue["number"] <= 0 or issue.get("state") not in {"open", "closed"}:
            return 400, "invalid_payload"
        labels = issue.get("labels")
        if not isinstance(labels, list) or len(labels) > self.limits.labels or any(not isinstance(x, dict) or not isinstance(x.get("name"), str) or len(x["name"]) > self.limits.label_chars for x in labels):
            return 400, "invalid_payload"
        if event == "issue_comment":
            comment = data.get("comment")
            if not isinstance(comment, dict) or type(comment.get("id")) is not int or not isinstance(comment.get("body"), str) or len(comment["body"]) > self.limits.comment_chars:
                return 400, "invalid_payload"
            user = comment.get("user")
            if not isinstance(user, dict) or user.get("id") != ACTOR_ID or user.get("login") != ACTOR_LOGIN:
                return 403, "actor_forbidden"
        return None


class TaskRunner:
    def __init__(self, script: str = TASK_SCRIPT, python: str = "python3",
                 workspace: str = "scratch", max_runtime: str = "2h"):
        if not max_runtime or max_runtime.startswith("-"):
            raise ValueError("max_runtime must be a bounded task.py duration")
        self.script, self.python, self.workspace = script, python, workspace
        self.max_runtime, self.validated = max_runtime, False

    def _validate_contract(self):
        if self.validated:
            return
        help_result = subprocess.run(
            [self.python, self.script, "--help"], check=True,
            capture_output=True, text=True, timeout=10,
        )
        required = ("--body", "--max-runtime", "--workspace", "--idempotency-key", "title")
        if any(option not in help_result.stdout for option in required):
            raise RuntimeError("task.py contract is incompatible")
        self.validated = True

    def create(self, work: dict, idempotency_key: str) -> str:
        self._validate_contract()
        description = f"Process SnapFlow issue #{work['issue_number']} with {len(work['wakeups'])} durable wakeup(s)."
        result = subprocess.run(
            [self.python, self.script, f"SnapFlow issue #{work['issue_number']}",
             "--body", description, "--max-runtime", self.max_runtime,
             "--workspace", self.workspace,
             "--idempotency-key", idempotency_key],
            check=True, capture_output=True, text=True, timeout=30,
        )
        decoder = json.JSONDecoder()
        remaining = result.stdout
        documents = []
        while remaining.strip():
            remaining = remaining.lstrip()
            try:
                document, offset = decoder.raw_decode(remaining)
            except json.JSONDecodeError as error:
                raise RuntimeError("task.py returned invalid JSON output") from error
            documents.append(document)
            remaining = remaining[offset:]
        for document in documents:
            if isinstance(document, dict):
                candidates = [document]
                candidates.extend(
                    document[key] for key in ("task", "data")
                    if isinstance(document.get(key), dict)
                )
                for candidate in candidates:
                    task_id = candidate.get("id") or candidate.get("task_id")
                    if isinstance(task_id, (str, int)) and not isinstance(task_id, bool):
                        return str(task_id)
        raise RuntimeError("task.py did not return a task id")


class Consumer:
    def __init__(self, store: Store, runner: TaskRunner, github: PublicGitHubAdapter,
                 lease_seconds: int = 300, max_attempts: int = 5):
        self.store, self.runner, self.github = store, runner, github
        self.lease_seconds, self.max_attempts = lease_seconds, max_attempts

    def run_one(self, now=None) -> bool:
        work = self.store.claim(now, self.lease_seconds, self.max_attempts)
        if work is None:
            return False
        try:
            live = self.github.revalidate(work["repository"], work["issue_number"])
            if not live.get("open") or live.get("is_pr") or "neo-dev" not in live.get("labels", []):
                raise RuntimeError("GitHub issue is no longer eligible")
            task_id = self.runner.create(work, work["idempotency_key"])
            self.store.complete(work["id"], work["claim_token"], task_id, now)
            return True
        except Exception as error:
            self.store.fail(work["id"], work["claim_token"], str(error), self.max_attempts, now)
            return False

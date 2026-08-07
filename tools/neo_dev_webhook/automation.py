from __future__ import annotations

import hashlib
import base64
import hmac
import json
import os
import pathlib
import re
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
APPROVE_SPEC_PATTERN = re.compile(r"^/approve-spec [0-9a-f]{40}$")
REVISE_SPEC_PATTERN = re.compile(r"^/revise-spec\s+\S(?:.*\S)?$", re.DOTALL)
FIX_PATTERN = re.compile(r"^/fix\s+\S(?:.*\S)?$", re.DOTALL)


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
            DROP INDEX IF EXISTS one_live_work_per_issue;
            CREATE UNIQUE INDEX IF NOT EXISTS one_live_work_per_issue
              ON active_work(repository, issue_number) WHERE status IN ('queued','processing','waiting');
            CREATE TABLE IF NOT EXISTS wakeups(
              id INTEGER PRIMARY KEY, delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries,
              work_id INTEGER NOT NULL REFERENCES active_work, event TEXT NOT NULL,
              action TEXT NOT NULL, comment_id INTEGER, command TEXT, created_at REAL NOT NULL);
            CREATE TABLE IF NOT EXISTS finalization_requests(
              id INTEGER PRIMARY KEY, delivery_id TEXT NOT NULL UNIQUE REFERENCES deliveries,
              work_id INTEGER NOT NULL REFERENCES active_work, status TEXT NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0, last_error TEXT,
              next_attempt_at REAL NOT NULL DEFAULT 0,
              created_at REAL NOT NULL, updated_at REAL NOT NULL);
        """))
        columns = {row["name"] for row in retry_database_lock(
            lambda: self.db.execute("PRAGMA table_info(active_work)")
        )}
        if "claim_token" not in columns:
            retry_database_lock(lambda: self.db.execute("ALTER TABLE active_work ADD COLUMN claim_token TEXT"))
        if "processed_wakeup_id" not in columns:
            retry_database_lock(lambda: self.db.execute("ALTER TABLE active_work ADD COLUMN processed_wakeup_id INTEGER"))
        wakeup_columns = {row["name"] for row in retry_database_lock(
            lambda: self.db.execute("PRAGMA table_info(wakeups)")
        )}
        if "command" not in wakeup_columns:
            retry_database_lock(lambda: self.db.execute("ALTER TABLE wakeups ADD COLUMN command TEXT"))
        finalization_columns = {row["name"] for row in retry_database_lock(
            lambda: self.db.execute("PRAGMA table_info(finalization_requests)")
        )}
        if "next_attempt_at" not in finalization_columns:
            retry_database_lock(lambda: self.db.execute(
                "ALTER TABLE finalization_requests ADD COLUMN next_attempt_at REAL NOT NULL DEFAULT 0"
            ))

    def close(self):
        self.db.close()

    def count(self, table: str) -> int:
        if table not in {"deliveries", "wakeups", "active_work"}:
            raise ValueError("invalid table")
        return self.db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]

    def _promote_late_wakeups(self, work, now: float):
        boundary = work["processed_wakeup_id"] or 0
        late_wakeups = list(self.db.execute(
            "SELECT * FROM wakeups WHERE work_id=? AND id>? ORDER BY id",
            (work["id"], boundary),
        ))
        if not late_wakeups:
            return
        first_delivery = late_wakeups[0]["delivery_id"]
        successor = self.db.execute(
            "INSERT INTO active_work(repository,issue_number,idempotency_key,status,created_at,updated_at) "
            "VALUES (?,?,?,'queued',?,?)",
            (work["repository"], work["issue_number"], first_delivery, now, now),
        ).lastrowid
        self.db.execute(
            "UPDATE wakeups SET work_id=? WHERE work_id=? AND id>?",
            (successor, work["id"], boundary),
        )

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
                    "AND status IN ('queued','processing','waiting')",
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
                        "UPDATE active_work SET status='queued',updated_at=? "
                        "WHERE id=? AND status='waiting'", (now, work_id),
                    )
                self.db.execute(
                    "INSERT INTO wakeups(delivery_id,work_id,event,action,comment_id,command,created_at) VALUES (?,?,?,?,?,?,?)",
                    (record["delivery_id"], work_id, record["event"], record["action"],
                     record["comment_id"], record.get("command"), now),
                )
                self.db.execute("COMMIT")
                return "accepted"
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def request_finalization(self, repository: str, issue_number: int, delivery_id: str) -> str:
        """Persist closure as an auditable request; receiver performs no verification work."""
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                try:
                    self.db.execute("INSERT INTO deliveries VALUES (?,?)", (delivery_id, time.time()))
                except sqlite3.IntegrityError:
                    self.db.execute("COMMIT")
                    return "duplicate"
                work = self.db.execute(
                    "SELECT id FROM active_work WHERE repository=? AND issue_number=? "
                    "AND status='waiting'", (repository, issue_number),
                ).fetchone()
                if work is None:
                    raise RuntimeError("Issue closure does not match one waiting workflow")
                now = time.time()
                self.db.execute(
                    "INSERT INTO finalization_requests(delivery_id,work_id,status,created_at,updated_at) "
                    "VALUES (?,?,'pending',?,?)", (delivery_id, work["id"], now, now),
                )
                self.db.execute("COMMIT")
                return "finalization_pending"
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def claim_finalization(self, max_attempts: int = 5, now: float | None = None):
        now = time.time() if now is None else now
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                row = self.db.execute(
                    "SELECT request.*,work.repository,work.issue_number,work.idempotency_key "
                    "FROM finalization_requests request JOIN active_work work ON work.id=request.work_id "
                    "WHERE request.status='pending' AND request.attempts<? "
                    "AND request.next_attempt_at<=? ORDER BY request.id LIMIT 1",
                    (max_attempts, now),
                ).fetchone()
                if row is None:
                    self.db.execute("COMMIT")
                    return None
                self.db.execute(
                    "UPDATE finalization_requests SET attempts=attempts+1,updated_at=? WHERE id=?",
                    (now, row["id"]),
                )
                result = dict(self.db.execute(
                    "SELECT request.*,work.repository,work.issue_number,work.idempotency_key "
                    "FROM finalization_requests request JOIN active_work work ON work.id=request.work_id "
                    "WHERE request.id=?", (row["id"],),
                ).fetchone())
                self.db.execute("COMMIT")
                return result
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def finish_finalization(self, request_id: int, verified: bool | None, error: str | None,
                            max_attempts: int = 5, now: float | None = None) -> None:
        now = time.time() if now is None else now
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                request = self.db.execute(
                    "SELECT * FROM finalization_requests WHERE id=?", (request_id,),
                ).fetchone()
                if request is None or request["status"] != "pending":
                    raise RuntimeError("finalization request is not pending")
                if verified:
                    changed = self.db.execute(
                        "UPDATE active_work SET status='completed',updated_at=? "
                        "WHERE id=? AND status='waiting'", (time.time(), request["work_id"]),
                    ).rowcount
                    if changed != 1:
                        raise RuntimeError("verified finalization does not match waiting workflow")
                    status = "verified"
                elif verified is False:
                    status = "blocked" if request["attempts"] >= max_attempts else "pending"
                else:
                    status = "pending"
                self.db.execute(
                    "UPDATE finalization_requests SET status=?,attempts=?,last_error=?,"
                    "next_attempt_at=?,updated_at=? WHERE id=?",
                    (status, request["attempts"] - 1 if verified is None else request["attempts"],
                     None if verified else (error or "verification pending")[:1000],
                     now + 30 if verified is None else 0, now, request_id),
                )
                self.db.execute("COMMIT")
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
                exhausted = list(self.db.execute(
                    "SELECT * FROM active_work WHERE attempts>=? AND (status='queued' OR "
                    "(status='processing' AND lease_until<=?)) ORDER BY id",
                    (max_attempts, now),
                ))
                for work in exhausted:
                    changed = self.db.execute(
                        "UPDATE active_work SET status='dead',lease_until=NULL,claim_token=NULL,"
                        "last_error='maximum attempts exhausted during lease recovery',updated_at=? "
                        "WHERE id=? AND attempts>=? AND (status='queued' OR "
                        "(status='processing' AND lease_until<=?))",
                        (now, work["id"], max_attempts, now),
                    ).rowcount
                    if changed != 1:
                        raise RuntimeError("exhausted work recovery race")
                    self._promote_late_wakeups(work, now)
                row = self.db.execute(
                    "SELECT * FROM active_work WHERE attempts<? AND (status='queued' OR "
                    "(status='processing' AND lease_until<=?)) AND NOT EXISTS ("
                    "SELECT 1 FROM active_work blocker WHERE blocker.status='waiting' OR "
                    "(blocker.status='processing' AND blocker.lease_until>?)"
                    ") ORDER BY id LIMIT 1",
                    (max_attempts, now, now),
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
                late_wakeup = self.db.execute(
                    "SELECT 1 FROM wakeups WHERE work_id=? AND id>? LIMIT 1",
                    (work_id, work["processed_wakeup_id"] or 0),
                ).fetchone() is not None
                changed = self.db.execute(
                    "UPDATE active_work SET status=?,task_id=?,attempts=0,lease_until=NULL,claim_token=NULL,last_error=NULL,updated_at=? "
                    "WHERE id=? AND status='processing' AND claim_token=?",
                    ("queued" if late_wakeup else "waiting", task_id, completed_at,
                     work_id, claim_token),
                ).rowcount
                if changed != 1:
                    raise RuntimeError("work is not processing")
                self.db.execute("COMMIT")
            except BaseException:
                self.db.execute("ROLLBACK")
                raise

    def fail(self, work_id: int, claim_token: str, error: str, max_attempts: int, now: float | None = None):
        failed_at = time.time() if now is None else now
        with self.lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                work = self.db.execute(
                    "SELECT * FROM active_work WHERE id=? AND status='processing' AND claim_token=?",
                    (work_id, claim_token),
                ).fetchone()
                if work is None:
                    raise RuntimeError("work claim is no longer owned")
                terminal = work["attempts"] >= max_attempts
                changed = self.db.execute(
                    "UPDATE active_work SET status=?,lease_until=NULL,claim_token=NULL,last_error=?,updated_at=? "
                    "WHERE id=? AND status='processing' AND claim_token=?",
                    ("dead" if terminal else "queued", error[:1000], failed_at, work_id, claim_token),
                )
                if changed.rowcount != 1:
                    raise RuntimeError("work claim is no longer owned")
                if terminal:
                    self._promote_late_wakeups(work, failed_at)
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
    def __init__(self, secret, store, github, *, finalizer=None, limits=Limits(), rate_limit=60,
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
            action = data["action"]
            if event == "issues" and action == "closed":
                status = self.store.request_finalization(REPOSITORY, issue["number"], delivery)
                return (202 if status == "finalization_pending" else 200), status
            if issue["state"] != "open" or "neo-dev" not in [x["name"] for x in issue["labels"]]:
                return 202, "ignored"
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
            command = None
            if event == "issue_comment":
                body = data["comment"]["body"].strip()
                if APPROVE_SPEC_PATTERN.fullmatch(body):
                    command = body
                elif REVISE_SPEC_PATTERN.fullmatch(body):
                    command = body
                elif FIX_PATTERN.fullmatch(body):
                    command = body
                elif body in {"/accept", "/merge"}:
                    command = body
                else:
                    command = "finding"
            status = self.store.accept({"delivery_id": delivery, "event": event,
                "action": action, "repository": REPOSITORY, "issue_number": issue["number"],
                "comment_id": data.get("comment", {}).get("id"), "command": command})
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
    def __init__(self, script_path: str | None = None, python: str = "python3",
                 max_runtime: str = "2h", capability_broker=None,
                 enforcement_path: str | None = None):
        if not max_runtime or max_runtime.startswith("-"):
            raise ValueError("max_runtime must be a bounded task.py duration")
        self.script = script_path or os.environ.get("NEO_DEV_TASK_RUNNER")
        if not self.script:
            raise ValueError("NEO_DEV_TASK_RUNNER is required")
        self.python = python
        self.workspace = "dir:/opt/data/profiles/dev"
        self.max_runtime, self.validated = max_runtime, False
        self.capability_broker = capability_broker
        self.enforcement_path = enforcement_path

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
        if self.enforcement_path:
            enforcement = pathlib.Path(self.enforcement_path).read_text(encoding="utf-8")
            if ("toolsets=snapflow_neo_dev,web,browser,memory,session_search,skills\n" not in enforcement
                    or "tool=snapflow_neo_dev_transition\n" not in enforcement
                    or "resolved_worker_toolsets" not in enforcement):
                raise RuntimeError("Hermes native task-tool enforcement is not verified")
        self.validated = True

    def create(self, work: dict, idempotency_key: str) -> str:
        if not isinstance(idempotency_key, str) or not idempotency_key.strip():
            raise ValueError("idempotency_key must be a non-empty string")
        idempotency_key = idempotency_key.strip()
        self._validate_contract()
        latest = work["wakeups"][-1] if work["wakeups"] else {}
        delivery_id = latest.get("delivery_id")
        try:
            execution_id = str(uuid.uuid5(uuid.UUID(idempotency_key), str(uuid.UUID(delivery_id))))
        except (ValueError, TypeError, AttributeError) as error:
            raise ValueError("lifecycle and wakeup identities must be canonical UUIDs") from error
        command = latest.get("command")
        phase_command = command
        if isinstance(command, str):
            if command.startswith("/approve-spec "):
                phase_command = "approve-spec"
            elif command.startswith("/revise-spec "):
                phase_command = "revise-spec"
            elif command.startswith("/fix "):
                phase_command = "fix"
        phase = {None: "specification", "approve-spec": "implementation",
                 "revise-spec": "specification-revision", "fix": "implementation-correction",
                 "/accept": "awaiting-merge", "/merge": "merge-finalization",
                 "finding": "review-correction"}.get(phase_command, "blocked-invalid-phase")
        operation = "start" if work.get("task_id") is None else "resume"
        capability = (self.capability_broker.issue(
            idempotency_key, execution_id, work["issue_number"], phase, latest,
        ) if self.capability_broker else "unavailable-outside-installed-Hermes-profile")
        description = f"""SnapFlow governed Issue workflow (self-contained controller task)
Repository: {REPOSITORY}
Issue: #{work['issue_number']}
Durable workflow identity: {idempotency_key}
Runnable wakeup execution identity: {execution_id}
Wakeups included: {len(work['wakeups'])}; latest event/action/command: {latest.get('event')}/{latest.get('action')}/{command or 'neo-dev-label'}
Current phase: {phase}
Structured controller context: {json.dumps(work.get('controller_context', {}), sort_keys=True, separators=(',', ':'))}
Controller workspace: dir:/opt/data/profiles/dev (read /opt/data/profiles/dev/projects/snapflow.md before any action).
Controller dispatch operation already performed by the consumer: {operation}. This card has no project-command capability.
Allowed decision tool: native Hermes tool `snapflow_neo_dev_transition` with execution_id=`{execution_id}`, capability=`{capability}`, decision=`proceed|block`, and a bounded summary.
Use only structured lifecycle context and that one-use decision tool. Terminal, code execution, shell, SSH, Git, filesystem writes, and project-controller commands are unavailable to this task.
Initial specification phase must create ONLY OpenSpec proposal/design/delta specs/tasks, an issue branch/worktree, a Draft PR, immutable full-SHA artifact links, and request exactly `/approve-spec <full-sha>`; implementation is forbidden.
`/revise-spec` uses the exact trusted persisted request above, edits only the active OpenSpec planning artifacts, invalidates prior approval and acceptance, validates, commits and pushes a new SHA, updates immutable approval evidence, and returns to `/approve-spec <new-full-sha>`; product implementation is forbidden. `/fix` uses the exact trusted persisted request above, preserves the approved spec SHA, changes only implementation defects plus tests/review, and returns to awaiting acceptance. Implementation requires the matching trusted full-SHA approval. Review requires independent code/test review and UI review when applicable. Acceptance does not authorize merge: `/accept` records acceptance and must not sync or archive. `/merge` first permits only sync/archive and pushing the archive SHA. Merge, close, and cleanup require controller-persisted archive SHA and successful current checks under an automatic continuation of that same exact `/merge` wakeup; never request or accept a second command.
Heartbeats are liveness only and never progress. Expected evidence is structured controller state plus repository artifacts and GitHub verification. If any prerequisite is absent or ambiguous, stop immediately and publish one concrete blocker; do not heartbeat-wait or claim completion. Reuse this task, idempotency identity, tmux window, and Codex session for every continuation; never create a duplicate worker/session."""
        result = subprocess.run(
            [self.python, self.script, f"SnapFlow issue #{work['issue_number']}",
             "--body", description, "--max-runtime", self.max_runtime,
             "--workspace", self.workspace,
             "--idempotency-key", execution_id],
            check=True, capture_output=True, text=True, timeout=70,
        )
        try:
            document = json.loads(result.stdout)
        except json.JSONDecodeError as error:
            raise RuntimeError("task.py returned invalid JSON output") from error
        if not isinstance(document, dict) or document.get("durable") is not True:
            raise RuntimeError("task.py did not confirm durable task creation")
        task_id = document.get("task_id")
        if not isinstance(task_id, str) or not task_id.strip():
            raise RuntimeError("task.py did not return an unambiguous durable task id")
        return task_id.strip()


class ProjectFinalizer:
    """Fixed local adapter call; closure alone is never sufficient."""

    def __init__(self, adapter="/opt/data/bin/neo-dev-project-control"):
        self.adapter = adapter

    def verify(self, repository: str, issue_number: int, idempotency_key: str) -> bool | None:
        evidence = collect_host_evidence(
            self.adapter, repository, issue_number, idempotency_key,
        )
        result = subprocess.run(
            [self.adapter, "finalize", "--repository", repository, "--issue-number",
             str(issue_number), "--idempotency-key", idempotency_key,
             "--evidence", evidence],
            check=False, capture_output=True, text=True, timeout=90, shell=False,
        )
        if result.returncode != 0:
            return False
        try:
            document = json.loads(result.stdout)
        except json.JSONDecodeError:
            return False
        if not isinstance(document, dict):
            return False
        if document.get("status") == "pending":
            return None
        return document.get("status") == "finalized"


class ProjectDispatcher:
    """Consumer-only project dispatch; Kanban cards never receive this capability."""

    def __init__(self, adapter="/opt/data/bin/neo-dev-project-control"):
        self.adapter = adapter

    def dispatch(self, operation: str, repository: str, issue_number: int,
                 idempotency_key: str, current_wakeup: dict | None = None) -> dict:
        if operation not in {"start", "resume"}:
            raise ValueError("unsupported project dispatch operation")
        if operation == "start":
            status = subprocess.run(
                [self.adapter, "status", "--repository", repository, "--issue-number",
                 str(issue_number), "--idempotency-key", idempotency_key],
                check=False, capture_output=True, text=True, timeout=90, shell=False,
            )
            if status.returncode == 0:
                try:
                    existing = json.loads(status.stdout)
                except json.JSONDecodeError as error:
                    raise RuntimeError("controller status returned invalid JSON") from error
                if not isinstance(existing, dict):
                    raise RuntimeError("controller status must be a JSON object")
                identity = existing.get("governed_identity", {})
                execution = existing.get("execution", {})
                if (existing.get("idempotency_key") != idempotency_key
                        or identity.get("repository") != repository
                        or identity.get("issue_number") != issue_number):
                    raise RuntimeError("controller status does not match recoverable start")
                phase = execution.get("phase")
                if phase in {"starting", "active"}:
                    return {"controller": existing, "github": None}
                if phase != "never_started":
                    raise RuntimeError("controller status does not match recoverable start")
        evidence_args = []
        evidence_document = None
        if operation == "resume":
            encoded = collect_host_evidence(
                self.adapter, repository, issue_number, idempotency_key, current_wakeup,
            )
            evidence_args = ["--evidence", encoded]
            evidence_document = json.loads(base64.b64decode(encoded))
        result = subprocess.run(
            [self.adapter, operation, "--repository", repository, "--issue-number",
             str(issue_number), "--idempotency-key", idempotency_key, *evidence_args],
            check=True, capture_output=True, text=True, timeout=90, shell=False,
        )
        controller = json.loads(result.stdout)
        return {"controller": controller, "github": evidence_document}

    def attest(self, repository: str, issue_number: int, idempotency_key: str,
               current_wakeup: dict | None = None) -> dict:
        evidence = collect_host_evidence(
            self.adapter, repository, issue_number, idempotency_key, current_wakeup,
        )
        result = subprocess.run(
            [self.adapter, "attest", "--repository", repository, "--issue-number",
             str(issue_number), "--idempotency-key", idempotency_key,
             "--evidence", evidence],
            check=True, capture_output=True, text=True, timeout=90, shell=False,
        )
        controller = json.loads(result.stdout)
        if not isinstance(controller, dict):
            raise RuntimeError("controller attestation must return a JSON object")
        return {"controller": controller}


def collect_host_evidence(adapter: str, repository: str, issue_number: int,
                          idempotency_key: str, current_wakeup: dict | None = None) -> str:
    status = subprocess.run(
        [adapter, "status", "--repository", repository, "--issue-number",
         str(issue_number), "--idempotency-key", idempotency_key],
        check=True, capture_output=True, text=True, timeout=90, shell=False,
    )
    document = json.loads(status.stdout)
    execution = document.get("execution", {})
    lifecycle_state = execution.get("lifecycle_state")
    resolution_id = document.get("resolution_id")
    branch = ("chore/issue-77-openspec-workflow" if issue_number == 77
              else f"feature/issue-{issue_number}")
    from .project_control import SubprocessExecutor
    from .verification import HostGitHubEvidenceCollector
    evidence = HostGitHubEvidenceCollector(SubprocessExecutor()).collect_bound(
        repository, issue_number, branch, resolution_id, lifecycle_state, idempotency_key,
        current_wakeup,
    )
    encoded = base64.b64encode(json.dumps(
        evidence, sort_keys=True, separators=(",", ":"),
    ).encode()).decode()
    return encoded


class Consumer:
    def __init__(self, store: Store, runner: TaskRunner, github: PublicGitHubAdapter,
                 lease_seconds: int = 300, max_attempts: int = 5, finalizer=None,
                 dispatcher=None, capability_broker=None):
        self.store, self.runner, self.github = store, runner, github
        self.lease_seconds, self.max_attempts = lease_seconds, max_attempts
        self.finalizer = finalizer
        self.dispatcher = dispatcher
        self.capability_broker = capability_broker

    def run_one(self, now=None) -> bool:
        if self.capability_broker is not None and self.dispatcher is not None:
            decision = self.capability_broker.claim_decision()
            if decision is not None:
                path, record = decision
                if record.get("decision") != "proceed":
                    self.capability_broker.finish_decision(path, record)
                    return False
                try:
                    attestation = self.dispatcher.attest(
                        REPOSITORY, record["issue_number"], record["workflow_id"],
                        record.get("current_wakeup"),
                    )
                    execution = attestation.get("controller", {}).get("execution", {})
                    if execution.get("lifecycle_state") == "archive_ci_verified":
                        wakeup = record.get("current_wakeup")
                        context = self.dispatcher.dispatch(
                            "resume", REPOSITORY, record["issue_number"],
                            record["workflow_id"], wakeup,
                        )
                        self.runner.create({
                            "issue_number": record["issue_number"],
                            "task_id": record["execution_id"],
                            "wakeups": [wakeup],
                            "controller_context": context,
                        }, record["workflow_id"])
                except Exception:
                    # The trusted PR/artifact evidence can legitimately lag the
                    # worker decision. Keep the one-use decision pending and
                    # retry without crashing the durable consumer container.
                    return False
                self.capability_broker.finish_decision(path, record)
                return True
        finalization = self.store.claim_finalization(self.max_attempts)
        if finalization is not None:
            verified = False
            error = "project finalizer is unavailable"
            try:
                if self.finalizer is not None:
                    verified = self.finalizer.verify(
                        finalization["repository"], finalization["issue_number"],
                        finalization["idempotency_key"],
                    )
                    error = "controller merge-finalization verification rejected closure"
            except Exception as finalization_error:
                error = str(finalization_error)
            self.store.finish_finalization(
                finalization["id"], verified, error, self.max_attempts,
            )
            return verified is True
        work = self.store.claim(now, self.lease_seconds, self.max_attempts)
        if work is None:
            return False
        try:
            live = self.github.revalidate(work["repository"], work["issue_number"])
            if not live.get("open") or live.get("is_pr") or "neo-dev" not in live.get("labels", []):
                raise RuntimeError("GitHub issue is no longer eligible")
            if self.dispatcher is not None:
                work["controller_context"] = self.dispatcher.dispatch(
                    "start" if work.get("task_id") is None else "resume",
                    work["repository"], work["issue_number"], work["idempotency_key"],
                    work["wakeups"][-1] if work["wakeups"] else None,
                )
            task_id = self.runner.create(work, work["idempotency_key"])
            self.store.complete(work["id"], work["claim_token"], task_id, now)
            return True
        except Exception as error:
            self.store.fail(work["id"], work["claim_token"], str(error), self.max_attempts, now)
            return False

#!/usr/bin/env python3
"""Create one durable task on the fixed Neo Dev Kanban inbox."""

import argparse
import fcntl
import json
import os
import pathlib
import subprocess
import sys
import uuid

BOARD = "private-dev"
ASSIGNEE = "dev"
WORKSPACE = "dir:/opt/data/profiles/dev"
SKILL = "snapflow-orchestrator"
HERMES = "/opt/hermes/.venv/bin/hermes"
LOCK_PATH = pathlib.Path("/opt/data/.neo-dev-task-create.lock")
CREATE_TIMEOUT = 60
DISPATCH_TIMEOUT = 10


def parse_args(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("title")
    parser.add_argument("--body", required=True)
    parser.add_argument("--max-runtime", required=True, choices=["2h"])
    parser.add_argument("--workspace", required=True, choices=[WORKSPACE])
    parser.add_argument("--board", required=True, choices=[BOARD])
    parser.add_argument("--assignee", required=True, choices=[ASSIGNEE])
    parser.add_argument("--idempotency-key", required=True)
    args = parser.parse_args(argv)
    try:
        canonical = str(uuid.UUID(args.idempotency_key))
    except (ValueError, AttributeError) as error:
        parser.error(f"--idempotency-key must be a canonical UUID: {error}")
    if canonical != args.idempotency_key:
        parser.error("--idempotency-key must be a canonical UUID")
    return args


def load_kanban_db():
    # Lazy so contract inspection (`task.py --help`) needs no Hermes import.
    if "/opt/hermes" not in sys.path:
        sys.path.insert(0, "/opt/hermes")
    from hermes_cli import kanban_db
    return kanban_db


def reconcile(kb, args):
    with kb.connect_closing(board=args.board) as connection:
        rows = connection.execute(
            "SELECT id, title, body, assignee, workspace_kind, workspace_path "
            "FROM tasks WHERE idempotency_key = ? "
            "ORDER BY created_at DESC",
            (args.idempotency_key,),
        ).fetchall()
    if len(rows) > 1:
        raise RuntimeError("ambiguous durable Kanban reconciliation")
    if not rows:
        return None
    row = rows[0]
    expected = {
        "title": args.title,
        "body": args.body,
        "assignee": args.assignee,
        "workspace_kind": "dir",
        "workspace_path": "/opt/data/profiles/dev",
    }
    if any(row[key] != value for key, value in expected.items()):
        raise RuntimeError("idempotency key belongs to a different Kanban task")
    task_id = row["id"]
    if not isinstance(task_id, str) or not task_id.strip():
        raise RuntimeError("reconciled Kanban task has no stable ID")
    return task_id.strip()


def create_command(args):
    return [
        HERMES, "kanban", "--board", args.board, "create", args.title,
        "--body", args.body, "--max-runtime", args.max_runtime,
        "--workspace", args.workspace, "--assignee", args.assignee,
        "--idempotency-key", args.idempotency_key, "--skill", SKILL, "--json",
    ]


def hermes_environment(kb, args):
    database = pathlib.Path(kb.kanban_db_path(board=args.board))
    return {**os.environ, "HERMES_KANBAN_DB": str(database)}


def parse_created(stdout):
    try:
        document = json.loads(stdout)
    except json.JSONDecodeError:
        return None
    task_id = document.get("id") if isinstance(document, dict) else None
    return task_id.strip() if isinstance(task_id, str) and task_id.strip() else None


def create_or_reconcile(args, kb):
    existing = reconcile(kb, args)
    if existing is not None:
        return existing
    result = None
    failure = None
    try:
        result = subprocess.run(
            create_command(args), capture_output=True, text=True,
            timeout=CREATE_TIMEOUT, env=hermes_environment(kb, args),
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        failure = error
    durable = reconcile(kb, args)
    if durable is not None:
        return durable
    if failure is not None:
        raise RuntimeError("Hermes task creation failed before reconciliation") from failure
    if result.returncode != 0:
        raise RuntimeError(f"Hermes task creation exited {result.returncode}")
    if parse_created(result.stdout) is None:
        raise RuntimeError("Hermes task creation returned malformed or ambiguous output")
    raise RuntimeError("Hermes task creation was not durable")


def dispatch(args, kb):
    try:
        subprocess.run(
            [HERMES, "kanban", "--board", args.board, "dispatch", "--max", "1", "--json"],
            check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=DISPATCH_TIMEOUT, env=hermes_environment(kb, args),
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def main(argv=None):
    args = parse_args(argv)
    kb = load_kanban_db()
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with LOCK_PATH.open("a", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file, fcntl.LOCK_EX)
        task_id = create_or_reconcile(args, kb)
    dispatch(args, kb)
    sys.stdout.write(json.dumps({"task_id": task_id, "durable": True},
                                separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()

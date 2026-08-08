from __future__ import annotations

import argparse
import json
import os
import pathlib
import pwd
import socket
from datetime import datetime, timezone
from typing import Sequence

from .project_control import (
    CONTROLLER_REGISTRY_PATH, CONTROLLER_STATE_PATH, Controller,
    FileResolutionStore, ProjectWorkerExecutor, Registry, validate_idempotency_key,
)
from .verification import RepositoryGitHubVerifier

SOCKET_ROOT = pathlib.Path("/run/neo-dev-runtime")


def socket_path(key: str) -> pathlib.Path:
    validate_idempotency_key(key)
    return SOCKET_ROOT / f"{key}.sock"


def supervise(operation: str, key: str, session_id: str | None, review_run_id: str | None = None, *,
              registry_path: pathlib.Path = CONTROLLER_REGISTRY_PATH,
              state_path: pathlib.Path = CONTROLLER_STATE_PATH) -> int:
    if os.geteuid() != 0:
        raise PermissionError("runtime supervisor must run as root")
    if operation not in {"start", "resume", "review"}:
        raise ValueError("unsupported supervised runtime operation")
    validate_idempotency_key(key)
    if session_id is not None:
        validate_idempotency_key(session_id)
    store = FileResolutionStore(state_path)
    controller = Controller(Registry.load(registry_path), store, ProjectWorkerExecutor())
    state = store.load(key)
    if state is None or (operation != "review" and state.phase not in {"starting", "resuming"}):
        raise RuntimeError("supervisor launch conflicts with trusted state")
    if operation == "review":
        if (state.lifecycle_state != "independent_review" or state.review_state is None
                or state.review_state.get("review_phase") != "reviewer_starting"
                or state.review_state.get("reviewer_run_id") != review_run_id
                or session_id is not None):
            raise RuntimeError("review supervisor provenance conflicts with trusted state")
    correction_resume = (
        operation == "resume" and state.lifecycle_state == "independent_review"
        and state.review_state is not None
        and state.review_state.get("review_phase") == "correction_required"
    )
    if operation == "resume" and state.lifecycle_state != "label" and not correction_resume:
        if session_id is None or state.codex_session_id != session_id:
            raise RuntimeError("supervisor resume identity conflicts with trusted state")
        if state.github_evidence is None or state.lifecycle_state not in {
            "specification_ready", "spec_approved", "implementation_verified", "accepted", "cancelled",
            "archive_authorized", "archive_ci_verified", "merge_authorized",
        }:
            raise RuntimeError("resume lacks trusted lifecycle evidence")
        authorization = RepositoryGitHubVerifier(
            ProjectWorkerExecutor(), state.github_evidence,
        ).authorize(state.target, state)
        if not authorization.verified or authorization.evidence is None:
            raise RuntimeError(authorization.blocker or "trusted lifecycle command unavailable")
        state = controller.advance_lifecycle(key, **authorization.evidence)
    elif operation == "resume" and (
        session_id is None or state.codex_session_id != session_id
    ):
        raise RuntimeError("supervisor resume identity conflicts with trusted state")

    SOCKET_ROOT.mkdir(mode=0o711, parents=True, exist_ok=True)
    os.chmod(SOCKET_ROOT, 0o711)
    path = socket_path(key)
    path.unlink(missing_ok=True)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    terminal_received = False
    try:
        server.bind(str(path))
        dev = pwd.getpwnam("dev")
        os.chown(path, dev.pw_uid, dev.pw_gid)
        os.chmod(path, 0o600)
        server.listen(1)
        server.settimeout(30)
        connection, _ = server.accept()
        path.unlink(missing_ok=True)
        with connection:
            launch = {
                "version": 1, "operation": operation, "idempotency_key": key,
                "session_id": session_id, "target": state.target.as_dict(),
                "lifecycle_state": state.lifecycle_state,
                "review_run_id": review_run_id,
            }
            if operation == "review":
                launch.update(implementation_sha=state.implementation_sha,
                              approved_spec_sha=state.spec_sha)
            elif correction_resume:
                launch.update(approved_spec_sha=state.spec_sha, review_state=state.review_state)
            stream = connection.makefile("rwb", buffering=0)
            stream.write((json.dumps(launch, sort_keys=True, separators=(",", ":")) + "\n").encode())
            for raw in stream:
                message = json.loads(raw)
                if not isinstance(message, dict) or set(message) not in (
                    {"event", "session_id"},
                    {"event", "exit_code", "semantic_outcome", "resumable"},
                    {"event", "session_id", "reviewer_run_id"},
                    {"event", "reviewer_run_id", "verdict"},
                ):
                    raise RuntimeError("invalid worker supervisor message")
                if message["event"] == "session":
                    controller.observe_session(key, message["session_id"])
                elif message["event"] == "reviewer_session":
                    controller.observe_reviewer_session(
                        key, message["session_id"], message["reviewer_run_id"],
                    )
                elif message["event"] == "reviewer_verdict":
                    controller.record_independent_verdict(
                        key, state.implementation_sha or "", message["verdict"],
                        datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    )
                    terminal_received = True
                    return 0
                elif message["event"] == "terminal":
                    # Worker completion is never semantic authority; controller-side
                    # repository/GitHub verification still owns lifecycle success.
                    outcome = message["semantic_outcome"]
                    if outcome == "success":
                        outcome = "correctable"
                    controller.observe_terminal(
                        key, message["exit_code"], outcome, message["resumable"],
                    )
                    terminal_received = True
                    return 0
                else:
                    raise RuntimeError("unsupported worker supervisor event")
    finally:
        path.unlink(missing_ok=True)
        server.close()
        if not terminal_received:
            current = store.load(key)
            if operation == "review" and current is not None and review_run_id is not None:
                controller.record_reviewer_failure(key, review_run_id,
                                                   "reviewer runtime exited without verdict")
                return 1
            if current is not None and current.phase in {"starting", "resuming", "active"}:
                if current.codex_session_id is None:
                    controller.observe_terminal(key, 1, "crashed", True)
                else:
                    controller.observe_terminal(key, 1, "correctable", True)
    return 1


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(allow_abbrev=False)
    result.add_argument("operation", choices=("start", "resume", "review"))
    result.add_argument("--idempotency-key", required=True)
    result.add_argument("--session-id")
    result.add_argument("--review-run-id")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        return supervise(args.operation, args.idempotency_key, args.session_id, args.review_run_id)
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError):
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

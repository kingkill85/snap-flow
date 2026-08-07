from __future__ import annotations

import argparse
import json
import pathlib
import select
import subprocess
import sys
from typing import Sequence, TextIO

from .project_control import (
    CODEX_APP_SERVER_ARGV,
    CODEX_WORKER_ARGV,
    CONTINUE_PROMPT,
    CONTROLLER_REGISTRY_PATH,
    CONTROLLER_STATE_PATH,
    Controller,
    FileResolutionStore,
    Registry,
    SubprocessExecutor,
    validate_idempotency_key,
)
from .verification import PhaseVerifier, RepositoryGitHubVerifier

RUNTIME_VERSION = 1
def initial_prompt(repository: str, issue_number: int) -> str:
    return f"""You are the sole Codex worker for {repository} Issue #{issue_number} in the initial specification phase. Read the live GitHub Issue, repository AGENTS.md, openspec/config.yaml, and all applicable OpenSpec instructions before acting. Create ONLY the issue-scoped OpenSpec proposal, design, delta specifications, and tasks; create/update the Draft PR; commit and push those planning artifacts; and publish immutable GitHub blob links pinned to the resulting full 40-character commit SHA with the exact next command `/approve-spec <full-sha>`. Do not implement product or orchestration behavior, run deployment, merge, or bypass approval. Verify repository and GitHub artifacts directly. Heartbeats are liveness only and cannot count as progress or completion. If any prerequisite or verification is missing, fail fast with one concrete blocker. Approval/acceptance waits use `correctable` with `resumable: true`; `success` is reserved for verified merge-finalization. End with the required structured completion document."""
COMPLETION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["semantic_outcome", "resumable", "summary"],
    "properties": {
        "semantic_outcome": {
            "enum": ["success", "correctable", "blocked", "crashed", "invalid"],
        },
        "resumable": {"type": "boolean"},
        "summary": {"type": "string", "minLength": 1, "maxLength": 4096},
    },
}


def validate_completion(value: object, exit_code: int) -> dict:
    required = {"semantic_outcome", "resumable", "summary"}
    if not isinstance(value, dict) or set(value) != required:
        raise ValueError("completion does not match the trusted schema")
    outcome = value["semantic_outcome"]
    if outcome not in {"success", "correctable", "blocked", "crashed", "invalid"}:
        raise ValueError("completion has an invalid semantic outcome")
    if type(value["resumable"]) is not bool:
        raise ValueError("completion resumability must be boolean")
    summary = value["summary"]
    if not isinstance(summary, str) or not summary or len(summary) > 4096:
        raise ValueError("completion summary is invalid")
    if outcome == "success" and exit_code != 0:
        raise ValueError("semantic success requires process exit code zero")
    return value


class AppServer:
    def __init__(self, process: subprocess.Popen[str]):
        self.process = process
        self.next_id = 1

    @classmethod
    def start(cls) -> "AppServer":
        process = subprocess.Popen(
            list(CODEX_WORKER_ARGV),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, bufsize=1, shell=False,
        )
        return cls(process)

    def send(self, method: str, params: dict, request_id: int | None = None) -> int | None:
        if self.process.stdin is None:
            raise RuntimeError("Codex app-server stdin is unavailable")
        message = {"method": method, "params": params}
        if request_id is not None:
            message["id"] = request_id
        self.process.stdin.write(json.dumps(message, separators=(",", ":")) + "\n")
        self.process.stdin.flush()
        return request_id

    def request(self, method: str, params: dict) -> dict:
        request_id = self.next_id
        self.next_id += 1
        self.send(method, params, request_id)
        while True:
            message = self.read()
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(f"Codex app-server rejected {method}")
                result = message.get("result")
                if not isinstance(result, dict):
                    raise RuntimeError(f"Codex app-server returned invalid {method} result")
                return result

    def read(self) -> dict:
        if self.process.stdout is None:
            raise RuntimeError("Codex app-server stdout is unavailable")
        line = self.process.stdout.readline()
        if not line:
            raise RuntimeError("Codex app-server exited unexpectedly")
        message = json.loads(line)
        if not isinstance(message, dict):
            raise RuntimeError("Codex app-server emitted an invalid message")
        return message

    def poll(self, control_input: TextIO) -> tuple[str, object]:
        readable, _, _ = select.select([self.process.stdout, control_input], [], [])
        if control_input in readable:
            return "control", control_input.readline()
        return "event", self.read()

    def close(self) -> None:
        if self.process.stdin is not None and not self.process.stdin.closed:
            try:
                self.process.stdin.close()
            except OSError:
                pass
        try:
            self.process.wait(timeout=2.0)
            return
        except subprocess.TimeoutExpired:
            self.process.terminate()
        try:
            self.process.wait(timeout=2.0)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()


def _thread_id(result: dict) -> str:
    thread = result.get("thread")
    if not isinstance(thread, dict) or not isinstance(thread.get("id"), str):
        raise RuntimeError("Codex app-server omitted the session identity")
    validate_idempotency_key(thread["id"])
    return thread["id"]


def _run_runtime(operation: str, idempotency_key: str, session_id: str | None, *,
                 registry_path: pathlib.Path, state_path: pathlib.Path,
                 app_server: AppServer | None, control_input: TextIO,
                 verifier: PhaseVerifier | None) -> int:
    validate_idempotency_key(idempotency_key)
    if operation not in {"start", "resume"}:
        raise ValueError("unsupported internal runtime operation")
    if operation == "start" and session_id is not None:
        raise ValueError("initial runtime cannot accept a session identity")
    if operation == "resume":
        if session_id is None:
            raise ValueError("resume runtime requires the persisted session identity")
        validate_idempotency_key(session_id)

    store = FileResolutionStore(state_path)
    controller = Controller(Registry.load(registry_path), store, SubprocessExecutor())
    server = app_server or AppServer.start()
    server.request("initialize", {
        "clientInfo": {"name": "neo-dev-project-control", "version": str(RUNTIME_VERSION)},
        "capabilities": {"experimentalApi": True},
    })
    server.send("initialized", {})
    if operation == "start":
        thread = server.request("thread/start", {
            "cwd": store.load(idempotency_key).target.worktree,
            "approvalPolicy": "never",
            "ephemeral": False,
        })
    else:
        thread = server.request("thread/resume", {"threadId": session_id})
    observed_session = _thread_id(thread)
    if session_id is not None and observed_session != session_id:
        raise RuntimeError("resumed Codex session identity drifted")
    controller.observe_session(idempotency_key, observed_session)

    target = store.load(idempotency_key).target
    lifecycle = store.load(idempotency_key)
    trusted_verifier = verifier or RepositoryGitHubVerifier(SubprocessExecutor())
    if operation == "resume" and lifecycle.lifecycle_state in {
        "specification_ready", "implementation_verified", "archive_ci_verified",
    }:
        authorization = trusted_verifier.authorize(target, lifecycle)
        if not authorization.verified or authorization.evidence is None:
            raise RuntimeError(authorization.blocker or "trusted lifecycle command is unavailable")
        lifecycle = controller.advance_lifecycle(idempotency_key, **authorization.evidence)
    prompt = initial_prompt(target.repository, target.issue_number) if operation == "start" else (
        f"Continue the same governed {target.repository} Issue #{target.issue_number} workflow and "
        f"same Codex session from controller-owned lifecycle state `{lifecycle.lifecycle_state}`. "
        "Read the live Issue command and artifacts, enforce only that current gate, "
        "and fail fast with one concrete blocker if prerequisites are missing. /approve-spec permits "
        "implementation only for the matching full SHA; /accept permits sync/strict validation/archive "
        "but not merge; /merge is a separate authorization for merge, closure, and cleanup. Heartbeats "
        "are liveness only and never progress."
    )
    turn = server.request("turn/start", {
        "threadId": observed_session,
        "input": [{"type": "text", "text": prompt}],
        "outputSchema": COMPLETION_SCHEMA,
    })
    turn_data = turn.get("turn")
    if not isinstance(turn_data, dict) or not isinstance(turn_data.get("id"), str):
        raise RuntimeError("Codex app-server omitted the active turn identity")
    turn_id = turn_data["id"]
    message_parts: list[str] = []

    while True:
        source, payload = server.poll(control_input)
        if source == "control":
            prompt = payload
            if prompt == "":
                control_input = open("/dev/null", encoding="utf-8")
            elif isinstance(prompt, str) and prompt.rstrip("\n") == CONTINUE_PROMPT:
                server.request("turn/steer", {
                    "threadId": observed_session,
                    "expectedTurnId": turn_id,
                    "input": [{"type": "text", "text": CONTINUE_PROMPT}],
                })
        else:
            event = payload
            if not isinstance(event, dict):
                raise RuntimeError("Codex app-server emitted an invalid event")
            method = event.get("method")
            params = event.get("params")
            if method == "item/agentMessage/delta" and isinstance(params, dict):
                delta = params.get("delta")
                if isinstance(delta, str):
                    message_parts.append(delta)
            elif method == "turn/completed" and isinstance(params, dict):
                turn_result = params.get("turn")
                status = turn_result.get("status") if isinstance(turn_result, dict) else None
                exit_code = 0 if status == "completed" else 1
                try:
                    completion = validate_completion(json.loads("".join(message_parts)), exit_code)
                except (json.JSONDecodeError, ValueError):
                    completion = {"semantic_outcome": "invalid", "resumable": True,
                                  "summary": "Invalid structured completion"}
                lifecycle = store.load(idempotency_key)
                verification = trusted_verifier.verify_next(target, lifecycle)
                if not verification.verified:
                    completion = {"semantic_outcome": "blocked", "resumable": True,
                                  "summary": verification.blocker or "controller verification failed"}
                    exit_code = 1
                else:
                    controller.advance_lifecycle(idempotency_key, **verification.evidence)
                    if verification.evidence["lifecycle_state"] == "merged_closed":
                        completion["semantic_outcome"] = "success"
                    elif completion["semantic_outcome"] == "success":
                        completion["semantic_outcome"] = "correctable"
                controller.observe_terminal(
                    idempotency_key, exit_code, completion["semantic_outcome"],
                    completion["resumable"],
                )
                return 0 if completion["semantic_outcome"] == "success" else 1


def run_runtime(operation: str, idempotency_key: str, session_id: str | None, *,
                registry_path: pathlib.Path = CONTROLLER_REGISTRY_PATH,
                state_path: pathlib.Path = CONTROLLER_STATE_PATH,
                app_server: AppServer | None = None, control_input: TextIO = sys.stdin,
                verifier: PhaseVerifier | None = None) -> int:
    server = app_server or AppServer.start()
    try:
        return _run_runtime(
            operation, idempotency_key, session_id, registry_path=registry_path,
            state_path=state_path, app_server=server, control_input=control_input,
            verifier=verifier,
        )
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError,
            json.JSONDecodeError):
        store = FileResolutionStore(state_path)
        state = store.load(idempotency_key)
        if state is not None and state.phase in {
            "starting", "active", "correctable", "resuming",
        }:
            Controller(
                Registry.load(registry_path), store, SubprocessExecutor(),
            ).observe_terminal(
                idempotency_key, 1, "crashed", state.codex_session_id is not None,
            )
        raise
    finally:
        server.close()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="neo-dev-codex-runtime", allow_abbrev=False)
    result.add_argument("operation", choices=("start", "resume"))
    result.add_argument("--idempotency-key", required=True)
    result.add_argument("--session-id")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    try:
        return run_runtime(
            arguments.operation, arguments.idempotency_key, arguments.session_id,
        )
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError):
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

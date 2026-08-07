from __future__ import annotations

import argparse
import json
import pathlib
import select
import socket
import subprocess
import sys
import tempfile
import time
from typing import Callable, Sequence, TextIO

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
    GovernedTarget,
    validate_idempotency_key,
)
from .runtime_supervisor import socket_path
from .verification import PhaseVerifier, RepositoryGitHubVerifier

RUNTIME_VERSION = 1
def initial_prompt(repository: str, issue_number: int) -> str:
    return f"""You are the sole Codex worker for {repository} Issue #{issue_number} in the initial specification phase. Read the live GitHub Issue, repository AGENTS.md, openspec/config.yaml, and all applicable OpenSpec instructions before acting. Create ONLY the issue-scoped OpenSpec proposal, design, delta specifications, and tasks; create/update the Draft PR; commit and push those planning artifacts; and publish immutable GitHub blob links pinned to the resulting full 40-character commit SHA with the exact next command `/approve-spec <full-sha>`. Do not implement product or orchestration behavior, run deployment, merge, or bypass approval. Verify repository and GitHub artifacts directly. If a mandatory repository gate fails without any related product-code change, reproduce it in a fresh detached worktree at `origin/main`; when the same failure exists there, document the exact clean-main baseline exception in the Draft PR and continue the planning-only workflow without changing unrelated code. Heartbeats are liveness only and cannot count as progress or completion. Fail fast only when a prerequisite remains unverified or a concrete external blocker remains after the required autonomous checks. Approval/acceptance waits use `correctable` with `resumable: true`; `success` is reserved for verified merge-finalization. End with the required structured completion document."""


def continuation_prompt(repository: str, issue_number: int, lifecycle_state: str) -> str:
    if lifecycle_state == "label":
        return initial_prompt(repository, issue_number)
    phase_work = {
        "spec_approved": (
            "Implement only the approved Issue-scoped OpenSpec plan, run and verify the required "
            "tests, commit and push the implementation, and update the existing Draft PR. Do not "
            "accept, archive, merge, close, deploy, or clean up the worktree."
        ),
        "accepted": (
            "Acceptance is recorded. Make no repository changes and wait for the separate trusted "
            "`/merge` authorization; specifically do not sync or archive the OpenSpec change."
        ),
        "archive_authorized": (
            "The bound `/merge` authorizes only OpenSpec sync/archive and pushing that exact archive "
            "SHA. Do not merge, close the Issue, or clean up; stop and wait for controller archive "
            "and CI attestation."
        ),
        "merge_authorized": (
            "Perform only final exact-archive-SHA verification, merge the governed PR, close the "
            "Issue, and perform governed cleanup. Do not modify or re-archive repository content."
        ),
    }.get(lifecycle_state)
    if phase_work is None:
        raise RuntimeError("supervisor lifecycle state is invalid")
    return (
        f"Continue the same governed {repository} Issue #{issue_number} workflow and same Codex "
        f"session from controller-owned lifecycle state `{lifecycle_state}`. {phase_work} Read and "
        "verify the live Issue, repository instructions, persisted artifacts, and GitHub state before "
        "acting. Work autonomously through this phase and fail fast only on one concrete external "
        "blocker. Heartbeats are liveness only and never progress. End with the required structured "
        "completion document."
    )


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


def build_exec_argv(operation: str, target: GovernedTarget, session_id: str | None,
                    schema_path: pathlib.Path, prompt: str) -> tuple[str, ...]:
    if operation == "start":
        if session_id is not None:
            raise ValueError("initial runtime cannot accept a session identity")
        return (
            "/usr/local/bin/codex", "exec", "--json",
            "--dangerously-bypass-approvals-and-sandbox",
            "-C", target.worktree,
            "--output-schema", str(schema_path), prompt,
        )
    if operation == "resume":
        if session_id is None:
            raise ValueError("resume runtime requires the persisted session identity")
        validate_idempotency_key(session_id)
        return (
            "/usr/local/bin/codex", "exec", "resume", "--json",
            "--dangerously-bypass-approvals-and-sandbox",
            "--output-schema", str(schema_path), session_id, prompt,
        )
    raise ValueError("unsupported internal runtime operation")


def parse_exec_event(line: str) -> tuple[str, object] | None:
    event = json.loads(line)
    if not isinstance(event, dict):
        raise ValueError("Codex exec emitted an invalid event")
    if event.get("type") == "thread.started":
        session_id = event.get("thread_id")
        if not isinstance(session_id, str):
            raise ValueError("Codex exec omitted the session identity")
        validate_idempotency_key(session_id)
        return "session", session_id
    if event.get("type") == "item.completed":
        item = event.get("item")
        if isinstance(item, dict) and item.get("type") == "agent_message":
            text = item.get("text")
            if isinstance(text, str):
                try:
                    return "completion", validate_completion(json.loads(text), 0)
                except (json.JSONDecodeError, ValueError):
                    return None
    if event.get("type") == "turn.completed":
        return "terminal", 0
    if event.get("type") == "turn.failed":
        return "terminal", 1
    return None


def run_exec_worker(operation: str, target: GovernedTarget, session_id: str | None,
                    schema_path: pathlib.Path, prompt: str,
                    session_observer: Callable[[str], None], *,
                    process_factory: Callable[..., subprocess.Popen[str]] = subprocess.Popen,
                    timeout_seconds: int = 1800) -> tuple[str, dict, int]:
    argv = build_exec_argv(operation, target, session_id, schema_path, prompt)
    process = process_factory(
        [
            "/usr/bin/timeout", "--signal=TERM", "--kill-after=10",
            str(timeout_seconds), *argv,
        ],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1, shell=False, cwd=target.worktree,
    )
    if process.stdout is None:
        raise RuntimeError("Codex exec stdout is unavailable")
    observed_session: str | None = None
    completion: dict | None = None
    terminal_exit: int | None = None
    for line in process.stdout:
        parsed = parse_exec_event(line)
        if parsed is None:
            continue
        event, value = parsed
        if event == "session":
            observed_session = value
            session_observer(observed_session)
        elif event == "completion":
            completion = value
        elif event == "terminal":
            terminal_exit = value
    process_exit = process.wait()
    exit_code = process_exit if process_exit != 0 else (terminal_exit or 0)
    if observed_session is None:
        raise RuntimeError("Codex exec omitted the session identity")
    if session_id is not None and observed_session != session_id:
        raise RuntimeError("resumed Codex session identity drifted")
    if completion is None:
        completion = {
            "semantic_outcome": "invalid",
            "resumable": True,
            "summary": "Codex exec omitted structured completion",
        }
    else:
        completion = validate_completion(completion, exit_code)
    return observed_session, completion, exit_code


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
    trusted_verifier = verifier or RepositoryGitHubVerifier(
        SubprocessExecutor(), lifecycle.github_evidence,
    )
    if operation == "resume":
        if lifecycle.github_evidence is None:
            raise RuntimeError("resume requires fresh host-side GitHub evidence")
        if lifecycle.lifecycle_state not in {
            "specification_ready", "spec_approved", "implementation_verified", "accepted",
            "archive_authorized", "archive_ci_verified", "merge_authorized",
        }:
            raise RuntimeError("continuation is not at a command-authorizable lifecycle gate")
        authorization = trusted_verifier.authorize(target, lifecycle)
        if not authorization.verified or authorization.evidence is None:
            raise RuntimeError(authorization.blocker or "trusted lifecycle command is unavailable")
        lifecycle = controller.advance_lifecycle(idempotency_key, **authorization.evidence)
    prompt = initial_prompt(target.repository, target.issue_number) if operation == "start" else (
        f"Continue the same governed {target.repository} Issue #{target.issue_number} workflow and "
        f"same Codex session from controller-owned lifecycle state `{lifecycle.lifecycle_state}`. "
        "Read the live Issue command and artifacts, enforce only that current gate, "
        "and fail fast with one concrete blocker if prerequisites are missing. `/revise-spec` permits "
        "planning-artifact revision only and invalidates approval and acceptance; `/fix` permits only "
        "implementation correction while preserving the approved spec SHA. /approve-spec permits "
        "implementation only for the matching full SHA; /accept records acceptance without archiving; "
        "/merge first permits only sync/archive; controller-persisted archive SHA and successful checks "
        "must precede automatic same-command continuation for merge, closure, and cleanup. Heartbeats "
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
                if completion["semantic_outcome"] == "success":
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


def run_supervised_runtime(operation: str, idempotency_key: str,
                           session_id: str | None, *,
                           app_server: AppServer | None = None,
                           control_input: TextIO = sys.stdin) -> int:
    validate_idempotency_key(idempotency_key)
    channel = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    deadline = time.monotonic() + 10
    while True:
        try:
            channel.connect(str(socket_path(idempotency_key)))
            break
        except (FileNotFoundError, ConnectionRefusedError):
            if time.monotonic() >= deadline:
                channel.close()
                return 1
            time.sleep(0.05)
    stream = channel.makefile("rwb", buffering=0)
    try:
        launch = json.loads(stream.readline())
        if (not isinstance(launch, dict) or launch.get("version") != 1
                or launch.get("operation") != operation
                or launch.get("idempotency_key") != idempotency_key
                or launch.get("session_id") != session_id):
            raise RuntimeError("supervisor launch envelope does not match runtime")
        target = GovernedTarget(**launch["target"])
        target.validate()
        lifecycle_state = launch.get("lifecycle_state")
        if lifecycle_state not in {
            "label", "spec_approved", "accepted", "archive_authorized", "merge_authorized",
        }:
            raise RuntimeError("supervisor lifecycle state is invalid")
        schema_path: pathlib.Path | None = None
        try:
            prompt = initial_prompt(target.repository, target.issue_number) if operation == "start" else (
                continuation_prompt(target.repository, target.issue_number, lifecycle_state)
            )
            with tempfile.NamedTemporaryFile(
                mode="w", encoding="utf-8", prefix="neo-dev-completion-",
                suffix=".json", delete=False,
            ) as schema:
                json.dump(COMPLETION_SCHEMA, schema, separators=(",", ":"))
                schema_path = pathlib.Path(schema.name)

            def observe_session(observed_session: str) -> None:
                report = {"event": "session", "session_id": observed_session}
                stream.write((json.dumps(report) + "\n").encode())

            _, completion, exit_code = run_exec_worker(
                operation, target, session_id, schema_path, prompt, observe_session,
            )
            report = {
                "event": "terminal", "exit_code": exit_code,
                "semantic_outcome": completion["semantic_outcome"],
                "resumable": completion["resumable"],
            }
            stream.write((json.dumps(report) + "\n").encode())
            return 0 if completion["semantic_outcome"] == "success" else 1
        finally:
            if schema_path is not None:
                schema_path.unlink(missing_ok=True)
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError, TypeError):
        return 1
    finally:
        stream.close()
        channel.close()


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="neo-dev-codex-runtime", allow_abbrev=False)
    result.add_argument("operation", choices=("start", "resume"))
    result.add_argument("--idempotency-key", required=True)
    result.add_argument("--session-id")
    return result


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parser().parse_args(argv)
    try:
        return run_supervised_runtime(
            arguments.operation, arguments.idempotency_key, arguments.session_id,
        )
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError):
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

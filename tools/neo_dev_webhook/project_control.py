from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile
import uuid
from dataclasses import asdict, dataclass, replace
from typing import Callable, Iterable, Protocol, Sequence

VERSION = 1
CONTROLLER_REGISTRY_PATH = pathlib.Path("/etc/neo-dev/project-control/registry.json")
CONTROLLER_STATE_PATH = pathlib.Path("/var/lib/neo-dev/project-control/resolutions.json")
REPOSITORY_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?")
CONTINUE_PROMPT = "Continue the governed Issue work and address the latest trusted operator finding."
PHASES = frozenset({
    "never_started", "starting", "active", "correctable", "resuming",
    "exited_resumable", "exited_unresumable", "semantic_success",
    "semantic_blocked", "crashed", "failed_closed",
})
SEMANTIC_OUTCOMES = frozenset({"success", "correctable", "blocked", "crashed", "invalid"})


@dataclass(frozen=True)
class GovernedTarget:
    repository: str
    issue_number: int
    project: str
    session: str
    window: str
    worktree: str
    branch: str
    worker: str

    def as_dict(self) -> dict:
        return asdict(self)

    @property
    def tmux_target(self) -> str:
        return f"{self.session}:{self.window}"

    @property
    def resolution_id(self) -> str:
        encoded = json.dumps(self.as_dict(), sort_keys=True, separators=(",", ":")).encode()
        return hashlib.sha256(encoded).hexdigest()

    def validate(self) -> None:
        validate_repository(self.repository)
        validate_issue_number(self.issue_number)
        values = self.as_dict()
        for name in ("project", "session", "window", "worktree", "branch", "worker"):
            value = values[name]
            if not isinstance(value, str) or not value or value != value.strip():
                raise ValueError(f"invalid governed {name}")
        if self.worker != "Codex" or self.window == "0" or self.tmux_target.endswith(":0"):
            raise ValueError("prohibited worker or tmux topology")
        if "devsnapflow-worker" in json.dumps(values) or self.project.startswith("ssh:"):
            raise ValueError("prohibited governed target")
        if self.repository == "kingkill85/snap-flow" and self.issue_number == 77:
            if self != ISSUE_77_TARGET:
                raise ValueError("Issue 77 target does not match the approved record")


ISSUE_77_TARGET = GovernedTarget(
    repository="kingkill85/snap-flow",
    issue_number=77,
    project="snapflow-dev",
    session="snapflow-dev",
    window="issue-77",
    worktree="/workspace/snap-flow-issue-77",
    branch="chore/issue-77-openspec-workflow",
    worker="Codex",
)


@dataclass(frozen=True)
class TerminalObservation:
    exit_code: int
    semantic_outcome: str
    resumable: bool

    def validate(self) -> None:
        if type(self.exit_code) is not int:
            raise ValueError("terminal exit code must be an integer")
        if self.semantic_outcome not in SEMANTIC_OUTCOMES:
            raise ValueError("invalid trusted semantic outcome")
        if type(self.resumable) is not bool:
            raise ValueError("terminal resumability must be boolean")


@dataclass(frozen=True)
class WorkState:
    target: GovernedTarget
    codex_session_id: str | None = None
    phase: str = "never_started"
    process_generation: int = 0
    restart_count: int = 0
    terminal: TerminalObservation | None = None

    def validate(self) -> None:
        self.target.validate()
        if self.phase not in PHASES:
            raise ValueError("invalid persisted execution phase")
        if self.codex_session_id is not None:
            validate_idempotency_key(self.codex_session_id)
        if type(self.process_generation) is not int or self.process_generation < 0:
            raise ValueError("invalid process generation")
        if self.restart_count not in (0, 1):
            raise ValueError("invalid restart count")
        if self.terminal is not None:
            self.terminal.validate()
        if self.phase in {"active", "correctable", "resuming", "exited_resumable",
                          "semantic_success", "semantic_blocked"} and self.codex_session_id is None:
            raise ValueError("execution phase requires a Codex session identity")
        if self.phase == "semantic_success" and (
            self.terminal is None or self.terminal.semantic_outcome != "success"
        ):
            raise ValueError("semantic success requires trusted structured completion")
        if (self.terminal is not None and self.terminal.semantic_outcome == "success"
                and self.phase != "semantic_success"):
            raise ValueError("trusted success terminal conflicts with execution phase")

    def as_dict(self) -> dict:
        result = asdict(self)
        return result


def validate_repository(repository: str) -> None:
    if not isinstance(repository, str) or REPOSITORY_PATTERN.fullmatch(repository) is None:
        raise ValueError("repository must be canonical owner/name")


def validate_issue_number(issue_number: int) -> None:
    if type(issue_number) is not int or issue_number <= 0:
        raise ValueError("issue number must be a positive integer")


def validate_idempotency_key(key: str) -> None:
    try:
        parsed = uuid.UUID(key)
    except (AttributeError, TypeError, ValueError) as error:
        raise ValueError("idempotency key must be a canonical UUID") from error
    if str(parsed) != key:
        raise ValueError("idempotency key must be a canonical UUID")


class ProcessExecutor(Protocol):
    def run(self, argv: Sequence[str], *, timeout: float) -> str: ...


class SubprocessExecutor:
    def run(self, argv: Sequence[str], *, timeout: float) -> str:
        result = subprocess.run(
            list(argv), check=True, capture_output=True, text=True, timeout=timeout,
            shell=False,
        )
        return result.stdout


class Registry:
    def __init__(self, records: Iterable[GovernedTarget]):
        self.records = tuple(records)

    @classmethod
    def load(cls, path: pathlib.Path) -> "Registry":
        document = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(document, dict) or document.get("version") != VERSION:
            raise ValueError("unsupported controller registry version")
        records = document.get("targets")
        if not isinstance(records, list):
            raise ValueError("invalid controller registry")
        try:
            return cls(GovernedTarget(**record) for record in records)
        except (TypeError, KeyError) as error:
            raise ValueError("invalid controller registry record") from error

    def resolve(self, repository: str, issue_number: int) -> GovernedTarget:
        matches = [record for record in self.records
                   if record.repository == repository and record.issue_number == issue_number]
        if len(matches) != 1:
            raise RuntimeError("governed identity must resolve to exactly one record")
        matches[0].validate()
        return matches[0]


class ResolutionStore(Protocol):
    def bind(self, key: str, target: GovernedTarget) -> WorkState: ...
    def load(self, key: str) -> WorkState | None: ...
    def save(self, key: str, expected: WorkState, updated: WorkState) -> None: ...


class InMemoryResolutionStore:
    def __init__(self):
        self.records: dict[str, WorkState] = {}

    def bind(self, key: str, target: GovernedTarget) -> WorkState:
        current = self.records.get(key)
        if current is not None and current.target != target:
            raise RuntimeError("persisted resolution conflicts with governed target")
        if current is None:
            current = WorkState(target)
            self.records[key] = current
        return current

    def load(self, key: str) -> WorkState | None:
        return self.records.get(key)

    def save(self, key: str, expected: WorkState, updated: WorkState) -> None:
        updated.validate()
        if self.records.get(key) != expected:
            raise RuntimeError("stale persisted execution state")
        self.records[key] = updated


class FileResolutionStore:
    """Controller-owned atomic persistence; callers cannot choose this path."""

    def __init__(self, path: pathlib.Path):
        self.path = path

    def _read(self) -> dict:
        if not self.path.exists():
            return {"version": VERSION, "resolutions": {}}
        document = json.loads(self.path.read_text(encoding="utf-8"))
        if (not isinstance(document, dict) or document.get("version") != VERSION
                or not isinstance(document.get("resolutions"), dict)):
            raise RuntimeError("invalid persisted resolution state")
        return document

    def _write(self, document: dict) -> None:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", dir=self.path.parent, delete=False,
        ) as handle:
            json.dump(document, handle, sort_keys=True, separators=(",", ":"))
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
            temporary = pathlib.Path(handle.name)
        os.chmod(temporary, 0o600)
        os.replace(temporary, self.path)

    def _locked(self, operation: Callable[[dict], WorkState | None]) -> WorkState | None:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
        lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            import fcntl
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            document = self._read()
            before = json.dumps(document, sort_keys=True)
            result = operation(document)
            if json.dumps(document, sort_keys=True) != before:
                self._write(document)
            return result
        finally:
            os.close(descriptor)

    @staticmethod
    def _decode(record: object) -> WorkState:
        if not isinstance(record, dict) or not isinstance(record.get("target"), dict):
            raise RuntimeError("invalid persisted resolution record")
        try:
            terminal_data = record.get("terminal")
            terminal = TerminalObservation(**terminal_data) if terminal_data is not None else None
            state = WorkState(
                target=GovernedTarget(**record["target"]),
                codex_session_id=record.get("codex_session_id"),
                phase=record.get("phase", "never_started"),
                process_generation=record.get("process_generation", 0),
                restart_count=record.get("restart_count", 0),
                terminal=terminal,
            )
        except TypeError as error:
            raise RuntimeError("invalid persisted resolution record") from error
        state.validate()
        return state

    def bind(self, key: str, target: GovernedTarget) -> WorkState:
        def operation(document: dict) -> WorkState:
            record = document["resolutions"].get(key)
            if record is None:
                state = WorkState(target)
                document["resolutions"][key] = state.as_dict()
                return state
            state = self._decode(record)
            if state.target != target:
                raise RuntimeError("persisted resolution conflicts with governed target")
            return state
        result = self._locked(operation)
        assert result is not None
        return result

    def load(self, key: str) -> WorkState | None:
        record = self._read()["resolutions"].get(key)
        if record is None:
            return None
        return self._decode(record)

    def save(self, key: str, expected: WorkState, updated: WorkState) -> None:
        updated.validate()
        def operation(document: dict) -> None:
            record = document["resolutions"].get(key)
            if record is None or self._decode(record) != expected:
                raise RuntimeError("stale persisted execution state")
            document["resolutions"][key] = updated.as_dict()
            return None
        self._locked(operation)


class Controller:
    def __init__(self, registry: Registry, store: ResolutionStore, executor: ProcessExecutor):
        self.registry, self.store, self.executor = registry, store, executor

    def _resolve(self, operation: str, repository: str, issue_number: int,
                 idempotency_key: str) -> WorkState:
        if operation not in {"preflight", "start", "resume"}:
            raise ValueError("unsupported operation")
        validate_repository(repository)
        validate_issue_number(issue_number)
        validate_idempotency_key(idempotency_key)
        target = self.registry.resolve(repository, issue_number)
        persisted = self.store.load(idempotency_key)
        if persisted is not None and persisted.target != target:
            raise RuntimeError("registry drift conflicts with persisted resolution")
        if operation == "resume" and persisted is None:
            raise RuntimeError("resume requires a persisted resolution")
        return self.store.bind(idempotency_key, target)

    def observe_session(self, idempotency_key: str, session_id: str) -> WorkState:
        """Trusted controller observation; this is intentionally not exposed by the CLI."""
        validate_idempotency_key(session_id)
        state = self.store.load(idempotency_key)
        if state is None or state.phase not in {"starting", "resuming"}:
            raise RuntimeError("session identity cannot be recorded in the current phase")
        if state.codex_session_id is not None and state.codex_session_id != session_id:
            raise RuntimeError("Codex session identity conflicts with persisted state")
        updated = replace(state, codex_session_id=session_id, phase="active", terminal=None)
        self.store.save(idempotency_key, state, updated)
        return updated

    def observe_correctable(self, idempotency_key: str) -> WorkState:
        """Trusted controller finding; textual worker output cannot invoke this transition."""
        state = self.store.load(idempotency_key)
        if state is None or state.codex_session_id is None:
            raise RuntimeError("correctable finding requires a persisted Codex session")
        if state.phase == "active":
            phase = "correctable"
        elif state.phase == "semantic_blocked" and state.terminal is not None:
            phase = "exited_resumable" if state.terminal.resumable else "exited_unresumable"
        else:
            raise RuntimeError("correctable finding conflicts with persisted execution state")
        updated = replace(state, phase=phase)
        self.store.save(idempotency_key, state, updated)
        return updated

    def observe_terminal(self, idempotency_key: str, exit_code: int,
                         semantic_outcome: str, resumable: bool) -> WorkState:
        """Trusted structured terminal observation, separate from process prose/status."""
        terminal = TerminalObservation(exit_code, semantic_outcome, resumable)
        terminal.validate()
        state = self.store.load(idempotency_key)
        if state is None or state.phase not in {"starting", "active", "correctable", "resuming"}:
            raise RuntimeError("terminal observation conflicts with persisted state")
        if semantic_outcome == "success":
            phase = "semantic_success"
        elif semantic_outcome in {"blocked", "invalid"}:
            phase = "semantic_blocked"
        elif semantic_outcome == "crashed":
            phase = "crashed"
        else:
            phase = "exited_resumable" if resumable else "exited_unresumable"
        updated = replace(state, phase=phase, terminal=terminal)
        self.store.save(idempotency_key, state, updated)
        return updated

    def _windows(self, target: GovernedTarget) -> list[str]:
        output = self.executor.run(
            ("tmux", "list-windows", "-t", target.session, "-F", "#{window_name}"),
            timeout=10.0,
        )
        return [line for line in output.splitlines() if line]

    def _preflight_existing(self, target: GovernedTarget) -> None:
        windows = self._windows(target)
        if windows.count(target.window) != 1:
            raise RuntimeError("exact governed tmux window is unavailable or ambiguous")
        path = self.executor.run(
            ("tmux", "display-message", "-p", "-t", target.tmux_target,
             "#{pane_current_path}"), timeout=10.0,
        ).strip()
        if path != target.worktree:
            raise RuntimeError("tmux pane worktree does not match governed target")
        self._verify_worktree_branch(target)
        workers = self.executor.run(
            ("tmux", "list-panes", "-t", target.tmux_target, "-F",
             "#{pane_current_command}"), timeout=10.0,
        ).splitlines()
        if len(workers) != 1 or workers[0].casefold() != target.worker.casefold():
            raise RuntimeError("sole Codex worker topology is not established")

    def _preflight_pane(self, target: GovernedTarget) -> str:
        windows = self._windows(target)
        if windows.count(target.window) != 1:
            raise RuntimeError("exact governed tmux window is unavailable or ambiguous")
        path = self.executor.run(
            ("tmux", "display-message", "-p", "-t", target.tmux_target,
             "#{pane_current_path}"), timeout=10.0,
        ).strip()
        if path != target.worktree:
            raise RuntimeError("tmux pane worktree does not match governed target")
        self._verify_worktree_branch(target)
        commands = self.executor.run(
            ("tmux", "list-panes", "-t", target.tmux_target, "-F",
             "#{pane_current_command}"), timeout=10.0,
        ).splitlines()
        if len(commands) != 1:
            raise RuntimeError("governed tmux pane is unavailable or ambiguous")
        return commands[0]

    def _verify_worktree_branch(self, target: GovernedTarget) -> None:
        branch = self.executor.run(
            ("git", "-C", target.worktree, "branch", "--show-current"), timeout=10.0,
        ).strip()
        if branch != target.branch:
            raise RuntimeError("worktree branch does not match governed target")

    def execute(self, operation: str, repository: str, issue_number: int,
                idempotency_key: str) -> dict:
        state = self._resolve(operation, repository, issue_number, idempotency_key)
        target = state.target
        if operation == "start":
            if state.phase != "never_started":
                raise RuntimeError("start cannot replace or duplicate persisted Codex work")
            windows = self._windows(target)
            if windows.count(target.window) > 1:
                raise RuntimeError("governed tmux window is ambiguous")
            if target.window in windows:
                self._preflight_existing(target)
                updated = replace(state, phase="starting")
                self.store.save(idempotency_key, state, updated)
                self.executor.run(
                    ("tmux", "select-window", "-t", target.tmux_target), timeout=10.0,
                )
            else:
                self._verify_worktree_branch(target)
                updated = replace(state, phase="starting")
                self.store.save(idempotency_key, state, updated)
                self.executor.run(
                    ("tmux", "new-window", "-d", "-t", target.session, "-n", target.window,
                     "-c", target.worktree, "codex"), timeout=20.0,
                )
            state, status = updated, "starting"
        elif operation == "preflight":
            if state.phase not in {"active", "correctable"} or state.codex_session_id is None:
                raise RuntimeError("preflight requires trusted active Codex session state")
            self._preflight_existing(target)
            status = "ready"
        elif state.phase in {"active", "correctable"}:
            self._preflight_existing(target)
            self.executor.run(
                ("tmux", "send-keys", "-t", target.tmux_target, "-l", "--", CONTINUE_PROMPT),
                timeout=10.0,
            )
            self.executor.run(("tmux", "send-keys", "-t", target.tmux_target, "Enter"),
                              timeout=10.0)
            if state.phase == "correctable":
                updated = replace(state, phase="active")
                self.store.save(idempotency_key, state, updated)
                state = updated
            status = "steered"
        elif state.phase == "exited_resumable":
            command = self._preflight_pane(target)
            if command.casefold() == target.worker.casefold():
                raise RuntimeError("persisted exited state conflicts with a live Codex process")
            updated = replace(state, phase="resuming", terminal=None)
            self.store.save(idempotency_key, state, updated)
            self.executor.run(
                ("tmux", "respawn-pane", "-k", "-t", target.tmux_target, "-c",
                 target.worktree, "codex", "resume", state.codex_session_id, CONTINUE_PROMPT),
                timeout=20.0,
            )
            state, status = updated, "resuming"
        elif state.phase in {"crashed", "exited_unresumable"}:
            if state.restart_count != 0:
                raise RuntimeError("fresh Codex session fallback is exhausted")
            command = self._preflight_pane(target)
            if command.casefold() == target.worker.casefold():
                raise RuntimeError("fresh fallback conflicts with a live Codex process")
            updated = replace(
                state, codex_session_id=None, phase="starting", terminal=None,
                process_generation=state.process_generation + 1, restart_count=1,
            )
            self.store.save(idempotency_key, state, updated)
            self.executor.run(
                ("tmux", "respawn-pane", "-k", "-t", target.tmux_target, "-c",
                 target.worktree, "codex"), timeout=20.0,
            )
            state, status = updated, "restarted"
        else:
            raise RuntimeError("persisted semantic/session state forbids continuation")
        return {
            "version": VERSION,
            "operation": operation,
            "idempotency_key": idempotency_key,
            "resolution_id": target.resolution_id,
            "status": status,
            "execution": {
                "phase": state.phase,
                "codex_session_id": state.codex_session_id,
                "process_generation": state.process_generation,
                "restart_count": state.restart_count,
            },
            "governed_identity": {"repository": repository, "issue_number": issue_number},
        }


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="neo-dev-project-control", allow_abbrev=False)
    result.add_argument("operation", choices=("preflight", "start", "resume"))
    result.add_argument("--repository", required=True)
    result.add_argument("--issue-number", required=True, type=int)
    result.add_argument("--idempotency-key", required=True)
    return result


def main(argv: Sequence[str] | None = None, *,
         registry_path: pathlib.Path = CONTROLLER_REGISTRY_PATH,
         state_path: pathlib.Path = CONTROLLER_STATE_PATH,
         executor: ProcessExecutor | None = None,
         write: Callable[[str], None] = print) -> int:
    arguments = parser().parse_args(argv)
    try:
        controller = Controller(
            Registry.load(registry_path), FileResolutionStore(state_path),
            executor or SubprocessExecutor(),
        )
        result = controller.execute(
            arguments.operation, arguments.repository, arguments.issue_number,
            arguments.idempotency_key,
        )
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        write(json.dumps({"version": VERSION, "status": "rejected", "error": str(error)},
                         sort_keys=True, separators=(",", ":")))
        return 1
    write(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

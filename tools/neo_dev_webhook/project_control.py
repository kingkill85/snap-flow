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
from dataclasses import asdict, dataclass
from typing import Callable, Iterable, Protocol, Sequence

VERSION = 1
CONTROLLER_REGISTRY_PATH = pathlib.Path("/etc/neo-dev/project-control/registry.json")
CONTROLLER_STATE_PATH = pathlib.Path("/var/lib/neo-dev/project-control/resolutions.json")
REPOSITORY_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?")


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
    def bind(self, key: str, target: GovernedTarget) -> bool: ...
    def load(self, key: str) -> GovernedTarget | None: ...


class InMemoryResolutionStore:
    def __init__(self):
        self.records: dict[str, GovernedTarget] = {}

    def bind(self, key: str, target: GovernedTarget) -> bool:
        current = self.records.get(key)
        if current is not None and current != target:
            raise RuntimeError("persisted resolution conflicts with governed target")
        self.records[key] = target
        return current is None

    def load(self, key: str) -> GovernedTarget | None:
        return self.records.get(key)


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

    def bind(self, key: str, target: GovernedTarget) -> bool:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
        lock_path = self.path.with_suffix(self.path.suffix + ".lock")
        descriptor = os.open(lock_path, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            import fcntl
            fcntl.flock(descriptor, fcntl.LOCK_EX)
            document = self._read()
            current = document["resolutions"].get(key)
            encoded = target.as_dict()
            if current is not None and current != encoded:
                raise RuntimeError("persisted resolution conflicts with governed target")
            if current is not None:
                return False
            document["resolutions"][key] = encoded
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
            return True
        finally:
            os.close(descriptor)

    def load(self, key: str) -> GovernedTarget | None:
        document = self._read()
        record = document["resolutions"].get(key)
        if record is None:
            return None
        try:
            target = GovernedTarget(**record)
        except TypeError as error:
            raise RuntimeError("invalid persisted resolution record") from error
        target.validate()
        return target


class Controller:
    def __init__(self, registry: Registry, store: ResolutionStore, executor: ProcessExecutor):
        self.registry, self.store, self.executor = registry, store, executor

    def _resolve(self, operation: str, repository: str, issue_number: int,
                 idempotency_key: str) -> GovernedTarget:
        if operation not in {"preflight", "start", "resume"}:
            raise ValueError("unsupported operation")
        validate_repository(repository)
        validate_issue_number(issue_number)
        validate_idempotency_key(idempotency_key)
        target = self.registry.resolve(repository, issue_number)
        persisted = self.store.load(idempotency_key)
        if persisted is not None and persisted != target:
            raise RuntimeError("registry drift conflicts with persisted resolution")
        if operation == "resume" and persisted is None:
            raise RuntimeError("resume requires a persisted resolution")
        self.store.bind(idempotency_key, target)
        return target

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

    def _verify_worktree_branch(self, target: GovernedTarget) -> None:
        branch = self.executor.run(
            ("git", "-C", target.worktree, "branch", "--show-current"), timeout=10.0,
        ).strip()
        if branch != target.branch:
            raise RuntimeError("worktree branch does not match governed target")

    def execute(self, operation: str, repository: str, issue_number: int,
                idempotency_key: str) -> dict:
        target = self._resolve(operation, repository, issue_number, idempotency_key)
        if operation == "start":
            windows = self._windows(target)
            if windows.count(target.window) > 1:
                raise RuntimeError("governed tmux window is ambiguous")
            if target.window in windows:
                self._preflight_existing(target)
                self.executor.run(
                    ("tmux", "select-window", "-t", target.tmux_target), timeout=10.0,
                )
                status = "resumed"
            else:
                self._verify_worktree_branch(target)
                self.executor.run(
                    ("tmux", "new-window", "-d", "-t", target.session, "-n", target.window,
                     "-c", target.worktree, "codex"), timeout=20.0,
                )
                status = "started"
        else:
            self._preflight_existing(target)
            if operation in {"start", "resume"}:
                self.executor.run(("tmux", "select-window", "-t", target.tmux_target), timeout=10.0)
                status = "resumed"
            else:
                status = "ready"
        return {
            "version": VERSION,
            "operation": operation,
            "idempotency_key": idempotency_key,
            "resolution_id": target.resolution_id,
            "status": status,
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

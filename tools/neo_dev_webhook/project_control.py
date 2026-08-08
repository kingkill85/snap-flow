from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import re
import subprocess
import tempfile
import time
import uuid
from dataclasses import asdict, dataclass, replace
from typing import Callable, Iterable, Protocol, Sequence

VERSION = 1
CONTROLLER_REGISTRY_PATH = pathlib.Path("/etc/neo-dev/project-control/registry.json")
CONTROLLER_STATE_PATH = pathlib.Path("/var/lib/neo-dev/project-control/resolutions.json")
CODEX_RUNTIME_PATH = "/usr/local/lib/neo-dev-project-control/neo-dev-codex-runtime"
PROJECT_WORKER_PATH = "/usr/local/sbin/neo-dev-project-worker"
RUNTIME_SUPERVISOR_PATH = "/usr/local/sbin/neo-dev-runtime-supervisor"
CODEX_BIN_PATH = "/usr/local/bin/codex"
CODEX_APP_SERVER_ARGV = (CODEX_BIN_PATH, "app-server", "--stdio")
CODEX_WORKER_ARGV = CODEX_APP_SERVER_ARGV
REPOSITORY_PATTERN = re.compile(r"[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?")
SAFE_COMPONENT_PATTERN = re.compile(r"[a-z0-9][a-z0-9._-]{0,62}")
CONTINUE_PROMPT = "Continue the governed Issue work and address the latest trusted operator finding."
PHASES = frozenset({
    "never_started", "starting", "active", "correctable", "resuming",
    "exited_resumable", "exited_unresumable", "semantic_success",
    "semantic_blocked", "crashed", "failed_closed",
})
SEMANTIC_OUTCOMES = frozenset({"success", "correctable", "blocked", "crashed", "invalid"})
LIFECYCLE_STATES = (
    "label", "specification_ready", "spec_approved", "implementation_verified",
    "accepted", "archive_authorized", "archive_ci_verified", "merge_authorized",
    "merged_closed",
    "cancelled",
)


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
        if self.semantic_outcome == "success" and self.exit_code != 0:
            raise ValueError("semantic success requires exit code zero")


@dataclass(frozen=True)
class WorkState:
    target: GovernedTarget
    codex_session_id: str | None = None
    phase: str = "never_started"
    process_generation: int = 0
    restart_count: int = 0
    terminal: TerminalObservation | None = None
    lifecycle_state: str = "label"
    lifecycle_updated_at: str | None = None
    spec_sha: str | None = None
    base_sha: str | None = None
    implementation_sha: str | None = None
    accepted_sha: str | None = None
    archive_sha: str | None = None
    approval_at: str | None = None
    accepted_at: str | None = None
    merge_authorized_at: str | None = None
    github_evidence: dict | None = None

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
        if self.lifecycle_state not in LIFECYCLE_STATES:
            raise ValueError("invalid governed lifecycle state")
        sha = re.compile(r"[0-9a-f]{40}")
        for value in (self.base_sha, self.spec_sha, self.implementation_sha, self.accepted_sha,
                      self.archive_sha):
            if value is not None and sha.fullmatch(value) is None:
                raise ValueError("invalid persisted lifecycle SHA")
        requirements = {
            "specification_ready": (self.base_sha, self.spec_sha,),
            "spec_approved": (self.base_sha, self.spec_sha, self.approval_at),
            "implementation_verified": (self.base_sha, self.spec_sha, self.implementation_sha),
            "accepted": (self.base_sha, self.spec_sha, self.implementation_sha, self.accepted_sha,
                         self.accepted_at),
            "archive_authorized": (self.base_sha, self.spec_sha, self.implementation_sha,
                                   self.accepted_sha, self.accepted_at,
                                   self.merge_authorized_at),
            "archive_ci_verified": (self.base_sha, self.spec_sha, self.implementation_sha,
                                    self.accepted_sha, self.archive_sha),
            "merge_authorized": (self.base_sha, self.spec_sha, self.implementation_sha,
                                 self.accepted_sha, self.accepted_at, self.archive_sha,
                                 self.merge_authorized_at),
            "merged_closed": (self.base_sha, self.archive_sha, self.merge_authorized_at),
        }
        if self.lifecycle_state != "label" and self.lifecycle_updated_at is None:
            raise ValueError("governed lifecycle transition timestamp is missing")
        if any(value is None for value in requirements.get(self.lifecycle_state, ())):
            raise ValueError("governed lifecycle evidence is incomplete")
        if self.github_evidence is not None and not isinstance(self.github_evidence, dict):
            raise ValueError("invalid host GitHub evidence")

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


class ProjectWorkerExecutor:
    """Root-only fixed adapter: every repository/tmux/process command runs as dev."""
    def run(self, argv: Sequence[str], *, timeout: float) -> str:
        result = subprocess.run(
            [PROJECT_WORKER_PATH, *argv], check=True, capture_output=True, text=True,
            timeout=timeout, shell=False,
        )
        return result.stdout


class RuntimeSupervisorLauncher:
    def start(self, operation: str, idempotency_key: str,
              session_id: str | None = None) -> None:
        if os.geteuid() != 0:
            raise PermissionError("runtime supervisor launcher must run as root")
        argv = [RUNTIME_SUPERVISOR_PATH, operation, "--idempotency-key", idempotency_key]
        if session_id is not None:
            argv.extend(("--session-id", session_id))
        path = pathlib.Path("/run/neo-dev-runtime") / f"{idempotency_key}.sock"
        path.unlink(missing_ok=True)
        process = subprocess.Popen(
            argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, close_fds=True, start_new_session=True,
        )
        deadline = time.monotonic() + 5
        while not path.exists():
            if process.poll() is not None:
                raise RuntimeError("runtime supervisor failed before socket readiness")
            if time.monotonic() >= deadline:
                process.terminate()
                raise RuntimeError("runtime supervisor socket readiness timed out")
            time.sleep(0.02)


class Registry:
    def __init__(self, records: Iterable[GovernedTarget], templates: Iterable[dict] = (),
                 projects: Iterable[dict] = ()):
        self.records = tuple(records)
        self.templates = tuple(templates)
        self.projects = tuple(projects)

    @classmethod
    def load(cls, path: pathlib.Path) -> "Registry":
        document = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(document, dict) or document.get("version") != VERSION:
            raise ValueError("unsupported controller registry version")
        records = document.get("targets")
        templates = document.get("project_templates", [])
        projects = document.get("projects", [])
        if (not isinstance(records, list) or not isinstance(templates, list)
                or not isinstance(projects, list)):
            raise ValueError("invalid controller registry")
        try:
            return cls((GovernedTarget(**record) for record in records), templates, projects)
        except (TypeError, KeyError) as error:
            raise ValueError("invalid controller registry record") from error

    def resolve(self, repository: str, issue_number: int) -> GovernedTarget:
        matches = [record for record in self.records
                   if record.repository == repository and record.issue_number == issue_number]
        if len(matches) > 1:
            raise RuntimeError("governed identity must resolve to exactly one record")
        if len(matches) == 1:
            matches[0].validate()
            return matches[0]
        templates = [item for item in self.templates if item.get("repository") == repository]
        if len(templates) != 1:
            raise RuntimeError("governed identity must resolve to exactly one template")
        template = templates[0]
        allowed = {"repository", "project", "session", "repository_path", "worktree_root",
                   "branch_prefix", "worker"}
        if set(template) != allowed:
            raise ValueError("invalid project template fields")
        project = template["project"]
        session = template["session"]
        root = template["worktree_root"]
        repository_path = template["repository_path"]
        prefix = template["branch_prefix"]
        worker = template["worker"]
        for value in (project, session, prefix):
            if not isinstance(value, str) or SAFE_COMPONENT_PATTERN.fullmatch(value) is None:
                raise ValueError("unsafe project template component")
        if (not isinstance(repository_path, str) or not repository_path.startswith("/workspace/")
                or pathlib.PurePosixPath(repository_path).name != repository_path.removeprefix("/workspace/")
                or not isinstance(root, str) or not root.startswith("/workspace/")
                or pathlib.PurePosixPath(root).name != root.removeprefix("/workspace/")
                or worker != "Codex"):
            raise ValueError("unsafe project template")
        if repository_path != f"/workspace/{project}" or root != repository_path:
            raise ValueError("project template paths must match the fixed project root")
        target = GovernedTarget(
            repository=repository,
            issue_number=issue_number,
            project=project,
            session=session,
            window=f"issue-{issue_number}",
            worktree=f"/workspace/{root.removeprefix('/workspace/')}-issue-{issue_number}",
            branch=f"{prefix}/issue-{issue_number}",
            worker=worker,
        )
        target.validate()
        coordinates = ((item.window, item.worktree, item.branch) for item in self.records)
        if any(target.window in values or target.worktree in values or target.branch in values
               for values in coordinates):
            raise RuntimeError("derived governed target collides with an explicit record")
        return target

    def project_config(self, repository: str) -> dict:
        matches = [item for item in self.projects if item.get("repository") == repository]
        if len(matches) != 1 or set(matches[0]) != {"repository", "repository_path", "origin_url"}:
            raise RuntimeError("repository root must resolve to exactly one root-owned project record")
        path = matches[0]["repository_path"]
        origin = matches[0]["origin_url"]
        if (not isinstance(path, str) or not path.startswith("/workspace/")
                or not isinstance(origin, str) or not origin):
            raise ValueError("invalid root-owned project record")
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
                lifecycle_state=record.get("lifecycle_state", "label"),
                lifecycle_updated_at=record.get("lifecycle_updated_at"),
                spec_sha=record.get("spec_sha"),
                base_sha=record.get("base_sha"),
                implementation_sha=record.get("implementation_sha"),
                accepted_sha=record.get("accepted_sha"),
                archive_sha=record.get("archive_sha"),
                approval_at=record.get("approval_at"),
                accepted_at=record.get("accepted_at"),
                merge_authorized_at=record.get("merge_authorized_at"),
                github_evidence=record.get("github_evidence"),
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
    def __init__(self, registry: Registry, store: ResolutionStore, executor: ProcessExecutor,
                 supervisor: RuntimeSupervisorLauncher | None = None):
        self.registry, self.store, self.executor = registry, store, executor
        self.supervisor = supervisor

    @staticmethod
    def _result(operation: str, key: str, state: WorkState, status: str) -> dict:
        return {
            "version": VERSION, "operation": operation, "idempotency_key": key,
            "resolution_id": state.target.resolution_id, "status": status,
            "execution": {
                "phase": state.phase, "codex_session_id": state.codex_session_id,
                "process_generation": state.process_generation,
                "restart_count": state.restart_count,
                "lifecycle_state": state.lifecycle_state,
                "archive_sha": state.archive_sha,
            },
            "governed_identity": {"repository": state.target.repository,
                                  "issue_number": state.target.issue_number},
        }

    def _resolve(self, operation: str, repository: str, issue_number: int,
                 idempotency_key: str) -> WorkState:
        if operation not in {"status", "attest", "preflight", "start", "resume", "finalize"}:
            raise ValueError("unsupported operation")
        validate_repository(repository)
        validate_issue_number(issue_number)
        validate_idempotency_key(idempotency_key)
        target = self.registry.resolve(repository, issue_number)
        persisted = self.store.load(idempotency_key)
        if persisted is not None and persisted.target != target:
            raise RuntimeError("registry drift conflicts with persisted resolution")
        if operation in {"status", "attest", "resume", "finalize"} and persisted is None:
            raise RuntimeError(f"{operation} requires a persisted resolution")
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

    def advance_lifecycle(self, idempotency_key: str, **evidence) -> WorkState:
        """Persist a verifier-produced legal lifecycle transition."""
        state = self.store.load(idempotency_key)
        if state is None:
            raise RuntimeError("lifecycle transition requires persisted controller state")
        next_state = evidence.pop("lifecycle_state", None)
        try:
            current_index = LIFECYCLE_STATES.index(state.lifecycle_state)
            next_index = LIFECYCLE_STATES.index(next_state)
        except ValueError as error:
            raise RuntimeError("invalid lifecycle transition") from error
        revision_reopen = next_state == "label" and state.lifecycle_state in {
            "specification_ready", "spec_approved", "implementation_verified", "accepted",
        }
        fix_reopen = next_state == "spec_approved" and state.lifecycle_state in {
            "spec_approved", "implementation_verified", "accepted",
        }
        cancel = next_state == "cancelled" and state.lifecycle_state in {
            "specification_ready", "spec_approved", "implementation_verified", "accepted",
            "archive_authorized", "archive_ci_verified",
        }
        if (next_index != current_index + 1 and not revision_reopen and not fix_reopen and not cancel):
            raise RuntimeError("lifecycle transition skipped or repeated a governed gate")
        allowed = {
            "lifecycle_updated_at", "base_sha", "spec_sha", "implementation_sha", "accepted_sha",
            "archive_sha", "approval_at", "accepted_at", "merge_authorized_at",
        }
        if set(evidence) - allowed:
            raise RuntimeError("verifier returned unsupported lifecycle evidence")
        updated = replace(state, lifecycle_state=next_state, **evidence)
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

    @staticmethod
    def _runtime_command(idempotency_key: str, session_id: str | None = None) -> str:
        parts = [CODEX_RUNTIME_PATH, "resume" if session_id else "start",
                 "--idempotency-key", idempotency_key]
        if session_id is not None:
            parts.extend(("--session-id", session_id))
        return " ".join(parts)

    def _preflight_existing(self, target: GovernedTarget, state: WorkState,
                            idempotency_key: str) -> None:
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
        metadata = self.executor.run(
            ("tmux", "list-panes", "-t", target.tmux_target, "-F",
             "#{pane_current_command}\t#{pane_start_command}\t#{pane_pid}"),
            timeout=10.0,
        ).splitlines()
        if len(metadata) != 1:
            raise RuntimeError("sole Codex worker topology is not established")
        fields = metadata[0].split("\t")
        if len(fields) != 3 or fields[0] != "python3" or not fields[2].isdigit():
            raise RuntimeError("controller runtime process metadata does not match")
        expected_starts = {self._runtime_command(idempotency_key)}
        if state.codex_session_id is not None:
            expected_starts.add(self._runtime_command(idempotency_key, state.codex_session_id))
        if fields[1] not in expected_starts:
            raise RuntimeError("controller runtime start command does not match")
        children = self.executor.run(
            ("ps", "-o", "pid=,ppid=,comm=,args=", "--ppid", fields[2]),
            timeout=10.0,
        ).splitlines()
        if len(children) != 1:
            raise RuntimeError("sole Codex exec child is not established")
        child = children[0].strip().split(None, 3)
        common = (
            "/usr/bin/timeout --signal=TERM --kill-after=10 1800 "
            "/usr/local/bin/codex exec "
        )
        start_prefix = (
            common + "--json --dangerously-bypass-approvals-and-sandbox "
            f"-C {target.worktree} --output-schema /tmp/neo-dev-completion-"
        )
        resume_prefix = (
            common + "resume --json --dangerously-bypass-approvals-and-sandbox "
            "--output-schema /tmp/neo-dev-completion-"
        )
        valid_start = len(child) == 4 and child[3].startswith(start_prefix)
        valid_resume = (
            len(child) == 4 and state.codex_session_id is not None
            and child[3].startswith(resume_prefix)
            and f" {state.codex_session_id} " in child[3]
        )
        if (len(child) != 4 or child[1] != fields[2] or child[2] != "timeout"
                or not (valid_start or valid_resume)):
            raise RuntimeError("Codex exec process metadata does not match")

    def _preflight_inactive_pane(self, target: GovernedTarget) -> None:
        windows = self._windows(target)
        if windows.count(target.window) != 1:
            raise RuntimeError("exact governed tmux window is unavailable or ambiguous")
        metadata = self.executor.run(
            ("tmux", "list-panes", "-t", target.tmux_target, "-F",
             "#{pane_dead}\t#{pane_pid}\t#{pane_current_path}"), timeout=10.0,
        ).splitlines()
        if len(metadata) != 1:
            raise RuntimeError("governed tmux pane is unavailable or ambiguous")
        fields = metadata[0].split("\t")
        if len(fields) != 3 or fields[0] != "1" or not fields[1].isdigit():
            raise RuntimeError("persisted exited state conflicts with a live process")
        self._verify_worktree_branch(target)

    def _verify_worktree_branch(self, target: GovernedTarget) -> None:
        branch = self.executor.run(
            ("git", "-C", target.worktree, "branch", "--show-current"), timeout=10.0,
        ).strip()
        if branch != target.branch:
            raise RuntimeError("worktree branch does not match governed target")

    def _prepare_issue_target(self, target: GovernedTarget) -> None:
        """Create a generic issue worktree once, from the freshly fetched main ref."""
        if target == ISSUE_77_TARGET:
            return
        config = self.registry.project_config(target.repository)
        repository_path = config["repository_path"]
        observed_root = self.executor.run(
            ("git", "-C", repository_path, "rev-parse", "--show-toplevel"), timeout=10.0,
        ).strip()
        common = self.executor.run(
            ("git", "-C", repository_path, "rev-parse", "--path-format=absolute",
             "--git-common-dir"), timeout=10.0,
        ).strip()
        origin = self.executor.run(
            ("git", "-C", repository_path, "remote", "get-url", "origin"), timeout=10.0,
        ).strip()
        if observed_root != repository_path or common != f"{repository_path}/.git":
            raise RuntimeError("repository root/common directory does not match registry")
        normalized = origin.removesuffix(".git").replace("git@github.com:", "https://github.com/")
        expected = config["origin_url"].removesuffix(".git").replace(
            "git@github.com:", "https://github.com/",
        )
        if normalized != expected:
            raise RuntimeError("repository origin does not match registry")
        self.executor.run(("git", "-C", repository_path, "fetch", "--prune",
                           "origin", "main"), timeout=60.0)
        worktrees = self.executor.run(
            ("git", "-C", repository_path, "worktree", "list", "--porcelain"),
            timeout=10.0,
        )
        paths = [line.removeprefix("worktree ") for line in worktrees.splitlines()
                 if line.startswith("worktree ")]
        if target.worktree in paths:
            worktree_common = self.executor.run(
                ("git", "-C", target.worktree, "rev-parse", "--path-format=absolute",
                 "--git-common-dir"), timeout=10.0,
            ).strip()
            if worktree_common != common:
                raise RuntimeError("existing worktree belongs to another common directory")
            self._verify_worktree_branch(target)
            self.executor.run(
                ("git", "-C", target.worktree, "merge-base", "--is-ancestor", "origin/main",
                 target.branch), timeout=10.0,
            )
            return
        branch_ref = self.executor.run(
            ("git", "-C", repository_path, "for-each-ref", "--format=%(refname)",
             f"refs/heads/{target.branch}"), timeout=10.0,
        ).strip()
        if branch_ref:
            self.executor.run(
                ("git", "-C", repository_path, "worktree", "add",
                 target.worktree, target.branch), timeout=60.0,
            )
        else:
            self.executor.run(
                ("git", "-C", repository_path, "worktree", "add", "-b",
                 target.branch, target.worktree, "origin/main"), timeout=60.0,
            )
        self._verify_worktree_branch(target)
        self.executor.run(
            ("git", "-C", target.worktree, "merge-base", "--is-ancestor", "origin/main",
             target.branch), timeout=10.0,
        )

    def _start_supervisor(self, operation: str, key: str,
                          session_id: str | None = None) -> None:
        if self.supervisor is not None:
            self.supervisor.start(operation, key, session_id)

    def execute(self, operation: str, repository: str, issue_number: int,
                idempotency_key: str, evidence: dict | None = None) -> dict:
        state = self._resolve(operation, repository, issue_number, idempotency_key)
        if evidence is not None:
            from .verification import validate_host_evidence
            validate_host_evidence(evidence, state, idempotency_key)
            updated = replace(state, github_evidence=evidence)
            self.store.save(idempotency_key, state, updated)
            state = updated
        target = state.target
        if operation == "status":
            return self._result(operation, idempotency_key, state, "observed")
        if operation == "attest":
            if state.github_evidence is None or state.lifecycle_state not in {
                "label", "spec_approved", "accepted", "archive_authorized",
                "merge_authorized",
            }:
                raise RuntimeError("attestation does not match a verifiable lifecycle state")
            if state.lifecycle_state == "accepted":
                return self._result(operation, idempotency_key, state, "awaiting_merge")
            from .verification import RepositoryGitHubVerifier
            transition = RepositoryGitHubVerifier(
                self.executor, state.github_evidence,
            ).verify_next(target, state)
            if not transition.verified or transition.evidence is None:
                raise RuntimeError(transition.blocker or "attestation verification failed")
            state = self.advance_lifecycle(idempotency_key, **transition.evidence)
            return self._result(operation, idempotency_key, state, "attested")
        if operation == "finalize":
            if state.lifecycle_state == "merge_authorized" and state.github_evidence is not None:
                from .verification import RepositoryGitHubVerifier
                verifier = RepositoryGitHubVerifier(self.executor, state.github_evidence)
                transition = verifier.verify_next(target, state)
                if not transition.verified or transition.evidence is None:
                    raise RuntimeError(transition.blocker or "merge finalization evidence failed")
                state = self.advance_lifecycle(idempotency_key, **transition.evidence)
            if state.lifecycle_state != "merged_closed":
                return self._result(operation, idempotency_key, state,
                                    "pending")
            from .verification import RepositoryGitHubVerifier
            verification = RepositoryGitHubVerifier(self.executor, state.github_evidence).verify(
                target, "merge-finalization", expected_archive_sha=state.archive_sha,
            )
            if not verification.verified:
                raise RuntimeError(verification.blocker or "merge finalization verification failed")
            status = "finalized"
        elif operation == "start":
            recovering_launch = (state.phase == "crashed" and state.codex_session_id is None
                                 and state.restart_count == 1)
            if state.phase != "never_started" and not recovering_launch:
                raise RuntimeError("start cannot replace or duplicate persisted Codex work")
            self._prepare_issue_target(target)
            windows = self._windows(target)
            if windows.count(target.window) > 1:
                raise RuntimeError("governed tmux window is ambiguous")
            if target.window in windows:
                if recovering_launch:
                    failed = replace(state, phase="failed_closed")
                    self.store.save(idempotency_key, state, failed)
                raise RuntimeError("start launch intent conflicts with an existing window")
            else:
                self._verify_worktree_branch(target)
                updated = replace(state, phase="starting", terminal=None)
                self.store.save(idempotency_key, state, updated)
                try:
                    self._start_supervisor("start", idempotency_key)
                    self.executor.run(
                        ("tmux", "new-window", "-d", "-t", target.session, "-n", target.window,
                         "-c", target.worktree), timeout=20.0,
                    )
                    self.executor.run(
                        ("tmux", "set-option", "-w", "-t", target.tmux_target,
                         "remain-on-exit", "on"), timeout=10.0,
                    )
                    self.executor.run(
                        ("tmux", "respawn-pane", "-k", "-t", target.tmux_target, "-c",
                         target.worktree, CODEX_RUNTIME_PATH, "start",
                         "--idempotency-key", idempotency_key), timeout=20.0,
                    )
                except BaseException:
                    failed = replace(
                        updated, phase="failed_closed" if recovering_launch else "crashed",
                        restart_count=1,
                        terminal=TerminalObservation(1, "crashed", not recovering_launch),
                    )
                    self.store.save(idempotency_key, updated, failed)
                    raise
            state, status = updated, "starting"
        elif operation == "preflight":
            if state.phase not in {"active", "correctable"} or state.codex_session_id is None:
                raise RuntimeError("preflight requires trusted active Codex session state")
            self._preflight_existing(target, state, idempotency_key)
            status = "ready"
        elif state.phase in {"active", "correctable"}:
            self._preflight_existing(target, state, idempotency_key)
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
        elif state.phase == "exited_resumable" or (
            state.phase == "semantic_blocked" and state.terminal is not None
            and state.terminal.resumable
        ):
            self._preflight_inactive_pane(target)
            updated = replace(state, phase="resuming", terminal=None)
            self.store.save(idempotency_key, state, updated)
            try:
                self._start_supervisor("resume", idempotency_key, state.codex_session_id)
                self.executor.run(
                    ("tmux", "respawn-pane", "-k", "-t", target.tmux_target, "-c",
                     target.worktree, CODEX_RUNTIME_PATH, "resume", "--idempotency-key",
                     idempotency_key, "--session-id", state.codex_session_id),
                    timeout=20.0,
                )
            except BaseException:
                failed = replace(
                    updated, phase="failed_closed" if state.restart_count == 1
                    else "exited_resumable", restart_count=1,
                    terminal=TerminalObservation(1, "crashed", state.restart_count == 0),
                )
                self.store.save(idempotency_key, updated, failed)
                raise
            state, status = updated, "resuming"
        elif state.phase in {"crashed", "exited_unresumable"}:
            if state.restart_count != 0:
                raise RuntimeError("fresh Codex session fallback is exhausted")
            self._preflight_inactive_pane(target)
            updated = replace(
                state, codex_session_id=None, phase="starting", terminal=None,
                process_generation=state.process_generation + 1, restart_count=1,
            )
            self.store.save(idempotency_key, state, updated)
            try:
                self._start_supervisor("start", idempotency_key)
                self.executor.run(
                    ("tmux", "respawn-pane", "-k", "-t", target.tmux_target, "-c",
                     target.worktree, CODEX_RUNTIME_PATH, "start", "--idempotency-key",
                     idempotency_key), timeout=20.0,
                )
            except BaseException:
                failed = replace(
                    updated, phase="failed_closed",
                    terminal=TerminalObservation(1, "crashed", False),
                )
                self.store.save(idempotency_key, updated, failed)
                raise
            state, status = updated, "restarted"
        else:
            raise RuntimeError("persisted semantic/session state forbids continuation")
        return self._result(operation, idempotency_key, state, status)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="neo-dev-project-control", allow_abbrev=False)
    result.add_argument("operation", choices=("status", "attest", "preflight", "start", "resume", "finalize"))
    result.add_argument("--repository", required=True)
    result.add_argument("--issue-number", required=True, type=int)
    result.add_argument("--idempotency-key", required=True)
    result.add_argument("--evidence")
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
            executor or ProjectWorkerExecutor(),
            RuntimeSupervisorLauncher() if executor is None else None,
        )
        evidence = None
        if arguments.evidence:
            import base64
            evidence = json.loads(base64.b64decode(arguments.evidence, validate=True))
        result = controller.execute(
            arguments.operation, arguments.repository, arguments.issue_number,
            arguments.idempotency_key, evidence,
        )
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        write(json.dumps({"version": VERSION, "status": "rejected", "error": str(error)},
                         sort_keys=True, separators=(",", ":")))
        return 1
    write(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

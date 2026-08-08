from __future__ import annotations

import json
import os
import pathlib
import re
import subprocess
import sys

from .deterministic_gates import REQUIRED_GATES
from .gate_scan import scan


def _run(command: list[str], cwd: str | None = None) -> None:
    subprocess.run(command, cwd=cwd, check=True, timeout=1800, shell=False)


def verify_openspec_status(value: object) -> None:
    if (not isinstance(value, dict) or value.get("isPlanningComplete") is not True
            or value.get("isComplete") is not True):
        raise RuntimeError("OpenSpec status is incomplete")


def execute(worktree: str, gate: str, approved: str) -> dict:
    if gate not in REQUIRED_GATES or not re.fullmatch(r"[0-9a-f]{40}", approved):
        raise ValueError("invalid deterministic gate")
    root = pathlib.Path(worktree).resolve()
    if not re.fullmatch(r"/workspace/[A-Za-z0-9._-]+-issue-[1-9][0-9]*", str(root)):
        raise ValueError("invalid registered worktree")
    os.chdir(root)
    paths = subprocess.run(["git", "diff", "--name-only", approved, "HEAD"],
                           check=True, capture_output=True, text=True, timeout=30).stdout.splitlines()
    tools = any(path.startswith("tools/neo_dev_webhook/") for path in paths)
    backend = any(path.startswith("backend/") for path in paths)
    frontend = any(path.startswith("frontend/") for path in paths)
    changes = sorted((root / "openspec/changes").glob("issue-*"))
    active = [path.name for path in changes if (path / "proposal.md").exists()]
    if len(active) != 1:
        raise RuntimeError("exactly one OpenSpec change is required")
    change = active[0]
    commands: list[tuple[list[str], str | None]] = []
    if gate in {"focused_tests", "full_tests"}:
        if tools:
            commands.append((["python3", "-m", "unittest", "discover", "-s",
                              "tools/neo_dev_webhook/tests", "-p", "test_*.py"], None))
        if backend:
            commands.append((["deno", "task", "test"], "backend"))
        if frontend:
            commands.append((["npm", "run", "test:run"], "frontend"))
    elif gate in {"lint", "typecheck", "build"}:
        if tools:
            commands.append((["python3", "-m", "compileall", "-q", "tools/neo_dev_webhook"], None))
        if backend:
            commands.append((["deno", "lint"] if gate == "lint" else
                             ["deno", "check", "src/main.ts"], "backend"))
        if frontend:
            commands.append((["npm", "run", "lint"] if gate == "lint" else
                             ["npm", "run", "build"], "frontend"))
    elif gate == "openspec_validate":
        commands.append((["npm", "exec", "--", "openspec", "validate", change, "--strict"], None))
    elif gate == "openspec_verify":
        result = subprocess.run(
            ["npm", "exec", "--", "openspec", "status", "--change", change, "--json"],
            check=True, capture_output=True, text=True, timeout=1800,
        )
        verify_openspec_status(json.loads(result.stdout))
        return {"gate": gate, "commands_executed": 1, "changed_paths": len(paths)}
    elif gate == "approval_immutability":
        commands.append((["git", "diff", "--quiet", approved, "HEAD", "--",
                          f"openspec/changes/{change}/proposal.md",
                          f"openspec/changes/{change}/design.md",
                          f"openspec/changes/{change}/tasks.md",
                          f"openspec/changes/{change}/specs"], None))
    elif gate in {"secret_scan", "private_scan", "ui_evidence"}:
        mode = {"secret_scan": "secret", "private_scan": "private",
                "ui_evidence": "ui"}[gate]
        if gate == "ui_evidence" and frontend:
            _run(["npm", "exec", "--", "playwright", "test"], "frontend")
        return scan(mode, approved)
    for command, cwd in commands:
        _run(command, cwd)
    return {"gate": gate, "commands_executed": len(commands), "changed_paths": len(paths)}


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 3:
        return 2
    try:
        print(json.dumps(execute(*args), sort_keys=True))
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError,
            subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import subprocess
import sys
from datetime import datetime, timezone

from .deterministic_gates import REQUIRED_GATES, expected_gate_commands
from .gate_scan import scan_paths


def verify_openspec_status(value: object) -> None:
    if (not isinstance(value, dict) or value.get("isPlanningComplete") is not True
            or value.get("isComplete") is not True):
        raise RuntimeError("OpenSpec status is incomplete")


def _execute(command: dict, head_sha: str, approved_spec_sha: str) -> tuple[dict, str]:
    result = subprocess.run(
        command["argv"], cwd=command["cwd"], check=False, capture_output=True,
        timeout=1800, shell=False,
    )
    record = {
        "argv": command["argv"], "cwd": command["cwd"],
        "exit_code": result.returncode,
        "stdout_sha256": hashlib.sha256(result.stdout).hexdigest(),
        "stderr_sha256": hashlib.sha256(result.stderr).hexdigest(),
        "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "head_sha": head_sha, "approved_spec_sha": approved_spec_sha,
    }
    stdout = result.stdout[:1_000_000].decode(errors="replace")
    if result.returncode != 0:
        raise RuntimeError(json.dumps({"failed_command": record}, sort_keys=True))
    return record, stdout


def execute(worktree: str, gate: str, approved: str, head: str,
            change: str, scope: str) -> dict:
    if (gate not in REQUIRED_GATES or not re.fullmatch(r"[0-9a-f]{40}", approved)
            or not re.fullmatch(r"[0-9a-f]{40}", head)
            or not re.fullmatch(r"issue-[A-Za-z0-9._-]+", change)):
        raise ValueError("invalid deterministic gate")
    root = pathlib.Path(worktree).resolve()
    if not re.fullmatch(r"/workspace/[A-Za-z0-9._-]+-issue-[1-9][0-9]*", str(root)):
        raise ValueError("invalid registered worktree")
    os.chdir(root)
    scopes = scope.split(",")
    if any(item not in {"none", "tools", "backend", "frontend"} for item in scopes):
        raise ValueError("invalid deterministic gate scope")
    changed = (["tools/neo_dev_webhook/controller.py"] if "tools" in scopes else []) + \
        (["backend/src/main.ts"] if "backend" in scopes else []) + \
        (["frontend/src/main.tsx"] if "frontend" in scopes else [])
    plan = expected_gate_commands(gate, changed, str(root), change, approved)
    records = []
    outputs = []
    for command in plan:
        record, stdout = _execute(command, head, approved)
        records.append(record)
        outputs.append(stdout)
    if gate == "openspec_verify":
        verify_openspec_status(json.loads(outputs[-1]))
    result = {}
    if gate in {"secret_scan", "private_scan", "ui_evidence"}:
        mode = {"secret_scan": "secret", "private_scan": "private",
                "ui_evidence": "ui"}[gate]
        paths = sorted(set(outputs[-2].splitlines() + outputs[-1].splitlines()))
        result = scan_paths(mode, paths)
    return {"gate": gate, "head_sha": head, "approved_spec_sha": approved,
            "commands": records, "result": result}


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 6:
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

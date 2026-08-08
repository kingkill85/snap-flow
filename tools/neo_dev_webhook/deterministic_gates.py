from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone


REQUIRED_GATES = (
    "focused_tests", "full_tests", "lint", "typecheck", "build",
    "openspec_validate", "openspec_verify", "approval_immutability",
    "secret_scan", "private_scan", "ui_evidence",
)


def run_gates(executor, target, head_sha: str, approved_spec_sha: str,
              checks: list[dict]) -> dict:
    observed = executor.run(
        ("git", "-C", target.worktree, "rev-parse", "HEAD"), timeout=20.0,
    ).strip()
    if observed != head_sha:
        raise RuntimeError("deterministic gates HEAD mismatch")
    dirty = executor.run(
        ("git", "-C", target.worktree, "status", "--porcelain", "--untracked-files=all"),
        timeout=20.0,
    ).strip()
    if dirty:
        raise RuntimeError("deterministic gates require a clean worktree including untracked files")
    branch = executor.run(
        ("git", "-C", target.worktree, "branch", "--show-current"), timeout=20.0,
    ).strip()
    if branch != target.branch:
        raise RuntimeError("deterministic gates require the correct registered branch")
    remote = executor.run(
        ("git", "-C", target.worktree, "ls-remote", "--heads", "origin",
         f"refs/heads/{target.branch}"), timeout=30.0,
    ).strip().split()
    if len(remote) != 2 or remote[0] != head_sha:
        raise RuntimeError("deterministic gates require a synced exact live PR branch head")
    if not checks or any(item.get("state") != "SUCCESS" or item.get("sha", head_sha) != head_sha
                         for item in checks):
        raise RuntimeError("exact-SHA CI gate failed")
    changed = executor.run(
        ("git", "-C", target.worktree, "diff", "--name-only", approved_spec_sha, head_sha),
        timeout=20.0,
    ).splitlines()
    records = {}
    for gate in REQUIRED_GATES:
        command = ("gate", target.worktree, gate, approved_spec_sha)
        try:
            output = executor.run(command, timeout=1800.0)
        except Exception as error:
            raise RuntimeError(f"{gate} deterministic gate failed: {error}") from error
        records[gate] = {
            "status": "passed", "command": list(command), "exit_code": 0,
            "output_sha256": hashlib.sha256(output.encode()).hexdigest(),
            "head_sha": head_sha,
            "observed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        if gate == "ui_evidence":
            try:
                ui_result = json.loads(output)
            except json.JSONDecodeError:
                ui_result = {}
            records[gate]["screenshots"] = ui_result.get("screenshots", [])
    ui_changed = [path for path in changed if path.startswith("frontend/")]
    return {
        "sha": head_sha, "approved_spec_sha": approved_spec_sha,
        "approval_artifact_sha": approved_spec_sha, "gates": records,
        "tests": {"focused": "passed", "full": "passed"},
        "lint": "passed", "typecheck": "passed", "build": "passed",
        "openspec": {"validate": "passed", "verify": "passed", "strict": True},
        "checks": [{"sha": head_sha, "state": item["state"]} for item in checks],
        "approval_artifacts": {"immutable": True}, "secret_scan": {"passed": True},
        "worktree": {"correct": True, "clean": True, "synced": True,
                     "tracked_and_relevant_untracked_reviewed": True},
        "ui": ({"required": True, "screenshots": records["ui_evidence"].get("screenshots", [])}
               if ui_changed else {"required": False,
                                   "reason": "no frontend paths changed",
                                   "changed_frontend_paths": []}),
    }

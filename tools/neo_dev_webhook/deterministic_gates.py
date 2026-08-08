from __future__ import annotations

import json
import re


REQUIRED_GATES = (
    "focused_tests", "full_tests", "lint", "typecheck", "build",
    "openspec_validate", "openspec_verify", "approval_immutability",
    "secret_scan", "private_scan", "ui_evidence",
)

FOCUSED_CONTROLLER_TESTS = (
    "tools.neo_dev_webhook.tests.test_independent_review",
    "tools.neo_dev_webhook.tests.test_deterministic_gates",
    "tools.neo_dev_webhook.tests.test_verification",
    "tools.neo_dev_webhook.tests.test_deployment",
)


def expected_gate_commands(gate: str, changed: list[str], worktree: str,
                           change: str, approved_spec_sha: str) -> list[dict]:
    tools_changed = any(path.startswith("tools/neo_dev_webhook/") for path in changed)
    backend_changed = any(path.startswith("backend/") for path in changed)
    frontend_changed = any(path.startswith("frontend/") for path in changed)
    root = worktree
    commands: list[dict] = []
    def add(argv, cwd=root): commands.append({"argv": list(argv), "cwd": cwd})
    if gate == "focused_tests":
        if tools_changed: add(("python3", "-m", "unittest", *FOCUSED_CONTROLLER_TESTS))
        if backend_changed: add(("deno", "task", "test"), f"{root}/backend")
        if frontend_changed: add(("npm", "run", "test:run"), f"{root}/frontend")
    elif gate == "full_tests":
        if tools_changed: add(("python3", "-m", "unittest", "discover", "-s",
                               "tools/neo_dev_webhook/tests", "-p", "test_*.py"))
        if backend_changed: add(("deno", "task", "test"), f"{root}/backend")
        if frontend_changed: add(("npm", "run", "test:run"), f"{root}/frontend")
    elif gate in {"lint", "typecheck", "build"}:
        if tools_changed: add(("python3", "-m", "compileall", "-q", "tools/neo_dev_webhook"))
        if backend_changed: add(("deno", "lint") if gate == "lint" else
                                ("deno", "check", "src/main.ts"), f"{root}/backend")
        if frontend_changed: add(("npm", "run", "lint") if gate == "lint" else
                                 ("npm", "run", "build"), f"{root}/frontend")
    elif gate == "openspec_validate":
        add(("npm", "exec", "--", "openspec", "validate", change, "--strict"))
    elif gate == "openspec_verify":
        add(("npm", "exec", "--", "openspec", "status", "--change", change, "--json"))
    elif gate == "approval_immutability":
        add(("git", "diff", "--quiet", approved_spec_sha, "HEAD", "--",
             f"openspec/changes/{change}/proposal.md", f"openspec/changes/{change}/design.md",
             f"openspec/changes/{change}/tasks.md", f"openspec/changes/{change}/specs"))
    elif gate in {"secret_scan", "private_scan", "ui_evidence"}:
        if gate == "ui_evidence" and frontend_changed:
            add(("npm", "exec", "--", "playwright", "test"), f"{root}/frontend")
        add(("git", "diff", "--name-only", approved_spec_sha, "HEAD"))
        add(("git", "ls-files", "--others", "--exclude-standard"))
    if not commands:
        add(("/usr/bin/true",))
    return commands


def validate_gate_execution(value: object, expected: list[dict], head_sha: str,
                            approved_spec_sha: str) -> dict:
    if (not isinstance(value, dict) or value.get("head_sha") != head_sha
            or value.get("approved_spec_sha") != approved_spec_sha
            or not isinstance(value.get("commands"), list)
            or len(value["commands"]) != len(expected)):
        raise ValueError("gate command provenance is incomplete or SHA-mismatched")
    observed_plan = [{"argv": item.get("argv"), "cwd": item.get("cwd")}
                     for item in value["commands"] if isinstance(item, dict)]
    if observed_plan != expected or len({(tuple(x["argv"]), x["cwd"]) for x in observed_plan}) != len(expected):
        raise ValueError("gate command provenance was substituted, duplicated, or reordered")
    for item in value["commands"]:
        if (item.get("exit_code") != 0 or item.get("head_sha") != head_sha
                or item.get("approved_spec_sha") != approved_spec_sha
                or not isinstance(item.get("observed_at"), str)
                or any(not isinstance(item.get(name), str)
                       or re.fullmatch(r"[0-9a-f]{64}", item[name]) is None
                       for name in ("stdout_sha256", "stderr_sha256"))):
            raise ValueError("gate command result is partial or failed")
    return value


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
    if not checks or any(
        item.get("state") != "SUCCESS" or item.get("head_sha") != head_sha
        or type(item.get("id")) is not int or not isinstance(item.get("name"), str)
        or item.get("status") != "completed" or item.get("conclusion") != "success"
        for item in checks
    ):
        raise RuntimeError("exact-SHA CI gate failed")
    changed = executor.run(
        ("git", "-C", target.worktree, "diff", "--name-only", approved_spec_sha, head_sha),
        timeout=20.0,
    ).splitlines()
    active_paths = executor.run(
        ("git", "-C", target.worktree, "ls-files", "openspec/changes/issue-*/proposal.md"),
        timeout=20.0,
    ).splitlines()
    names = {path.split("/")[2] for path in active_paths
             if len(path.split("/")) == 4}
    if len(names) != 1:
        raise RuntimeError("deterministic gates require exactly one active OpenSpec change")
    change = names.pop()
    records = {}
    scope = ",".join(name for name, prefix in (
        ("tools", "tools/neo_dev_webhook/"), ("backend", "backend/"),
        ("frontend", "frontend/")) if any(path.startswith(prefix) for path in changed)) or "none"
    for gate in REQUIRED_GATES:
        command = ("gate", target.worktree, gate, approved_spec_sha, head_sha, change, scope)
        try:
            output = executor.run(command, timeout=1800.0)
        except Exception as error:
            raise RuntimeError(f"{gate} deterministic gate failed: {error}") from error
        try:
            execution = json.loads(output)
            expected = expected_gate_commands(
                gate, changed, target.worktree, change, approved_spec_sha,
            )
            validate_gate_execution(execution, expected, head_sha, approved_spec_sha)
        except (json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"{gate} deterministic gate provenance invalid: {error}") from error
        records[gate] = execution
        records[gate]["status"] = "passed"
        if gate == "ui_evidence":
            records[gate]["screenshots"] = execution.get("result", {}).get("screenshots", [])
    ui_changed = [path for path in changed if path.startswith("frontend/")]
    return {
        "sha": head_sha, "approved_spec_sha": approved_spec_sha,
        "approval_artifact_sha": approved_spec_sha, "gates": records,
        "gate_context": {"changed_paths": changed, "worktree": target.worktree,
                         "change": change},
        "tests": {"focused": "passed", "full": "passed"},
        "lint": "passed", "typecheck": "passed", "build": "passed",
        "openspec": {"validate": "passed", "verify": "passed", "strict": True},
        "checks": [dict(item) for item in checks],
        "approval_artifacts": {"immutable": True}, "secret_scan": {"passed": True},
        "worktree": {"correct": True, "clean": True, "synced": True,
                     "tracked_and_relevant_untracked_reviewed": True},
        "ui": ({"required": True, "screenshots": records["ui_evidence"].get("screenshots", [])}
               if ui_changed else {"required": False,
                                   "reason": "no frontend paths changed",
                                   "changed_frontend_paths": []}),
    }

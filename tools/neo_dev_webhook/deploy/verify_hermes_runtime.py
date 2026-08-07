#!/usr/bin/env python3
"""Fail closed unless a dispatched dev worker resolves only the narrow plugin."""
from __future__ import annotations

import argparse
import json
import os
import uuid

SAFE_TOOLSETS = [
    "snapflow_neo_dev", "web", "browser", "memory", "session_search", "skills",
]
EXPECTED_RESOLVED_TOOLSETS = sorted([*SAFE_TOOLSETS, "kanban"])
FORBIDDEN_TOOLSETS = {
    "terminal", "code_execution", "file", "delegation", "cronjob", "shell", "ssh", "git",
}
FORBIDDEN_TOOLS = {
    "terminal", "process", "execute_code", "read_file", "write_file", "patch",
    "delegate_task", "cronjob", "shell", "shell_exec", "ssh", "git",
}


def verify(profile_home: str) -> dict:
    from hermes_cli.kanban_db import _resolve_worker_cli_toolsets
    from hermes_cli.plugins import discover_plugins, get_plugin_manager
    from model_tools import get_tool_definitions
    from toolsets import resolve_toolset
    from tools.registry import registry

    discover_plugins()
    manager = get_plugin_manager()
    resolved = _resolve_worker_cli_toolsets(profile_home) or []
    loaded = next((item for item in manager.list_plugins()
                   if item["key"] == "snapflow-neo-dev-transition"), None)
    if resolved != EXPECTED_RESOLVED_TOOLSETS:
        raise RuntimeError(f"unsafe dev worker toolsets: {resolved!r}")
    if FORBIDDEN_TOOLSETS.intersection(resolved):
        raise RuntimeError("execution-capable toolset resolved for dev worker")
    if loaded is None or not loaded["enabled"] or loaded["tools"] != 1:
        raise RuntimeError("native transition plugin tool is not loaded")
    previous = {key: os.environ.get(key) for key in (
        "HERMES_KANBAN_TASK", "HERMES_KANBAN_BOARD", "HERMES_SESSION_SOURCE",
    )}
    os.environ.update({
        "HERMES_KANBAN_TASK": "t_snapflow_runtime_verification",
        "HERMES_KANBAN_BOARD": "default",
        "HERMES_SESSION_SOURCE": "kanban",
    })
    try:
        definitions = get_tool_definitions(
            enabled_toolsets=resolved, quiet_mode=True, skip_tool_search_assembly=True,
        )
        expanded = {item["function"]["name"] for item in definitions}
        expected = set()
        for toolset in [*SAFE_TOOLSETS, "kanban"]:
            expected.update(resolve_toolset(toolset))
        if "snapflow_neo_dev_transition" not in expanded:
            raise RuntimeError("expanded worker definitions omit native transition tool")
        unexpected = expanded - expected
        if unexpected:
            raise RuntimeError(f"unexpected expanded worker tools: {sorted(unexpected)!r}")
        dangerous = expanded.intersection(FORBIDDEN_TOOLS)
        if dangerous:
            raise RuntimeError(f"dangerous expanded worker tools: {sorted(dangerous)!r}")
        probe = registry.dispatch("snapflow_neo_dev_transition", {
            "execution_id": str(uuid.uuid4()), "capability": "0" * 32,
            "decision": "block", "summary": "runtime contract verification",
        })
        if not isinstance(probe, str) or "missing positional" in probe.lower():
            raise RuntimeError("native transition handler contract dispatch failed")
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
    return {
        "resolved_worker_toolsets": resolved,
        "expanded_tools": sorted(expanded),
        "plugin_tool": "snapflow_neo_dev_transition",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("profile_home")
    print(json.dumps(verify(parser.parse_args().profile_home), sort_keys=True))

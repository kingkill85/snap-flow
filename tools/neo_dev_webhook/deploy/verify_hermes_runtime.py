#!/usr/bin/env python3
"""Fail closed unless a dispatched dev worker resolves only the narrow plugin."""
from __future__ import annotations

import argparse
import json

FORBIDDEN = {"terminal", "code_execution", "file", "shell", "ssh", "git"}


def verify(profile_home: str) -> dict:
    from hermes_cli.kanban_db import _resolve_worker_cli_toolsets
    from hermes_cli.plugins import _ensure_plugins_discovered, get_plugin_tool_names

    _ensure_plugins_discovered()
    resolved = _resolve_worker_cli_toolsets(profile_home) or []
    names = set(get_plugin_tool_names())
    if resolved != ["snapflow_neo_dev"]:
        raise RuntimeError(f"unsafe dev worker toolsets: {resolved!r}")
    if FORBIDDEN.intersection(resolved):
        raise RuntimeError("execution-capable toolset resolved for dev worker")
    if "snapflow_neo_dev_transition" not in names:
        raise RuntimeError("native transition plugin tool is not loaded")
    return {"resolved_worker_toolsets": resolved, "plugin_tool": "snapflow_neo_dev_transition"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("profile_home")
    print(json.dumps(verify(parser.parse_args().profile_home), sort_keys=True))

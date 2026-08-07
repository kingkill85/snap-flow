"""Hermes-native, non-executing SnapFlow lifecycle decision plugin."""
from __future__ import annotations

import os
import pathlib
import sys
import json
import uuid

SOURCE = pathlib.Path("/opt/data/services/snapflow-neo-dev-webhook/src")
if str(SOURCE) not in sys.path:
    sys.path.insert(0, str(SOURCE))

from neo_dev_webhook.hermes_transition import CapabilityBroker  # noqa: E402

TOOL_NAME = "snapflow_neo_dev_transition"
TOOLSET = "snapflow_neo_dev"
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": ["execution_id", "capability", "decision", "summary"],
    "properties": {
        "execution_id": {"type": "string", "format": "uuid"},
        "capability": {"type": "string", "minLength": 32, "maxLength": 256},
        "decision": {"type": "string", "enum": ["proceed", "block"]},
        "summary": {"type": "string", "minLength": 1, "maxLength": 1000},
    },
}


def transition_handler(args: dict, **_kwargs):
    if not os.environ.get("HERMES_KANBAN_TASK"):
        raise PermissionError("snapflow transition is restricted to a dispatched Kanban task")
    if not isinstance(args, dict) or set(args) != {
        "execution_id", "capability", "decision", "summary",
    }:
        raise ValueError("transition arguments must contain exactly the four schema fields")
    execution_id = args["execution_id"]
    capability = args["capability"]
    decision = args["decision"]
    summary = args["summary"]
    if any(not isinstance(value, str) for value in args.values()):
        raise ValueError("transition arguments must be strings")
    try:
        execution_id = str(uuid.UUID(execution_id))
    except (ValueError, AttributeError) as error:
        raise ValueError("execution_id must be a canonical UUID") from error
    if execution_id != args["execution_id"]:
        raise ValueError("execution_id must be a canonical UUID")
    if not 32 <= len(capability) <= 256:
        raise ValueError("capability length is invalid")
    if decision not in {"proceed", "block"}:
        raise ValueError("decision must be proceed or block")
    summary = summary.strip()
    if not summary or len(summary) > 1000:
        raise ValueError("summary must be non-empty and bounded")
    result = CapabilityBroker().submit(execution_id, capability, decision, summary)
    return json.dumps(result, sort_keys=True, separators=(",", ":"))


def register(ctx):
    ctx.register_tool(
        name=TOOL_NAME,
        toolset=TOOLSET,
        schema=SCHEMA,
        handler=transition_handler,
        description="Submit one bounded, one-use decision for the current SnapFlow wakeup.",
    )

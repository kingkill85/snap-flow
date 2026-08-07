"""Hermes-native, non-executing SnapFlow lifecycle decision plugin."""
from __future__ import annotations

import os
import pathlib
import sys

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


def transition_handler(execution_id: str, capability: str, decision: str, summary: str):
    if not os.environ.get("HERMES_KANBAN_TASK"):
        raise PermissionError("snapflow transition is restricted to a dispatched Kanban task")
    return CapabilityBroker().submit(execution_id, capability, decision, summary)


def register(ctx):
    ctx.register_tool(
        name=TOOL_NAME,
        toolset=TOOLSET,
        schema=SCHEMA,
        handler=transition_handler,
        description="Submit one bounded, one-use decision for the current SnapFlow wakeup.",
    )

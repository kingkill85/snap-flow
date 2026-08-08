from __future__ import annotations

import re
from dataclasses import dataclass


MAX_REQUEST_CHARS = 4000
FULL_SHA = r"[0-9a-f]{40}"
APPROVE_SPEC_PATTERN = re.compile(rf"^/approve-spec ({FULL_SHA})$")
ACCEPT_PATTERN = re.compile(rf"^/accept ({FULL_SHA})$")
REVISE_SPEC_PATTERN = re.compile(
    rf"^/revise-spec (?=\S)(?=.{{1,{MAX_REQUEST_CHARS}}}$).*\S$", re.DOTALL,
)
FIX_PATTERN = re.compile(
    rf"^/fix (?=\S)(?=.{{1,{MAX_REQUEST_CHARS}}}$).*\S$", re.DOTALL,
)


@dataclass(frozen=True)
class CommandDefinition:
    key: str
    form: str
    effect: str


COMMANDS = {
    "approve-spec": CommandDefinition(
        "approve-spec", "/approve-spec {sha}",
        "Approve this exact specification revision and begin implementation.",
    ),
    "accept": CommandDefinition(
        "accept", "/accept {sha}",
        "Accept this exact verified implementation revision; merge remains separate.",
    ),
    "merge": CommandDefinition(
        "merge", "/merge",
        "Authorize sync/archive first, then merge only after controller verification.",
    ),
    "fix": CommandDefinition(
        "fix", "/fix <bounded request>",
        f"Request a focused implementation correction (1–{MAX_REQUEST_CHARS} characters).",
    ),
    "revise-spec": CommandDefinition(
        "revise-spec", "/revise-spec <bounded request>",
        f"Request a focused specification revision (1–{MAX_REQUEST_CHARS} characters).",
    ),
    "cancel": CommandDefinition(
        "cancel", "/cancel",
        "Stop this governed workflow without merging, closing, or deleting its worktree.",
    ),
}

LEGAL_COMMANDS = {
    "specification_ready": ("approve-spec", "revise-spec", "cancel"),
    "implementation_verified": ("accept", "fix", "revise-spec", "cancel"),
    "accepted": ("merge", "fix", "revise-spec", "cancel"),
    "needs_input": ("revise-spec", "cancel"),
    "blocked": ("cancel",),
}


def classify_command(value: str) -> str | None:
    if APPROVE_SPEC_PATTERN.fullmatch(value):
        return "approve-spec"
    if ACCEPT_PATTERN.fullmatch(value):
        return "accept"
    if REVISE_SPEC_PATTERN.fullmatch(value):
        return "revise-spec"
    if FIX_PATTERN.fullmatch(value):
        return "fix"
    if value in {"/merge", "/cancel"}:
        return value[1:]
    return None


def render_available_commands(state: str, *, exact_sha: str | None = None) -> str:
    keys = LEGAL_COMMANDS.get(state)
    if keys is None:
        raise ValueError(f"no operator command policy for state {state}")
    if any("{sha}" in COMMANDS[key].form for key in keys):
        placeholder = exact_sha in {"<exact-full-spec-sha>", "<exact-full-implementation-sha>"}
        if exact_sha is None or (not placeholder and re.fullmatch(FULL_SHA, exact_sha) is None):
            raise ValueError("this operator state requires an exact full SHA")
    lines = ["## Available commands", ""]
    for key in keys:
        definition = COMMANDS[key]
        form = definition.form.format(sha=exact_sha)
        lines.append(f"- `{form}` — {definition.effect}")
    return "\n".join(lines)


def finalize_handoff(body: str, state: str, *, exact_sha: str | None = None) -> str:
    return f"{body.rstrip()}\n\n{render_available_commands(state, exact_sha=exact_sha)}"


def worker_handoff_contract(state: str) -> str:
    """Reusable prompt contract; the worker supplies the controller-verified exact SHA."""
    sha = {
        "specification_ready": "<exact-full-spec-sha>",
        "implementation_verified": "<exact-full-implementation-sha>",
    }.get(state)
    return (
        "End every Issue-facing gate or blocker handoff with this generated section in final "
        "position. Replace an exact-SHA placeholder only with the controller-verified full "
        "40-character SHA; include no other commands.\n\n"
        + render_available_commands(state, exact_sha=sha)
    )

from __future__ import annotations

import os
import pathlib
import re
import sys
from typing import Sequence

ALLOWED_PROGRAMS = {"git", "tmux", "ps", "gate"}
SAFE_ARG = re.compile(r"[A-Za-z0-9_@%+=:,./{}#()\[\]\t -]{1,4096}")
SETPRIV = "/usr/bin/setpriv"


def validated_worker_argv(argv: Sequence[str]) -> tuple[str, ...]:
    if os.geteuid() != 0:
        raise PermissionError("project worker boundary requires root")
    if not argv or argv[0] not in ALLOWED_PROGRAMS or len(argv) > 32:
        raise ValueError("project worker argv is not allowed")
    if any(not isinstance(arg, str) or SAFE_ARG.fullmatch(arg) is None for arg in argv):
        raise ValueError("project worker argv contains an unsafe argument")
    if argv[0] == "gate":
        return _validated_gate(argv)
    if argv[0] == "git" and any(
        arg == "-c" or arg.startswith("-c") or arg.startswith("--config-env")
        for arg in argv[1:]
    ):
        raise ValueError("project worker cannot override Git configuration")
    return (SETPRIV, "--reuid=dev", "--regid=dev", "--init-groups",
            "--no-new-privs", "--", *argv)


def _validated_gate(argv: Sequence[str]) -> tuple[str, ...]:
    from .deterministic_gates import REQUIRED_GATES
    if (len(argv) != 7 or argv[2] not in REQUIRED_GATES
            or re.fullmatch(r"/workspace/[A-Za-z0-9._-]+-issue-[1-9][0-9]*", argv[1]) is None
            or re.fullmatch(r"[0-9a-f]{40}", argv[3]) is None
            or re.fullmatch(r"[0-9a-f]{40}", argv[4]) is None
            or re.fullmatch(r"issue-[A-Za-z0-9._-]+", argv[5]) is None
            or re.fullmatch(r"(?:none|tools|backend|frontend)(?:,(?:tools|backend|frontend))*",
                            argv[6]) is None):
        raise ValueError("deterministic gate request is invalid")
    worktree, gate, approved, head, change, scope = argv[1:]
    return (SETPRIV, "--reuid=dev", "--regid=dev", "--init-groups",
            "--no-new-privs", "--", "python3", "-m",
            "neo_dev_webhook.gate_exec", worktree, gate, approved, head, change, scope)


def main(argv: Sequence[str] | None = None) -> int:
    try:
        command = validated_worker_argv(tuple(sys.argv[1:] if argv is None else argv))
        os.execv(command[0], list(command))
    except (OSError, ValueError, PermissionError):
        return 1
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

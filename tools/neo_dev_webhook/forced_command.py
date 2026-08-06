from __future__ import annotations

import os
import shlex
import subprocess
from typing import Sequence

from .project_control import validate_idempotency_key, validate_issue_number

PRIVILEGED_CONTROLLER = "/usr/local/sbin/neo-dev-project-control-privileged"
OPERATIONS = {"preflight", "start", "resume", "finalize"}


def validated_original_command(value: str) -> tuple[str, ...]:
    try:
        argv = shlex.split(value, posix=True)
    except ValueError as error:
        raise ValueError("invalid SSH original command") from error
    if len(argv) != 8 or argv[0] != "/usr/local/bin/neo-dev-project-control":
        raise ValueError("SSH key permits only the fixed project controller")
    operation, repo_flag, repository, issue_flag, issue, key_flag, key = argv[1:]
    if (operation not in OPERATIONS or repo_flag != "--repository"
            or repository != "kingkill85/snap-flow" or issue_flag != "--issue-number"
            or key_flag != "--idempotency-key" or not issue.isascii() or not issue.isdigit()):
        raise ValueError("SSH original command does not match the controller grammar")
    validate_issue_number(int(issue))
    validate_idempotency_key(key)
    return (PRIVILEGED_CONTROLLER, operation, repo_flag, repository, issue_flag, issue,
            key_flag, key)


def main(argv: Sequence[str] | None = None) -> int:
    if argv:
        return 2
    try:
        command = validated_original_command(os.environ.get("SSH_ORIGINAL_COMMAND", ""))
        result = subprocess.run(
            ("/usr/bin/sudo", "-n", *command), check=False, timeout=120, shell=False,
        )
    except (OSError, ValueError, subprocess.SubprocessError):
        return 1
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())

from __future__ import annotations

import os
import base64
import json
import shlex
import subprocess
from typing import Sequence

from .project_control import validate_idempotency_key, validate_issue_number

PRIVILEGED_CONTROLLER = "/usr/local/sbin/neo-dev-project-control-privileged"
OPERATIONS = {"status", "attest", "preflight", "start", "resume", "finalize"}


def validated_original_command(value: str) -> tuple[str, ...]:
    try:
        argv = shlex.split(value, posix=True)
    except ValueError as error:
        raise ValueError("invalid SSH original command") from error
    if len(argv) not in {8, 10} or argv[0] != "/usr/local/bin/neo-dev-project-control":
        raise ValueError("SSH key permits only the fixed project controller")
    operation, repo_flag, repository, issue_flag, issue, key_flag, key = argv[1:8]
    if (operation not in OPERATIONS or repo_flag != "--repository"
            or repository != "kingkill85/snap-flow" or issue_flag != "--issue-number"
            or key_flag != "--idempotency-key" or not issue.isascii() or not issue.isdigit()):
        raise ValueError("SSH original command does not match the controller grammar")
    validate_issue_number(int(issue))
    validate_idempotency_key(key)
    result = (PRIVILEGED_CONTROLLER, operation, repo_flag, repository, issue_flag, issue,
              key_flag, key)
    if len(argv) == 10:
        if argv[8] != "--evidence" or operation not in {"attest", "resume", "finalize"}:
            raise ValueError("evidence is accepted only for continuation/finalization")
        if len(argv[9]) > 65536:
            raise ValueError("evidence envelope is too large")
        try:
            document = json.loads(base64.b64decode(argv[9], validate=True))
        except (ValueError, json.JSONDecodeError) as error:
            raise ValueError("invalid evidence envelope") from error
        if not isinstance(document, dict):
            raise ValueError("invalid evidence envelope")
        result += ("--evidence", argv[9])
    return result


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

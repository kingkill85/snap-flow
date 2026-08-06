from __future__ import annotations

import argparse
import subprocess
from typing import Callable, Sequence

REMOTE_HOST = "192.168.178.4"
REMOTE_PORT = "2222"
REMOTE_USER = "dev"
IDENTITY_FILE = "/opt/data/credentials/snapflow-dev-client"
KNOWN_HOSTS_FILE = "/opt/data/tailscale_known_hosts"
REMOTE_CONTROLLER = "/usr/local/bin/neo-dev-project-control"


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(prog="neo-dev-project-control", allow_abbrev=False)
    result.add_argument("operation", choices=("preflight", "start", "resume", "finalize"))
    result.add_argument("--repository", required=True, choices=("kingkill85/snap-flow",))
    result.add_argument("--issue-number", required=True, type=int)
    result.add_argument("--idempotency-key", required=True)
    return result


def remote_argv(arguments: argparse.Namespace) -> tuple[str, ...]:
    from .project_control import validate_idempotency_key, validate_issue_number

    validate_issue_number(arguments.issue_number)
    validate_idempotency_key(arguments.idempotency_key)
    return (
        "/usr/bin/ssh", "-F", "/dev/null", "-T", "-p", REMOTE_PORT,
        "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes",
        "-o", "StrictHostKeyChecking=yes", "-o", f"UserKnownHostsFile={KNOWN_HOSTS_FILE}",
        "-o", "GlobalKnownHostsFile=/dev/null", "-o", "ProxyCommand=none",
        "-i", IDENTITY_FILE, f"{REMOTE_USER}@{REMOTE_HOST}", REMOTE_CONTROLLER,
        arguments.operation, "--repository", arguments.repository, "--issue-number",
        str(arguments.issue_number), "--idempotency-key", arguments.idempotency_key,
    )


def main(argv: Sequence[str] | None = None,
         run: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run) -> int:
    arguments = parser().parse_args(argv)
    try:
        command = remote_argv(arguments)
        result = run(command, check=False, timeout=90, shell=False)
    except (ValueError, OSError, subprocess.SubprocessError):
        return 1
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())

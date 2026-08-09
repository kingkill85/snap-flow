#!/usr/bin/env python3
"""Update the one permanent SnapFlow test stack to an exact commit image."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

STACK_DIR = Path("/mnt/marder/docker/dockge/stacks/snapflow-test")
COMPOSE_FILE = STACK_DIR / "compose.yaml"
ENV_FILE = STACK_DIR / ".env"
PREVIOUS_ENV_FILE = STACK_DIR / ".env.previous"
STACK_NAME = "snapflow-test"
VERSION_URL = "https://snapflow-test.kingkill.org/version"
FULL_SHA = re.compile(r"^[0-9a-f]{40}$")


def image_for_sha(sha: str) -> str:
    if not FULL_SHA.fullmatch(sha):
        raise ValueError("SHA must be exactly 40 lowercase hexadecimal characters")
    return f"ghcr.io/kingkill85/snap-flow:sha-{sha}"


def update_env(text: str, values: dict[str, str]) -> str:
    lines = text.splitlines()
    seen: set[str] = set()
    result: list[str] = []
    for line in lines:
        key = line.split("=", 1)[0] if "=" in line else ""
        if key in values:
            result.append(f"{key}={values[key]}")
            seen.add(key)
        else:
            result.append(line)
    for key, value in values.items():
        if key not in seen:
            result.append(f"{key}={value}")
    return "\n".join(result).rstrip() + "\n"


def write_atomic(path: Path, content: str) -> None:
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.close(fd)
        except OSError:
            pass
        Path(temporary).unlink(missing_ok=True)
        raise


def compose(*args: str) -> None:
    subprocess.run(
        ["docker", "compose", "-p", STACK_NAME, "-f", str(COMPOSE_FILE), *args],
        cwd=STACK_DIR,
        check=True,
    )


def running_sha(timeout: int = 180) -> str:
    deadline = time.monotonic() + timeout
    last_error = "not checked"
    while time.monotonic() < deadline:
        try:
            with urlopen(VERSION_URL, timeout=10) as response:
                payload = json.load(response)
            commit = payload.get("commit")
            if isinstance(commit, str):
                return commit
            last_error = "response has no commit"
        except Exception as error:
            last_error = str(error)
        time.sleep(3)
    raise RuntimeError(f"version verification timed out: {last_error}")


def deploy(sha: str) -> None:
    image = image_for_sha(sha)
    if not COMPOSE_FILE.is_file() or not ENV_FILE.is_file():
        raise RuntimeError(f"stack requires {COMPOSE_FILE} and {ENV_FILE}")

    old_env = ENV_FILE.read_text()
    if "JWT_SECRET=" not in old_env:
        raise RuntimeError("JWT_SECRET is missing from the stack .env")
    new_env = update_env(old_env, {"SNAPFLOW_IMAGE": image, "SNAPFLOW_SHA": sha})
    write_atomic(PREVIOUS_ENV_FILE, old_env)
    write_atomic(ENV_FILE, new_env)

    try:
        compose("pull", "snapflow")
        compose("up", "-d", "snapflow")
        observed = running_sha()
        if observed != sha:
            raise RuntimeError(f"requested {sha}, running {observed}")
    except Exception:
        write_atomic(ENV_FILE, old_env)
        compose("up", "-d", "snapflow")
        raise

    print(json.dumps({"stack": STACK_NAME, "requested_sha": sha, "running_sha": observed}))


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(f"usage: {argv[0]} <full-40-character-sha>", file=sys.stderr)
        return 2
    try:
        deploy(argv[1])
    except Exception as error:
        print(f"preview deployment failed: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

#!/usr/bin/env python3
import pathlib
import re
import sys


COMMAND = "exec python3 -m neo_dev_webhook.server --host 0.0.0.0 --port 8787"


def verify(text: str) -> None:
    services_match = re.search(r"(?ms)^services:\s*\n(.*?)(?=^[^\s#][^\n]*:\s*(?:#.*)?$|\Z)", text)
    if services_match is None:
        raise ValueError("live compose services block missing")
    services_text = services_match.group(1)
    services = re.findall(r"(?m)^  ([a-zA-Z0-9_-]+):\s*$", services_text)
    if services != ["receiver"]:
        raise ValueError("live compose must define exactly one receiver service")
    match = re.search(r"(?ms)^  receiver:\s*\n(.*)\Z", services_text)
    if match is None or COMMAND not in match.group(1):
        raise ValueError("live compose receiver command drift")
    receiver = match.group(1)
    for required in ("/mnt/marder/docker/hermes/data/services/"
                     "snapflow-neo-dev-webhook/src:/srv/webhook:ro",
                     "./passwd:/etc/passwd:ro", "./group:/etc/group:ro",
                     "env_file: ./webhook.env",
                     "NEO_DEV_TASK_RUNNER: /opt/data/scripts/neo-dev/task.py"):
        if required not in receiver:
            raise ValueError(f"live compose receiver contract drift: {required}")
    if re.search(
        r"(?m)^\s*-\s+/mnt/marder/docker/hermes/data:/opt/data\s*$", receiver
    ) is None:
        raise ValueError("live compose receiver requires writable exact /opt/data mount")
    for forbidden in ("/var/lib/neo-dev", "NEO_DEV_WEBHOOK_DB"):
        if forbidden in text:
            raise ValueError(f"retired queue contract remains: {forbidden}")


if __name__ == "__main__":
    verify(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))

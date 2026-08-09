#!/usr/bin/env python3
import pathlib
import re
import sys


COMMAND = "exec python3 -m neo_dev_webhook.server --host 0.0.0.0 --port 8787"


def verify(text: str) -> None:
    services = re.findall(r"(?m)^  ([a-zA-Z0-9_-]+):$", text)
    if services != ["receiver"]:
        raise ValueError("live compose must define exactly one receiver service")
    match = re.search(r"(?ms)^  receiver:\n(.*)\Z", text)
    if match is None or COMMAND not in match.group(1):
        raise ValueError("live compose receiver command drift")
    for required in ("/srv/webhook", "/opt/data", "/etc/passwd", "/etc/group",
                     "NEO_DEV_WEBHOOK_SECRET", "NEO_DEV_TASK_RUNNER"):
        if required not in match.group(1):
            raise ValueError(f"live compose receiver contract drift: {required}")
    for forbidden in ("consumer", "/var/lib/neo-dev", "NEO_DEV_WEBHOOK_DB"):
        if forbidden in text:
            raise ValueError(f"retired queue contract remains: {forbidden}")


if __name__ == "__main__":
    verify(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))

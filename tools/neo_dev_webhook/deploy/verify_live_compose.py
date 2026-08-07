#!/usr/bin/env python3
import pathlib
import re
import sys


EXPECTED = {
    "receiver": "exec python3 -m neo_dev_webhook.server --host 0.0.0.0 --port 8787",
    "consumer": "exec python3 -m neo_dev_webhook.consumer /var/lib/neo-dev/neo-dev.sqlite --max-runtime 2h --max-attempts 5",
}


def verify(text: str) -> None:
    for service, command in EXPECTED.items():
        match = re.search(rf"(?ms)^  {service}:\n(.*?)(?=^  [a-zA-Z0-9_-]+:\n|\Z)", text)
        if match is None or command not in match.group(1):
            raise ValueError(f"live compose {service} command drift")
        for required in ("/srv/webhook", "/var/lib/neo-dev", "/opt/data"):
            if required not in match.group(1):
                raise ValueError(f"live compose {service} mount drift: {required}")
    if "/var/lib/neo-dev/webhook/work.sqlite3" in text:
        raise ValueError("queue database drift")


if __name__ == "__main__":
    verify(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))

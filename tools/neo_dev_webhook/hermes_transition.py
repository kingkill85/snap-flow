from __future__ import annotations

import argparse
import json
import os
import pathlib
import secrets
import tempfile
import time


class CapabilityBroker:
    def __init__(self, root: pathlib.Path = pathlib.Path("/opt/data/state/snapflow-neo-dev/capabilities")):
        self.root = root

    def issue(self, workflow_id: str, execution_id: str, issue_number: int, phase: str,
              current_wakeup: dict | None = None) -> str:
        token = secrets.token_urlsafe(32)
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        record = {"workflow_id": workflow_id, "execution_id": execution_id,
                  "issue_number": issue_number, "phase": phase, "token": token,
                  "expires_at": time.time() + 7200, "used": False,
                  "current_wakeup": current_wakeup}
        path = self.root / f"{execution_id}.json"
        with tempfile.NamedTemporaryFile("w", dir=self.root, delete=False) as handle:
            json.dump(record, handle, sort_keys=True, separators=(",", ":")); handle.write("\n")
            temporary = pathlib.Path(handle.name)
        os.chmod(temporary, 0o600); os.replace(temporary, path)
        return token

    def submit(self, execution_id: str, token: str, decision: str, summary: str) -> dict:
        if decision not in {"proceed", "block"} or not summary or len(summary) > 1000:
            raise ValueError("invalid bounded phase decision")
        path = self.root / f"{execution_id}.json"
        record = json.loads(path.read_text())
        if (record.get("token") != token or record.get("used") is not False
                or record.get("expires_at", 0) < time.time()):
            raise ValueError("invalid, expired, or consumed phase capability")
        record.update({"used": True, "decision": decision, "summary": summary,
                       "decided_at": time.time(), "processed": False})
        path.write_text(json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n")
        os.chmod(path, 0o600)
        return {key: record[key] for key in ("workflow_id", "execution_id", "issue_number",
                                              "phase", "decision", "summary")}

    def claim_decision(self) -> tuple[pathlib.Path, dict] | None:
        if not self.root.exists():
            return None
        for path in sorted(self.root.glob("*.json")):
            record = json.loads(path.read_text())
            if record.get("used") is True and record.get("processed") is False:
                return path, record
        return None

    @staticmethod
    def finish_decision(path: pathlib.Path, record: dict) -> None:
        record["processed"] = True
        path.write_text(json.dumps(record, sort_keys=True, separators=(",", ":")) + "\n")
        os.chmod(path, 0o600)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(allow_abbrev=False)
    parser.add_argument("--execution-id", required=True)
    parser.add_argument("--capability", required=True)
    parser.add_argument("--decision", required=True, choices=("proceed", "block"))
    parser.add_argument("--summary", required=True)
    args = parser.parse_args(argv)
    try:
        result = CapabilityBroker().submit(args.execution_id, args.capability,
                                           args.decision, args.summary)
    except (OSError, ValueError, json.JSONDecodeError):
        return 1
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

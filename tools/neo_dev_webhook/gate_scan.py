from __future__ import annotations

import json
import pathlib
import re
import subprocess

SECRET = re.compile(rb"(?i)(api[_-]?key|client[_-]?secret|private[_-]?key|password)\s*[:=]\s*['\"]?[^\s'\"]{8,}")
PRIVATE_PATH = re.compile(r"(^|/)(\.env($|\.)|id_(rsa|ed25519)|credentials?|secrets?)(/|$)", re.I)


def reviewed_paths(approved: str) -> list[str]:
    tracked = subprocess.run(
        ["git", "diff", "--name-only", approved, "HEAD"], check=True,
        capture_output=True, text=True, timeout=30,
    ).stdout.splitlines()
    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"], check=True,
        capture_output=True, text=True, timeout=30,
    ).stdout.splitlines()
    return sorted(set(tracked + untracked))


def scan_paths(mode: str, paths: list[str]) -> dict:
    if mode == "private":
        hits = [path for path in paths if PRIVATE_PATH.search(path)]
        if hits:
            raise RuntimeError("private paths detected: " + ", ".join(hits[:10]))
        return {"reviewed_paths": len(paths), "private_paths": 0}
    if mode == "secret":
        hits = []
        root = pathlib.Path.cwd().resolve()
        for relative in paths:
            path = (root / relative).resolve()
            if root not in path.parents or not path.is_file() or path.stat().st_size > 5_000_000:
                continue
            if SECRET.search(path.read_bytes()):
                hits.append(relative)
        if hits:
            raise RuntimeError("possible secrets detected: " + ", ".join(hits[:10]))
        return {"reviewed_paths": len(paths), "secret_matches": 0}
    if mode == "ui":
        frontend = [path for path in paths if path.startswith("frontend/")]
        if not frontend:
            return {"required": False, "reason": "no frontend paths changed", "screenshots": []}
        screenshots = [path for path in paths if path.lower().endswith((".png", ".webp"))]
        evidence = [path for path in paths if "playwright" in path.lower() and path.endswith(".md")]
        if not screenshots or not evidence:
            raise RuntimeError("frontend change requires Playwright evidence and screenshots")
        return {"required": True, "browser": "playwright", "screenshots": screenshots}
    raise ValueError("unknown scan mode")


def scan(mode: str, approved: str) -> dict:
    return scan_paths(mode, reviewed_paths(approved))


def main(argv=None) -> int:
    import sys
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2 or args[0] not in {"secret", "private", "ui"} or not re.fullmatch(r"[0-9a-f]{40}", args[1]):
        return 2
    try:
        print(json.dumps(scan(args[0], args[1]), sort_keys=True))
    except (OSError, RuntimeError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

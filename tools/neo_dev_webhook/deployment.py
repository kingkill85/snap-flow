from __future__ import annotations

import base64
import pathlib


def validate_pinned_host(path: pathlib.Path, host: str, port: int) -> str:
    """Return the sole pre-trusted key; never discovers or replaces trust."""
    marker = f"[{host}]:{port}"
    matches = []
    for line in path.read_text(encoding="utf-8").splitlines():
        fields = line.split()
        if fields and fields[0] == marker:
            if len(fields) != 3 or fields[1] not in {
                "ssh-ed25519", "ecdsa-sha2-nistp256", "ssh-rsa",
            }:
                raise ValueError("pinned host entry has invalid grammar")
            try:
                base64.b64decode(fields[2], validate=True)
            except ValueError as error:
                raise ValueError("pinned host key is not valid base64") from error
            matches.append(line)
    if len(matches) != 1:
        raise ValueError("exactly one operator-trusted endpoint key is required")
    return matches[0]

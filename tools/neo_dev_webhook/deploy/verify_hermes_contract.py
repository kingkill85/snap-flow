#!/usr/bin/env python3
"""Read-only verification of the pinned Hermes Kanban host contract."""

import argparse
import importlib
import json
import pathlib
import re
import sqlite3
import subprocess
import sys

DEFAULT_CONTRACT = pathlib.Path(__file__).with_name("hermes-contract.v0.20.0.json")


def load_contract(path=DEFAULT_CONTRACT):
    with pathlib.Path(path).open(encoding="utf-8") as source:
        return json.load(source)


def run_text(command):
    return subprocess.run(command, check=True, capture_output=True, text=True,
                          timeout=15).stdout


def long_options(help_text):
    """Extract declared long options while ignoring prose in descriptions."""
    return set(re.findall(
        r"(?m)^\s*(?:-[A-Za-z0-9?],\s*)?(--[a-z][a-z0-9-]*)(?=[\s=,\[])",
        help_text,
    ))


def require_exact_options(help_text, expected, command):
    actual = long_options(help_text)
    expected = set(expected)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise RuntimeError(f"{command} help option drift: missing={missing}, extra={extra}")


def verify(contract, run=run_text, import_module=importlib.import_module,
           sqlite_connect=None, is_file=lambda path: path.is_file()):
    root = pathlib.Path(contract["install_root"])
    binary = pathlib.Path(contract["binary"])
    if root != pathlib.Path("/opt/hermes") or binary != root / ".venv/bin/hermes":
        raise RuntimeError("pinned Hermes install paths are invalid")
    if not is_file(binary):
        raise RuntimeError(f"Hermes binary is absent: {binary}")
    version_lines = [line.strip() for line in run([str(binary), "--version"]).splitlines()
                     if line.strip()]
    if not version_lines or version_lines[0] != contract["version_output"]:
        actual = version_lines[0] if version_lines else ""
        raise RuntimeError(f"Hermes version mismatch: {actual!r}")
    install_line = f"Install directory: {root}"
    if install_line not in version_lines:
        raise RuntimeError(f"Hermes install directory mismatch: expected {install_line!r}")
    version = version_lines[0]
    prefix = [str(binary), "kanban", "--board", contract["board"]]
    require_exact_options(run([*prefix, "create", "--help"]),
                          contract["create_options"], "kanban create")
    require_exact_options(run([*prefix, "dispatch", "--help"]),
                          contract["dispatch_options"], "kanban dispatch")

    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    kb = import_module("hermes_cli.kanban_db")
    database = pathlib.Path(kb.kanban_db_path(board=contract["board"]))
    if not is_file(database):
        raise RuntimeError(f"private-dev Kanban database is absent: {database}")
    connect = sqlite_connect or kb.sqlite3.connect
    connection = connect(f"file:{database}?mode=ro", uri=True)
    try:
        connection.row_factory = sqlite3.Row
        table_keys = ("cid", "name", "type", "notnull", "dflt_value", "pk")
        columns = [
            {key: row[key] for key in table_keys}
            for row in connection.execute("PRAGMA table_info(tasks)")
        ]
        if columns != contract["task_table_info"]:
            raise RuntimeError("tasks table schema drifted")
        indexes = {row["name"]: row for row in connection.execute("PRAGMA index_list(tasks)")}
        expected_index = contract["idempotency_index"]
        index = indexes.get(expected_index["name"])
        index_keys = ("unique", "origin", "partial")
        if index is None or any(index[key] != expected_index[key] for key in index_keys):
            raise RuntimeError("idempotency index missing or definition drifted")
        info_keys = ("seqno", "cid", "name")
        index_info = [
            {key: row[key] for key in info_keys}
            for row in connection.execute(
            f"PRAGMA index_info({expected_index['name']})"
            )
        ]
        if index_info != expected_index["index_info"]:
            raise RuntimeError("idempotency index info drifted")
        probe = connection.execute("SELECT 1 AS contract_probe").fetchone()
        if probe["contract_probe"] != 1:
            raise RuntimeError("SQLite rows do not support named lookup")
    finally:
        connection.close()
    return {"version": version, "board": contract["board"], "database": str(database)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--contract", type=pathlib.Path, default=DEFAULT_CONTRACT)
    args = parser.parse_args()
    try:
        result = verify(load_contract(args.contract))
    except Exception as error:
        print(f"Hermes contract verification failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Fail-closed pre-archive check for synchronized OpenSpec delta requirements."""
import argparse
import json
import os
import pathlib
import re
import subprocess
import sys

OPERATIONS = ("ADDED", "MODIFIED", "REMOVED", "RENAMED")
LEVEL2_HEADING_RE = re.compile(r"^[ ]{0,3}##(?!#)[ \t]*(.*?)\s*$", re.MULTILINE)
NO_SPACE_LEVEL2_RE = re.compile(r"^[ ]{0,3}##(?=[^# \t\r\n])", re.MULTILINE)
REQ_RE = re.compile(
    r"^### Requirement: (.+?)\s*$\n(.*?)(?=^### Requirement: |\Z)",
    re.MULTILINE | re.DOTALL,
)
RENAME_RE = re.compile(r"^- FROM: `(.+?)`\s*$\n^- TO: `(.+?)`\s*$", re.MULTILINE)


def normalized_name(value: str) -> str:
    return " ".join(value.split()).casefold()


def requirement_entries(text: str):
    return [(m.group(1).strip(), m.group(2).rstrip()) for m in REQ_RE.finditer(text)]


def requirement_blocks(text: str):
    return {name: body for name, body in requirement_entries(text)}


def main_requirement_blocks(text: str):
    blocks = {}
    seen = {}
    duplicates = []
    for name, body in requirement_entries(text):
        key = normalized_name(name)
        if key in seen:
            duplicates.append((seen[key], name))
        else:
            seen[key] = name
            blocks[name] = body
    return blocks, duplicates


def operation_sections(text: str, operation: str):
    return re.findall(
        rf"^[ ]{{0,3}}##[ \t]+{operation} Requirements\s*$\n(.*?)(?=^[ ]{{0,3}}##(?!#)|\Z)",
        text,
        re.MULTILINE | re.DOTALL,
    )


def no_delta_is_validated_skipped(root: pathlib.Path, change: str):
    env = os.environ.copy()
    env["OPENSPEC_TELEMETRY"] = "0"
    try:
        result = subprocess.run(
            ["npm", "exec", "--", "openspec", "status", "--change", change, "--json"],
            cwd=root,
            env=env,
            text=True,
            capture_output=True,
            timeout=30,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return False, f"cannot obtain OpenSpec status: {exc}"
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        return False, f"OpenSpec status failed: {detail or result.returncode}"
    try:
        status = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        return False, f"OpenSpec status returned invalid JSON: {exc}"
    artifacts = status.get("artifacts")
    artifact_paths = status.get("artifactPaths")
    if not isinstance(artifacts, list) or not isinstance(artifact_paths, dict):
        return False, "OpenSpec status JSON is missing artifacts/artifactPaths"
    specs = [item for item in artifacts if isinstance(item, dict) and item.get("id") == "specs"]
    path_info = artifact_paths.get("specs")
    existing = path_info.get("existingOutputPaths") if isinstance(path_info, dict) else None
    if len(specs) != 1 or specs[0].get("status") != "skipped" or existing != []:
        return False, "no-delta archive requires status artifact specs=skipped and no existing spec paths"
    return True, ""


def validate_delta_headings(rel: pathlib.Path, text: str):
    errors = []
    matches = list(LEVEL2_HEADING_RE.finditer(text))
    headings = [match.group(1) for match in matches]
    if not matches:
        return [f"{rel}: no level-2 delta headings"]
    if text[:matches[0].start()].strip():
        errors.append(f"{rel}: content exists outside an allowed level-2 section")
    if NO_SPACE_LEVEL2_RE.search(text):
        errors.append(f"{rel}: level-2 headings require whitespace after ##")
    allowed = {"Purpose", *(f"{op} Requirements" for op in OPERATIONS)}
    for heading in headings:
        if heading not in allowed:
            errors.append(f"{rel}: unknown or malformed level-2 heading '## {heading}'")
    if headings.count("Purpose") > 1:
        errors.append(f"{rel}: duplicate Purpose sections")
    for index, match in enumerate(matches):
        if match.group(1) != "Purpose":
            continue
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        purpose_body = text[match.end():end]
        if re.search(r"^###|^- (?:FROM|TO):", purpose_body, re.MULTILINE):
            errors.append(f"{rel}: requirement-like content is not allowed in Purpose")
    for operation in OPERATIONS:
        count = headings.count(f"{operation} Requirements")
        if count > 1:
            errors.append(f"{rel}: duplicate {operation} Requirements sections")
    if not any(f"{op} Requirements" in headings for op in OPERATIONS):
        errors.append(f"{rel}: no recognized delta operation sections")
    return errors


def check(root: pathlib.Path, change: str):
    delta_root = root / "openspec" / "changes" / change / "specs"
    malformed = []
    unsynced = []
    delta_files = sorted(delta_root.rglob("spec.md")) if delta_root.exists() else []

    if not delta_files:
        valid, reason = no_delta_is_validated_skipped(root, change)
        if valid:
            print("archive guard passed: OpenSpec status validates a skipped no-delta change")
            return 0
        print("archive blocked: change has no delta specs and is not validated as skipped", file=sys.stderr)
        print(reason, file=sys.stderr)
        return 1

    for delta_file in delta_files:
        text = delta_file.read_text()
        rel = delta_file.relative_to(root)
        malformed.extend(validate_delta_headings(rel, text))

        capability = delta_file.parent.relative_to(delta_root)
        main_file = root / "openspec" / "specs" / capability / "spec.md"
        main_text = main_file.read_text() if main_file.exists() else ""
        main_blocks, duplicates = main_requirement_blocks(main_text)
        for first, duplicate in duplicates:
            malformed.append(
                f"{main_file.relative_to(root)}: duplicate normalized requirement '{first}' / '{duplicate}'"
            )

        seen_delta_names = {}
        operation_count = 0
        for operation in OPERATIONS:
            sections = operation_sections(text, operation)
            operation_count += len(sections)
            for section in sections:
                if operation == "RENAMED":
                    pairs = RENAME_RE.findall(section)
                    if not pairs:
                        malformed.append(f"{rel}: RENAMED section has no valid FROM/TO pair")
                    residue = RENAME_RE.sub("", section).strip()
                    if residue:
                        malformed.append(f"{rel}: malformed RENAMED section content")
                    for old, new in pairs:
                        for name in (old.strip(), new.strip()):
                            key = normalized_name(name)
                            if key in seen_delta_names:
                                malformed.append(
                                    f"{rel}: duplicate requirement heading across operations: '{name}'"
                                )
                            else:
                                seen_delta_names[key] = operation
                        if old.strip() in main_blocks or new.strip() not in main_blocks:
                            unsynced.append(f"{rel}: rename {old.strip()} -> {new.strip()}")
                    continue

                entries = requirement_entries(section)
                if not entries:
                    malformed.append(f"{rel}: {operation} section has no valid requirements")
                residue = REQ_RE.sub("", section).strip()
                if residue:
                    malformed.append(f"{rel}: malformed {operation} section content")
                for name, body in entries:
                    key = normalized_name(name)
                    if key in seen_delta_names:
                        malformed.append(
                            f"{rel}: duplicate requirement heading across operations: '{name}'"
                        )
                    else:
                        seen_delta_names[key] = operation
                    if operation in {"ADDED", "MODIFIED"}:
                        if main_blocks.get(name, "").strip() != body.strip():
                            unsynced.append(f"{rel}: {operation} {name}")
                    elif operation == "REMOVED" and name in main_blocks:
                        unsynced.append(f"{rel}: REMOVED {name} still present")

        if operation_count == 0:
            malformed.append(f"{rel}: no recognized delta operation sections")

    if malformed:
        print("archive blocked: malformed delta/main specs", file=sys.stderr)
        for item in malformed:
            print(item, file=sys.stderr)
        return 1
    if unsynced:
        print("archive blocked: unsynced delta specs", file=sys.stderr)
        for item in unsynced:
            print(item, file=sys.stderr)
        return 1
    print("archive guard passed: delta specs are synced")
    return 0


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("change")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    raise SystemExit(check(pathlib.Path(args.root).resolve(), args.change))


if __name__ == "__main__":
    main()

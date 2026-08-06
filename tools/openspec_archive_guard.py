#!/usr/bin/env python3
"""Fail-closed pre-archive check for synchronized OpenSpec delta requirements."""
import argparse
import pathlib
import re
import sys

OPERATIONS = {"ADDED", "MODIFIED", "REMOVED", "RENAMED"}
OPERATION_HEADING_RE = re.compile(r"^## ([A-Z]+) Requirements\s*$", re.M)
REQUIREMENT_BLOCK_RE = re.compile(
    r"^### Requirement: [^\n]+(?:\n.*?)*(?=^### Requirement: |^## |\Z)",
    re.M | re.S,
)
RENAME_PAIR_RE = re.compile(
    r"^-?\s*FROM:\s*`?(?:### Requirement:\s*)?([^`\n]+?)`?\s*$\s*"
    r"^-?\s*TO:\s*`?(?:### Requirement:\s*)?([^`\n]+?)`?\s*$",
    re.M,
)


def normalize_block(block):
    return "\n".join(line.rstrip() for line in block.strip().splitlines())


def requirement_block_list(text):
    return [normalize_block(match.group(0)) for match in REQUIREMENT_BLOCK_RE.finditer(text)]


def requirement_blocks(text):
    blocks = requirement_block_list(text.replace("\r\n", "\n"))
    return {block.splitlines()[0]: block for block in blocks}


def operation_sections(text, operation):
    return re.findall(
        rf"^## {operation} Requirements\s*(.*?)(?=^## |\Z)",
        text,
        re.M | re.S,
    )


def parse_delta(text, relative):
    text = text.replace("\r\n", "\n")
    errors = []
    headings = OPERATION_HEADING_RE.findall(text)
    unknown = sorted(set(headings) - OPERATIONS)
    if unknown:
        errors.append(f"{relative}: unknown operation heading(s): {', '.join(unknown)}")
    if not any(operation in headings for operation in OPERATIONS):
        errors.append(f"{relative}: no recognized delta operation")

    parsed = {operation: [] for operation in OPERATIONS}
    for operation in ("ADDED", "MODIFIED", "REMOVED"):
        for section in operation_sections(text, operation):
            if not section.strip():
                errors.append(f"{relative}: empty {operation} section")
                continue
            matches = list(REQUIREMENT_BLOCK_RE.finditer(section))
            residue = REQUIREMENT_BLOCK_RE.sub("", section).strip()
            blocks = [normalize_block(match.group(0)) for match in matches]
            headings_in_section = re.findall(r"^### Requirement:", section, re.M)
            if not blocks or residue or len(blocks) != len(headings_in_section):
                errors.append(f"{relative}: malformed {operation} requirement content")
                continue
            names = [block.splitlines()[0] for block in blocks]
            if len(set(names)) != len(names):
                errors.append(f"{relative}: duplicate {operation} requirement heading")
                continue
            parsed[operation].extend(blocks)

    for section in operation_sections(text, "RENAMED"):
        if not section.strip():
            errors.append(f"{relative}: empty RENAMED section")
            continue
        pairs = [(old.strip(), new.strip()) for old, new in RENAME_PAIR_RE.findall(section)]
        residue = RENAME_PAIR_RE.sub("", section).strip()
        if not pairs or residue:
            errors.append(f"{relative}: malformed RENAMED requirement content")
            continue
        parsed["RENAMED"].extend(pairs)
    return parsed, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("change")
    parser.add_argument("--root", default=".")
    parser.add_argument(
        "--allow-no-delta",
        action="store_true",
        help="allow a missing/empty specs directory only after OpenSpec reports specs skipped",
    )
    args = parser.parse_args()
    root = pathlib.Path(args.root).resolve()
    spec_root = root / "openspec/changes" / args.change / "specs"
    delta_files = sorted(spec_root.rglob("spec.md")) if spec_root.is_dir() else []
    if not delta_files:
        if args.allow_no_delta:
            print("archive guard passed: OpenSpec reports no delta specs")
            return 0
        parser.error("change delta specs not found; use --allow-no-delta only for a validated skipped specs artifact")

    unsynced = []
    malformed = []
    for delta in delta_files:
        relative = delta.relative_to(spec_root)
        main_spec = root / "openspec/specs" / relative
        main_text = main_spec.read_text(encoding="utf-8") if main_spec.exists() else ""
        main_requirements = requirement_blocks(main_text)
        parsed, errors = parse_delta(delta.read_text(encoding="utf-8"), relative)
        malformed.extend(errors)

        for block in parsed["ADDED"] + parsed["MODIFIED"]:
            heading = block.splitlines()[0]
            if main_requirements.get(heading) != block:
                unsynced.append(f"{relative}: {heading}")
        for block in parsed["REMOVED"]:
            heading = block.splitlines()[0]
            if heading in main_requirements:
                unsynced.append(f"{relative}: still present {heading}")
        for old, new in parsed["RENAMED"]:
            old_heading = f"### Requirement: {old}"
            new_heading = f"### Requirement: {new}"
            if old_heading in main_requirements or new_heading not in main_requirements:
                unsynced.append(f"{relative}: rename {old_heading} -> {new_heading}")

    if malformed:
        print("archive blocked: malformed delta specs\n" + "\n".join(malformed), file=sys.stderr)
        return 1
    if unsynced:
        print("archive blocked: unsynced delta specs\n" + "\n".join(unsynced), file=sys.stderr)
        return 1
    print("archive guard passed: delta specs are synced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

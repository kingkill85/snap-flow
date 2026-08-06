#!/usr/bin/env python3
"""Hard pre-archive check: every delta requirement must already exist in main specs."""
import argparse
import pathlib
import re
import sys


def requirement_blocks(text):
    blocks = re.findall(
        r"^### Requirement: [^\n]+(?:\n.*?)*(?=^### Requirement: |^## |\Z)",
        text.replace("\r\n", "\n"), re.M | re.S,
    )
    return {normalize_block(block).splitlines()[0]: normalize_block(block) for block in blocks}


def normalize_block(block):
    return "\n".join(line.rstrip() for line in block.strip().splitlines())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("change")
    parser.add_argument("--root", default=".")
    args = parser.parse_args()
    root = pathlib.Path(args.root).resolve()
    spec_root = root / "openspec/changes" / args.change / "specs"
    if not spec_root.is_dir():
        parser.error("change delta specs not found")
    unsynced = []
    for delta in spec_root.rglob("spec.md"):
        relative = delta.relative_to(spec_root)
        main_spec = root / "openspec/specs" / relative
        main_text = main_spec.read_text(encoding="utf-8") if main_spec.exists() else ""
        delta_text = delta.read_text(encoding="utf-8")
        main_requirements = requirement_blocks(main_text)
        added_or_modified = re.findall(
            r"^## (?:ADDED|MODIFIED) Requirements\s*(.*?)(?=^## |\Z)",
            delta_text, re.M | re.S,
        )
        for heading, block in requirement_blocks("\n".join(added_or_modified)).items():
            if main_requirements.get(heading) != block:
                unsynced.append(f"{relative}: {heading}")
        removed = re.findall(
            r"^## REMOVED Requirements\s*(.*?)(?=^## |\Z)", delta_text, re.M | re.S
        )
        for heading in requirement_blocks("\n".join(removed)):
            if heading in main_requirements:
                unsynced.append(f"{relative}: still present {heading}")
        renamed_sections = re.findall(
            r"^## RENAMED Requirements\s*(.*?)(?=^## |\Z)", delta_text, re.M | re.S
        )
        renamed = re.findall(
            r"^-?\s*FROM:\s*`?(?:### Requirement:\s*)?([^`\n]+?)`?\s*$\s*"
            r"^-?\s*TO:\s*`?(?:### Requirement:\s*)?([^`\n]+?)`?\s*$",
            "\n".join(renamed_sections), re.M,
        )
        for old, new in renamed:
            old_heading = f"### Requirement: {old.strip()}"
            new_heading = f"### Requirement: {new.strip()}"
            if old_heading in main_requirements or new_heading not in main_requirements:
                unsynced.append(f"{relative}: rename {old_heading} -> {new_heading}")
    if unsynced:
        print("archive blocked: unsynced delta specs\n" + "\n".join(unsynced), file=sys.stderr)
        return 1
    print("archive guard passed: delta specs are synced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

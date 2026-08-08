from __future__ import annotations

import re
import argparse
from pathlib import Path


SCENARIO = re.compile(r"^#### Scenario:\s*(.+?)\s*$", re.MULTILINE)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def validate_mapping(specs: dict[str, str], mappings: dict[str, list[str]]) -> dict:
    required = {
        f"{path}#{slugify(title)}"
        for path, content in specs.items()
        for title in SCENARIO.findall(content)
    }
    mapped = {reference for references in mappings.values() for reference in references}
    unknown = mapped - required
    missing = required - mapped
    if unknown:
        raise ValueError(f"unknown OpenSpec scenario mappings: {sorted(unknown)}")
    if missing:
        raise ValueError(f"missing OpenSpec scenario mappings: {sorted(missing)}")
    return {"status": "passed", "required": len(required), "mapped": len(mapped)}


REFERENCE = re.compile(r"^\s*#\s*openspec-scenario:\s*(\S+)\s*$", re.MULTILINE)


def validate_feature_references(specs: dict[str, str], mappings: dict[str, list[str]],
                                require_all: bool = False) -> dict:
    known = {
        f"{path}#{slugify(title)}"
        for path, content in specs.items()
        for title in SCENARIO.findall(content)
    }
    mapped = {item for values in mappings.values() for item in values}
    unknown = mapped - known
    if unknown:
        raise ValueError(f"unknown OpenSpec scenario mappings: {sorted(unknown)}")
    if require_all and known - mapped:
        raise ValueError(f"missing OpenSpec scenario mappings: {sorted(known - mapped)}")
    return {"status": "passed", "required": len(known) if require_all else len(mapped),
            "mapped": len(mapped)}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", required=True)
    parser.add_argument("--change")
    parser.add_argument("--require-all-active", action="store_true")
    args = parser.parse_args()
    root = Path.cwd()
    change_pattern = args.change if args.change else "issue-*"
    specs = {str(path.relative_to(root)): path.read_text()
             for path in root.glob(f"openspec/changes/{change_pattern}/specs/**/*.md")}
    if args.change and not specs:
        raise ValueError(f"no OpenSpec delta specs found for {args.change}")
    features = {str(path.resolve().relative_to(root)): REFERENCE.findall(path.read_text())
                for path in Path(args.features).glob("**/*.feature")}
    result = validate_feature_references(specs, features, args.require_all_active)
    print(f"OpenSpec scenario traceability: {result['mapped']}/{result['required']} mapped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

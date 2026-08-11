from __future__ import annotations

import re
import argparse
from pathlib import Path


SCENARIO = re.compile(r"^#### Scenario:\s*(.+?)\s*$", re.MULTILINE)
MATRIX_SHA = re.compile(r"^Approved source SHA:\s*`([0-9a-f]{40})`\s*$", re.MULTILINE)
MATRIX_COUNT = re.compile(r"^Approved scenario count:\s*\*\*(\d+)\*\*\s*$", re.MULTILINE)
EVIDENCE_LAYERS = {"backend", "frontend", "cucumber", "reviewed assertion"}


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
SPEC_STEP = re.compile(r"^\s*-\s*\*\*(GIVEN|WHEN|THEN|AND|BUT)\*\*\s+(.+?)\s*$",
                       re.IGNORECASE)
FEATURE_STEP = re.compile(r"^\s*(Given|When|Then|And|But)\s+(.+?)\s*$", re.IGNORECASE)
FEATURE_SCENARIO = re.compile(r"^\s*Scenario(?: Outline)?:\s*(.+?)\s*$", re.IGNORECASE)
FEATURE_BACKGROUND = re.compile(r"^\s*Background:\s*(.*?)\s*$", re.IGNORECASE)
TAG_LINE = re.compile(r"^\s*(@\S+(?:\s+@\S+)*)\s*$")
FEATURE_EXAMPLES = re.compile(r"^\s*Examples(?:\s*:[^\r\n]*)?$", re.IGNORECASE)
FEATURE_DATA_TABLE = re.compile(r"^\s*\|.*\|\s*$")
FEATURE_DOC_STRING = re.compile(r'^\s*(?:"""|```)')


def _normalize_step(keyword: str, text: str) -> tuple[str, str]:
    normalized = re.sub(r"\s+", " ", text.strip()).casefold()
    return keyword.upper(), normalized


def _spec_scenarios(specs: dict[str, str]) -> dict[str, list[tuple[str, str]]]:
    parsed: dict[str, list[tuple[str, str]]] = {}
    for path, content in specs.items():
        current = None
        for line in content.splitlines():
            heading = re.match(r"^#### Scenario:\s*(.+?)\s*$", line)
            if heading:
                current = f"{path}#{slugify(heading.group(1))}"
                if current in parsed:
                    raise ValueError(f"duplicate OpenSpec scenario reference: {current}")
                parsed[current] = []
                continue
            step = SPEC_STEP.match(line)
            if step and current is not None:
                parsed[current].append(_normalize_step(*step.groups()))
    if any(not steps for steps in parsed.values()):
        raise ValueError("OpenSpec scenario has no Given/When/Then steps")
    return parsed


def _feature_scenarios(features: dict[str, str]) -> dict[str, list[list[tuple[str, str]]]]:
    result: dict[str, list[list[tuple[str, str]]]] = {}
    for path, content in features.items():
        lines = content.splitlines()
        nonempty = [(index, line.strip()) for index, line in enumerate(lines) if line.strip()]
        tag_lines = [(index, match.group(1).split()) for index, line in enumerate(lines)
                     if (match := TAG_LINE.match(line))]
        infrastructure = bool(nonempty and nonempty[0][1] == "@infrastructure")
        for _, tags in tag_lines:
            for tag in tags:
                if "infrastructure" in tag.casefold() and tag != "@infrastructure":
                    raise ValueError(f"malformed infrastructure tag/classification in {path}")
        if infrastructure:
            if tag_lines != [(nonempty[0][0], ["@infrastructure"])] \
                    or len(nonempty) < 2 or not nonempty[1][1].casefold().startswith("feature:"):
                raise ValueError(f"malformed infrastructure classification in {path}")
        elif any("@infrastructure" in tags for _, tags in tag_lines):
            raise ValueError(f"infrastructure classification must apply to the feature in {path}")

        pending: list[str] = []
        steps: list[tuple[str, str]] | None = None
        in_background = False
        scenario_count = 0
        for line in lines:
            reference = REFERENCE.match(line)
            if reference:
                if infrastructure:
                    raise ValueError(f"mixed infrastructure and product behavior in {path}")
                pending.append(reference.group(1))
                continue
            if FEATURE_BACKGROUND.match(line):
                in_background = True
                steps = None
                continue
            if FEATURE_SCENARIO.match(line):
                scenario_count += 1
                in_background = False
                if len(pending) > 1:
                    raise ValueError(f"reference must bind exactly one Gherkin scenario in {path}")
                if not infrastructure and not pending:
                    raise ValueError(f"unreferenced Gherkin scenario in {path}")
                active_refs = list(pending)
                pending = []
                steps = []
                for item in active_refs:
                    result.setdefault(item, []).append(steps)
                continue
            if FEATURE_EXAMPLES.match(line):
                raise ValueError(
                    f"Gherkin Examples are not represented in approved OpenSpec text: {path}")
            if FEATURE_DATA_TABLE.match(line):
                raise ValueError(
                    f"Gherkin step data table is not represented in approved OpenSpec text: {path}")
            if FEATURE_DOC_STRING.match(line):
                raise ValueError(
                    f"Gherkin step doc string is not represented in approved OpenSpec text: {path}")
            step = FEATURE_STEP.match(line)
            if step:
                if in_background:
                    raise ValueError(f"Background behavior is unmapped in {path}")
                if steps is not None:
                    steps.append(_normalize_step(*step.groups()))
        if pending:
            raise ValueError(f"reference must bind exactly one Gherkin scenario in {path}")
        if infrastructure and scenario_count == 0:
            raise ValueError(f"infrastructure feature contains no scenario in {path}")
    return result


def validate_structured_mapping(specs: dict[str, str], features: dict[str, str],
                                require_all: bool = False) -> dict:
    approved = _spec_scenarios(specs)
    concrete = _feature_scenarios(features)
    unknown = set(concrete) - set(approved)
    if unknown:
        raise ValueError(f"unknown OpenSpec scenario references: {sorted(unknown)}")
    duplicates = [reference for reference, scenarios in concrete.items() if len(scenarios) != 1]
    if duplicates:
        raise ValueError(f"duplicate or ambiguous scenario references: {sorted(duplicates)}")
    if require_all and set(approved) - set(concrete):
        raise ValueError(f"missing OpenSpec scenario mappings: {sorted(set(approved) - set(concrete))}")
    for reference, scenarios in concrete.items():
        if scenarios[0] != approved[reference]:
            raise ValueError(f"step mismatch for {reference}: changed, missing, reordered, duplicated, or unrelated step")
    return {"status": "passed", "required": len(approved) if require_all else len(concrete),
            "mapped": len(concrete)}


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


def validate_evidence_matrix(specs: dict[str, str], features: dict[str, str],
                             matrix: str, approved_sha: str) -> dict:
    """Validate complete scenario evidence without requiring all scenarios in Cucumber."""
    structured = validate_structured_mapping(specs, features)
    approved_by_reference = {
        f"{path}#{slugify(title)}": title
        for path, content in specs.items()
        for title in SCENARIO.findall(content)
    }
    approved_titles = set(approved_by_reference.values())

    sha_match = MATRIX_SHA.search(matrix)
    if not sha_match or sha_match.group(1) != approved_sha:
        raise ValueError("evidence matrix approved SHA does not match")
    count_match = MATRIX_COUNT.search(matrix)
    if not count_match or int(count_match.group(1)) != len(approved_titles):
        raise ValueError("evidence matrix approved scenario count does not match")

    rows: dict[str, set[str]] = {}
    for line in matrix.splitlines():
        if not line.startswith("|"):
            continue
        columns = [column.strip() for column in line.strip().strip("|").split("|")]
        if columns in (
            ["Approved scenario", "Evidence layer", "Exact evidence"],
            ["---", "---", "---"],
        ):
            continue
        if len(columns) != 3:
            raise ValueError("evidence matrix rows must contain exactly three columns")
        title, layer_text, evidence = columns
        if title in rows:
            raise ValueError(f"duplicate evidence matrix scenario: {title}")
        layers = {layer.strip() for layer in layer_text.split("+")}
        if not layers or not layers.issubset(EVIDENCE_LAYERS):
            raise ValueError(f"unsupported evidence layer for scenario: {title}")
        if not evidence:
            raise ValueError(f"empty evidence for scenario: {title}")
        rows[title] = layers

    unknown = set(rows) - approved_titles
    if unknown:
        raise ValueError(f"unknown evidence matrix scenarios: {sorted(unknown)}")
    missing = approved_titles - set(rows)
    if missing:
        raise ValueError(f"missing evidence matrix scenarios: {sorted(missing)}")

    concrete = _feature_scenarios(features)
    cucumber_titles = {approved_by_reference[reference] for reference in concrete}
    declared_cucumber = {
        title for title, layers in rows.items() if "cucumber" in layers
    }
    if cucumber_titles != declared_cucumber:
        raise ValueError("matrix Cucumber evidence does not match feature mappings")

    return {
        "status": "passed",
        "required": len(approved_titles),
        "mapped": len(rows),
        "cucumber": structured["mapped"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", required=True)
    parser.add_argument("--change")
    parser.add_argument("--require-all-active", action="store_true")
    parser.add_argument("--matrix")
    parser.add_argument("--approved-sha")
    args = parser.parse_args()
    root = Path.cwd()
    change_pattern = args.change if args.change else "issue-*"
    specs = {str(path.relative_to(root)): path.read_text()
             for path in root.glob(f"openspec/changes/{change_pattern}/specs/**/*.md")}
    if args.change and not specs:
        raise ValueError(f"no OpenSpec delta specs found for {args.change}")
    features = {str(path.resolve().relative_to(root)): path.read_text()
                for path in Path(args.features).glob("**/*.feature")}
    if args.matrix:
        if not args.approved_sha:
            raise ValueError("--approved-sha is required with --matrix")
        result = validate_evidence_matrix(
            specs, features, Path(args.matrix).read_text(), args.approved_sha)
        print(
            f"OpenSpec scenario traceability: {result['mapped']}/{result['required']} mapped "
            f"({result['cucumber']} representative Cucumber scenarios)"
        )
    else:
        result = validate_structured_mapping(specs, features, args.require_all_active)
        print(f"OpenSpec scenario traceability: {result['mapped']}/{result['required']} mapped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Fail-closed exact-SHA manual preview contracts for persistent Neo Dev."""
from __future__ import annotations

import dataclasses
import argparse
import json
import pathlib
import re
import socket
import subprocess
import urllib.error
import urllib.request


REPOSITORY = "kingkill85/snap-flow"
FIXED_STACK = pathlib.Path("/mnt/marder/docker/dockge/stacks/snapflow-test")
FIXED_ROUTE = "https://snapflow-test.kingkill.org"
FULL_SHA = re.compile(r"[0-9a-f]{40}")
PRODUCT_PREFIXES = ("backend/src/", "frontend/src/")
IDENTITY_ONLY = {
    "backend/src/build-info.ts",
    "backend/src/main.ts",
    "frontend/src/components/layout/BuildVersion.tsx",
    "frontend/src/components/layout/Layout.tsx",
}


class PreviewError(RuntimeError):
    pass


@dataclasses.dataclass(frozen=True)
class Eligibility:
    eligible: bool
    reason: str


def classify_product_diff(paths: list[str]) -> Eligibility:
    candidates = []
    for path in paths:
        if path in IDENTITY_ONLY or "/tests/" in path or "/__tests__/" in path:
            continue
        if path.endswith(('_test.ts', '.test.ts', '.test.tsx')):
            continue
        if path.startswith(PRODUCT_PREFIXES):
            candidates.append(path)
    if not candidates:
        return Eligibility(False, "reviewed diff has no runnable product implementation change")
    return Eligibility(True, "runnable product implementation: " + ", ".join(candidates))


def validate_preview_command(command: str) -> str:
    match = re.fullmatch(r"/preview ([0-9a-f]{40})", command)
    if not match:
        raise PreviewError("command must be exactly /preview <full-40-char-sha>")
    return match.group(1)


def _gh_json(arguments: list[str]):
    result = subprocess.run(["gh", *arguments], check=True, capture_output=True,
                            text=True, timeout=30)
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise PreviewError("gh returned invalid JSON") from error


def validate_gate(issue: int, command: str, review_evidence: pathlib.Path) -> dict:
    sha = validate_preview_command(command)
    pr = _gh_json(["pr", "list", "--repo", REPOSITORY, "--state", "open",
                   "--search", f"{issue} in:body", "--json",
                   "number,isDraft,headRefOid,mergeable,files,updatedAt"])
    if len(pr) != 1:
        raise PreviewError("managed Issue must resolve to exactly one open PR")
    pr = pr[0]
    if pr.get("isDraft") is not True or pr.get("mergeable") != "MERGEABLE":
        raise PreviewError("managed PR must be Draft and cleanly mergeable")
    if pr.get("headRefOid") != sha:
        raise PreviewError("requested SHA does not equal current Draft PR head")
    paths = [item.get("path", "") for item in pr.get("files", [])]
    eligibility = classify_product_diff(paths)
    if not eligibility.eligible:
        raise PreviewError(eligibility.reason)
    checks = _gh_json(["pr", "checks", str(pr["number"]), "--repo", REPOSITORY,
                       "--required", "--json", "name,state,link"])
    if not checks or any(check.get("state") != "SUCCESS" for check in checks):
        raise PreviewError("all required exact-SHA checks must be complete and successful")
    try:
        evidence = json.loads(review_evidence.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("independent-review evidence is missing or invalid") from error
    expected_keys = {"sha", "verdict", "reviewed_at", "reviewer_task_id"}
    if (not isinstance(evidence, dict) or set(evidence) != expected_keys
            or evidence.get("sha") != sha or evidence.get("verdict") != "CLEAN"
            or not evidence.get("reviewed_at") or not evidence.get("reviewer_task_id")):
        raise PreviewError("independent-review evidence is ambiguous, stale, or not CLEAN")
    if evidence["reviewed_at"] < pr["updatedAt"]:
        raise PreviewError("independent-review evidence predates current PR state")
    return {"repository": REPOSITORY, "issue": issue, "pr": pr["number"],
            "sha": sha, "checks": checks, "review": evidence,
            "eligibility": eligibility.reason}


def preflight_fixed_route(timeout: float = 5.0) -> None:
    host = "snapflow-test.kingkill.org"
    try:
        socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as error:
        raise PreviewError("fixed authorized route does not resolve") from error
    request = urllib.request.Request(FIXED_ROUTE + "/version", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status not in {200, 401, 403}:
                raise PreviewError("fixed authorized route is not at the expected boundary")
    except urllib.error.HTTPError as error:
        if error.code not in {401, 403}:
            raise PreviewError("fixed authorized route is not reachable") from error
    except urllib.error.URLError as error:
        raise PreviewError("fixed authorized route is not reachable") from error


def validate_compose(text: str, sha: str) -> dict:
    if not FULL_SHA.fullmatch(sha):
        raise PreviewError("compose verification requires a full SHA")
    forbidden = ("ports:", "/var/lib/", "snapflow_data", "snapflow_uploads",
                 "latest", "admin123", "changeme")
    if any(value in text.lower() for value in forbidden):
        raise PreviewError("compose exposes a port, shared state, mutable image, or default credential")
    required = ("snapflow-test:", f"sha-{sha}", "./state:/app/backend/data",
                "./uploads:/app/backend/uploads", "preview-internal", "external: true",
                f"BUILD_SHA={sha}")
    if any(value not in text for value in required):
        raise PreviewError("compose is not bound to the fixed isolated preview contract")
    return {"route": FIXED_ROUTE, "sha": sha}


def render_packet(scenario: dict, sha: str, build_time: str) -> str:
    if not FULL_SHA.fullmatch(sha):
        raise PreviewError("packet SHA must be full length")
    required = ("title", "steps", "setup", "expected", "persistence", "mobile")
    if any(not scenario.get(key) for key in required) or not isinstance(scenario["steps"], list):
        raise PreviewError("approved scenario is incomplete")
    steps = "\n".join(f"{index}. {step}" for index, step in enumerate(scenario["steps"], 1))
    return f"""# {scenario['title']}

Verified URL: {FIXED_ROUTE}
Full SHA: {sha}
Build time: {build_time}

Setup: {scenario['setup']}
Navigation / steps:
{steps}
Expected result: {scenario['expected']}
Persistence check: {scenario['persistence']}
Mobile check: {scenario['mobile']}

Feedback: attach a screenshot and identify the step, expected result, and observed result.
Legal next commands:
- /fix <bounded feedback>
- /accept {sha}
"""


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Validate or package a SnapFlow manual preview")
    actions = parser.add_subparsers(dest="action", required=True)
    validate = actions.add_parser("validate")
    validate.add_argument("--issue", required=True, type=int)
    validate.add_argument("--command", required=True)
    validate.add_argument("--review-evidence", required=True, type=pathlib.Path)
    packet = actions.add_parser("packet")
    packet.add_argument("--scenario", required=True, type=pathlib.Path)
    packet.add_argument("--sha", required=True)
    packet.add_argument("--build-time", required=True)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    if args.action == "validate":
        print(json.dumps(validate_gate(args.issue, args.command, args.review_evidence),
                         sort_keys=True))
        return
    try:
        scenario = json.loads(args.scenario.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("approved scenario fixture is missing or invalid") from error
    print(render_packet(scenario, args.sha, args.build_time), end="")


if __name__ == "__main__":
    main()

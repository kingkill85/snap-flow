#!/usr/bin/env python3
"""Fail-closed exact-SHA manual preview contracts for persistent Neo Dev."""
from __future__ import annotations

import dataclasses
import argparse
import hashlib
import json
import pathlib
import re
import socket
import subprocess
import urllib.error
import urllib.request
import uuid
import tempfile
from datetime import datetime, timezone


REPOSITORY = "kingkill85/snap-flow"
FIXED_STACK = pathlib.Path("/mnt/marder/docker/dockge/stacks/snapflow-test")
FIXED_ROUTE = "https://snapflow-test.kingkill.org"
FULL_SHA = re.compile(r"[0-9a-f]{40}")
REPORT_SHA256 = re.compile(r"[0-9a-f]{64}")
REQUIRED_CHECK_NAMES = (
    "Backend Tests (Deno)",
    "Frontend Tests (Vitest)",
    "E2E (Cucumber + Playwright)",
    "Test Summary",
)
PRODUCT_PREFIXES = ("backend/src/", "frontend/src/")
IDENTITY_ONLY = {
    "backend/src/build-info.ts",
    "backend/src/main.ts",
    "frontend/src/components/layout/BuildVersion.tsx",
    "frontend/src/components/layout/Layout.tsx",
}


class PreviewError(RuntimeError):
    pass


def resolve_image_digest(run_id: int, sha: str) -> str:
    """Download and bind GitHub-produced image evidence using authenticated gh."""
    if run_id <= 0 or not FULL_SHA.fullmatch(sha):
        raise PreviewError("valid workflow run and full SHA are required")
    run = _gh_json(["run", "view", str(run_id), "--repo", REPOSITORY,
                    "--json", "databaseId,name,event,conclusion"])
    if (not isinstance(run, dict) or run.get("databaseId") != run_id
            or run.get("name") != "Build exact-SHA preview image"
            or run.get("event") != "workflow_dispatch"
            or run.get("conclusion") != "success"):
        raise PreviewError("preview image workflow run is not successful and authentic")
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(["gh", "run", "download", str(run_id), "--repo", REPOSITORY,
                        "--name", f"manual-preview-image-{sha}", "--dir", directory],
                       check=True, capture_output=True, text=True, timeout=30)
        path = pathlib.Path(directory) / "manual-preview-image-evidence.json"
        try:
            evidence = json.loads(path.read_text())
        except (OSError, json.JSONDecodeError) as error:
            raise PreviewError("authenticated image evidence is missing or invalid") from error
    expected = {"repository", "sha", "digest", "build_time", "run_id"}
    if (not isinstance(evidence, dict) or set(evidence) != expected
            or evidence["repository"] != REPOSITORY or evidence["sha"] != sha
            or evidence["run_id"] != run_id
            or re.fullmatch(r"sha256:[0-9a-f]{64}", str(evidence["digest"])) is None):
        raise PreviewError("authenticated image evidence does not match requested SHA")
    _parse_utc(evidence["build_time"], "image build_time")
    return evidence["digest"]


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


def _parse_utc(value: object, field: str) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(
            r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z", value):
        raise PreviewError(f"{field} must be a strict UTC timestamp")
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise PreviewError(f"{field} must be a strict UTC timestamp") from error


def _exact_issue_reference(body: object, issue: int) -> bool:
    if not isinstance(body, str):
        return False
    verb = r"(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?|refs?|references?)"
    target = rf"(?:{re.escape(REPOSITORY)})?#{issue}(?![0-9])"
    return re.search(rf"(?im)\b{verb}\s+{target}\b", body) is not None


def _validate_checks(document: object, sha: str) -> dict[str, list[str]]:
    pages = document if isinstance(document, list) else [document]
    if not pages or any(not isinstance(page, dict) for page in pages):
        raise PreviewError("required exact-SHA checks could not be read")
    totals = {page.get("total_count") for page in pages}
    runs = [run for page in pages for run in page.get("check_runs", [])
            if isinstance(page.get("check_runs"), list)]
    if len(totals) != 1 or not all(type(total) is int for total in totals):
        raise PreviewError("all check-run pages must report one total_count")
    total = next(iter(totals))
    if len(runs) != total:
        raise PreviewError("all check-run pages must be retrieved")
    required_runs: dict[str, list[dict]] = {name: [] for name in REQUIRED_CHECK_NAMES}
    for run in runs:
        if not isinstance(run, dict) or run.get("head_sha") != sha:
            continue
        name = run.get("name")
        if name in required_runs:
            required_runs[name].append(run)
    if any(not runs or any(
            run.get("status") != "completed" or run.get("conclusion") != "success"
            or not isinstance(run.get("html_url"), str)
            or not isinstance(run.get("completed_at"), str) for run in runs
    ) for runs in required_runs.values()):
        raise PreviewError("all explicit required exact-SHA checks must be completed and successful")
    completions = []
    for runs_for_name in required_runs.values():
        for run in runs_for_name:
            completions.append(_parse_utc(run["completed_at"], "check completed_at"))
    latest = max(completions)
    return {"runs": {name: [run["html_url"] for run in runs]
                     for name, runs in required_runs.items()},
            "latest_completed_at": latest.strftime("%Y-%m-%dT%H:%M:%SZ")}


def _validate_review_evidence(path: pathlib.Path, pr: dict, sha: str,
                              now: datetime, latest_check: datetime) -> dict:
    if not path.is_absolute():
        raise PreviewError("independent-review evidence path must be external and absolute")
    repository_root = pathlib.Path(__file__).resolve().parents[2]
    if path.resolve().is_relative_to(repository_root):
        raise PreviewError("independent-review evidence must remain outside the repository")
    try:
        evidence = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("independent-review evidence is missing or invalid") from error
    expected_keys = {
        "pr_number", "base_sha", "head_sha", "verdict", "reviewed_at",
        "reviewer_session_id", "implementation_session_id", "reviewer_login",
        "writer_login", "detached_checkout_sha", "report_path", "report_sha256",
    }
    if not isinstance(evidence, dict) or set(evidence) != expected_keys:
        raise PreviewError("independent-review evidence fields are missing or ambiguous")
    author = pr.get("author", {}).get("login") if isinstance(pr.get("author"), dict) else None
    fixed = (
        evidence.get("pr_number") == pr.get("number"),
        evidence.get("base_sha") == pr.get("baseRefOid"),
        evidence.get("head_sha") == sha,
        evidence.get("detached_checkout_sha") == sha,
        evidence.get("verdict") == "CLEAN",
        evidence.get("writer_login") == author,
        isinstance(author, str) and evidence.get("reviewer_login") != author,
        REPORT_SHA256.fullmatch(str(evidence.get("report_sha256", ""))) is not None,
    )
    if not all(fixed):
        raise PreviewError("independent-review evidence identity does not match the reviewed PR")
    try:
        reviewer_session = str(uuid.UUID(str(evidence["reviewer_session_id"])))
        implementation_session = str(uuid.UUID(str(evidence["implementation_session_id"])))
    except (ValueError, TypeError, AttributeError) as error:
        raise PreviewError("review session identities must be canonical UUIDs") from error
    if (reviewer_session != evidence["reviewer_session_id"]
            or implementation_session != evidence["implementation_session_id"]
            or reviewer_session == implementation_session):
        raise PreviewError("independent reviewer session must be distinct and canonical")
    reviewed_at = _parse_utc(evidence["reviewed_at"], "reviewed_at")
    updated_at = _parse_utc(pr.get("updatedAt"), "PR updatedAt")
    if reviewed_at < updated_at:
        raise PreviewError("independent-review evidence predates current PR state")
    if reviewed_at < latest_check:
        raise PreviewError("independent-review evidence predates required check completion")
    if reviewed_at > now:
        raise PreviewError("independent-review evidence timestamp is in the future")
    report = pathlib.Path(str(evidence["report_path"]))
    if not report.is_absolute():
        raise PreviewError("independent-review report path must be external and absolute")
    if report.resolve().is_relative_to(repository_root):
        raise PreviewError("independent-review report must remain outside the repository")
    try:
        report_bytes = report.read_bytes()
    except OSError as error:
        raise PreviewError("independent-review report is missing") from error
    if report.resolve() == path.resolve() or hashlib.sha256(report_bytes).hexdigest() != evidence["report_sha256"]:
        raise PreviewError("independent-review report SHA-256 does not match")
    return evidence


def validate_gate(issue: int, command: str, review_evidence: pathlib.Path,
                  *, now: datetime | None = None) -> dict:
    sha = validate_preview_command(command)
    live_issue = _gh_json(["issue", "view", str(issue), "--repo", REPOSITORY,
                           "--json", "number,state,labels"])
    labels = live_issue.get("labels", []) if isinstance(live_issue, dict) else []
    if (not isinstance(live_issue, dict) or live_issue.get("number") != issue
            or live_issue.get("state") != "OPEN"
            or "neo-dev" not in [label.get("name") for label in labels
                                  if isinstance(label, dict)]):
        raise PreviewError("managed Issue must be open and carry neo-dev")
    prs = _gh_json(["pr", "list", "--repo", REPOSITORY, "--state", "open",
                    "--limit", "100",
                    "--json", "number,body,isDraft,headRefOid,baseRefOid,mergeable,"
                    "files,updatedAt,author"])
    linked = [pr for pr in prs if isinstance(pr, dict)
              and _exact_issue_reference(pr.get("body"), issue)] if isinstance(prs, list) else []
    if len(linked) != 1:
        raise PreviewError("managed Issue must resolve to exactly one open PR")
    pr = linked[0]
    if pr.get("isDraft") is not True or pr.get("mergeable") != "MERGEABLE":
        raise PreviewError("managed PR must be Draft and cleanly mergeable")
    if pr.get("headRefOid") != sha:
        raise PreviewError("requested SHA does not equal current Draft PR head")
    paths = [item.get("path", "") for item in pr.get("files", [])]
    eligibility = classify_product_diff(paths)
    if not eligibility.eligible:
        raise PreviewError(eligibility.reason)
    checks = _validate_checks(_gh_json([
        "api", f"repos/{REPOSITORY}/commits/{sha}/check-runs?per_page=100",
        "--paginate", "--slurp",
        "--header", "Accept: application/vnd.github+json",
    ]), sha)
    moment = now or datetime.now(timezone.utc)
    if moment.tzinfo is None or moment.utcoffset() is None:
        raise PreviewError("validation clock must be timezone-aware")
    latest_check = _parse_utc(checks["latest_completed_at"], "latest check completion")
    evidence = _validate_review_evidence(review_evidence, pr, sha,
                                         moment.astimezone(timezone.utc), latest_check)
    return {"repository": REPOSITORY, "issue": issue, "pr": pr["number"],
            "sha": sha, "checks": checks, "review": evidence,
            "eligibility": eligibility.reason}


def preflight_fixed_route(timeout: float = 5.0) -> None:
    host = "snapflow-test.kingkill.org"
    try:
        socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as error:
        raise PreviewError("fixed authorized route does not resolve") from error
    request = urllib.request.Request(FIXED_ROUTE + "/", method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if not 200 <= response.status < 500:
                raise PreviewError("fixed authorized route is not at the expected boundary")
    except urllib.error.HTTPError as error:
        if not 400 <= error.code < 600:
            raise PreviewError("fixed authorized route is not reachable") from error
    except urllib.error.URLError as error:
        raise PreviewError("fixed authorized route is not reachable") from error


def validate_compose(text: str, sha: str, digest: str) -> dict:
    if not FULL_SHA.fullmatch(sha):
        raise PreviewError("compose verification requires a full SHA")
    forbidden = ("ports:", "/var/lib/", "snapflow_data", "snapflow_uploads",
                 "latest", "admin123", "changeme")
    if any(value in text.lower() for value in forbidden):
        raise PreviewError("compose exposes a port, shared state, mutable image, or default credential")
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", digest):
        raise PreviewError("immutable image digest is required")
    required = ("snapflow-test:", f"ghcr.io/kingkill85/snap-flow@{digest}", "./state:/app/backend/data",
                "./uploads:/app/backend/uploads", "preview-internal", "external: true",
                f"BUILD_SHA={sha}", "SKIP_DEFAULT_ADMIN_SEED=true")
    if any(value not in text for value in required):
        raise PreviewError("compose is not bound to the fixed isolated preview contract")
    return {"route": FIXED_ROUTE, "sha": sha}


def render_packet(scenario: dict, sha: str, build_time: str,
                  verifier_evidence: dict) -> str:
    if not FULL_SHA.fullmatch(sha):
        raise PreviewError("packet SHA must be full length")
    required = ("title", "steps", "setup", "expected")
    if any(not scenario.get(key) for key in required) or not isinstance(scenario["steps"], list):
        raise PreviewError("approved scenario is incomplete")
    evidence_keys = {"sha", "route", "created_id", "reload_proven", "restart_proven",
                     "reset_repeatable", "mobile_viewport"}
    if (not isinstance(verifier_evidence, dict) or set(verifier_evidence) != evidence_keys
            or verifier_evidence.get("sha") != sha
            or verifier_evidence.get("route") != FIXED_ROUTE
            or not all(verifier_evidence.get(key) is True for key in
                       ("reload_proven", "restart_proven", "reset_repeatable"))
            or verifier_evidence.get("mobile_viewport") != {"width": 390, "height": 844}
            or not isinstance(verifier_evidence.get("created_id"), str)):
        raise PreviewError("packet requires structured verified persistence and mobile evidence")
    steps = "\n".join(f"{index}. {step}" for index, step in enumerate(scenario["steps"], 1))
    return f"""# {scenario['title']}

Verified URL: {FIXED_ROUTE}
Full SHA: {sha}
Build time: {build_time}

Setup: {scenario['setup']}
Navigation / steps:
{steps}
Expected result: {scenario['expected']}
Persistence check: reload and controlled restart proven for {verifier_evidence['created_id']}
Mobile check: verified at 390x844 phone viewport

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
    evidence_path = args.scenario.with_suffix(args.scenario.suffix + ".verified.json")
    try:
        verifier_evidence = json.loads(evidence_path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise PreviewError("structured verifier evidence is missing") from error
    print(render_packet(scenario, args.sha, args.build_time, verifier_evidence), end="")


if __name__ == "__main__":
    main()

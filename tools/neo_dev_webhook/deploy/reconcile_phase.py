#!/usr/bin/env python3
"""Fail-closed synchronization of a Neo Dev phase to its fixed GitHub repository."""

import argparse
import json
import pathlib
import subprocess
import sys
import urllib.parse
from collections.abc import Callable, Sequence

REPOSITORY = "kingkill85/snap-flow"
PHASE_LABELS = frozenset(
    {"needs-approval", "needs-input", "in-progress", "ready-for-review", "blocked"}
)
PHASE_TO_LABEL = {
    "awaiting_input": "needs-input",
    "awaiting_spec_approval": "needs-approval",
    "awaiting_privileged_approval": "needs-approval",
    "awaiting_merge_approval": "needs-approval",
    "implementation_in_progress": "in-progress",
    "ready_for_review": "ready-for-review",
    "blocked": "blocked",
    "non_convergent": "blocked",
}


class ReconciliationError(RuntimeError):
    """The GitHub phase could not be proven synchronized."""


Runner = Callable[..., subprocess.CompletedProcess[str]]


def _run_gh(gh_executable: str, arguments: Sequence[str], *, runner: Runner,
            input_text: str | None = None) -> str:
    try:
        result = runner([gh_executable, *arguments], input=input_text, text=True,
                        capture_output=True, check=False)
    except OSError as error:
        raise ReconciliationError(f"could not execute gh: {error}") from error
    if result.returncode != 0:
        detail = result.stderr.strip() or "no diagnostic"
        raise ReconciliationError(f"gh command failed: {detail}")
    return result.stdout


def _fetch_issue(gh_executable: str, issue: int, *, runner: Runner) -> list[str]:
    output = _run_gh(
        gh_executable,
        ["api", f"repos/{REPOSITORY}/issues/{issue}"],
        runner=runner,
    )
    try:
        data = json.loads(output)
    except json.JSONDecodeError as error:
        raise ReconciliationError("gh returned invalid Issue JSON") from error
    if not isinstance(data, dict):
        raise ReconciliationError("gh returned an invalid Issue")
    if data.get("state") != "open":
        raise ReconciliationError("Issue is not open")
    if "pull_request" in data:
        raise ReconciliationError("target is a pull request")
    raw_labels = data.get("labels")
    if not isinstance(raw_labels, list) or not all(
        isinstance(label, dict) and isinstance(label.get("name"), str)
        for label in raw_labels
    ):
        raise ReconciliationError("gh returned an invalid label list")
    labels = [label["name"] for label in raw_labels]
    if len(labels) != len(set(labels)):
        raise ReconciliationError("GitHub returned duplicate labels")
    if "neo-dev" not in labels:
        raise ReconciliationError("Issue is not eligible: neo-dev label is absent")
    return labels


def reconcile_phase(*, repository: str, issue: int, phase: str,
                    gh_executable: str = "/home/dev/bin/gh",
                    runner: Runner = subprocess.run) -> dict[str, object]:
    if repository != REPOSITORY:
        raise ReconciliationError(f"repository must be exactly {REPOSITORY}")
    if isinstance(issue, bool) or issue < 1:
        raise ReconciliationError("issue must be a positive integer")
    if phase not in PHASE_TO_LABEL:
        raise ReconciliationError(f"unsupported phase: {phase}")
    if not pathlib.Path(gh_executable).is_absolute():
        raise ReconciliationError("gh executable must be an absolute path")

    expected = PHASE_TO_LABEL[phase]
    current = _fetch_issue(gh_executable, issue, runner=runner)
    current_phases = set(current) & PHASE_LABELS
    if expected not in current_phases:
        _run_gh(
            gh_executable,
            ["api", "--method", "POST", f"repos/{REPOSITORY}/issues/{issue}/labels",
             "--input", "-"],
            runner=runner,
            input_text=json.dumps({"labels": [expected]}, separators=(",", ":")),
        )
    for stale in sorted(current_phases - {expected}):
        encoded_label = urllib.parse.quote(stale, safe="")
        _run_gh(
            gh_executable,
            ["api", "--method", "DELETE",
             f"repos/{REPOSITORY}/issues/{issue}/labels/{encoded_label}"],
            runner=runner,
        )

    verified = _fetch_issue(gh_executable, issue, runner=runner)
    verified_phases = sorted(set(verified) & PHASE_LABELS)
    if verified_phases != [expected]:
        raise ReconciliationError("GitHub phase-label verification failed")
    return {"issue": issue, "phase": phase, "phase_label": expected,
            "repository": REPOSITORY, "status": "synchronized"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--issue", required=True, type=int)
    parser.add_argument("--phase", required=True, choices=sorted(PHASE_TO_LABEL))
    parser.add_argument("--gh-executable", default="/home/dev/bin/gh")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        result = reconcile_phase(repository=args.repo, issue=args.issue, phase=args.phase,
                                 gh_executable=args.gh_executable)
    except ReconciliationError as error:
        print(f"phase reconciliation failed: {error}", file=sys.stderr)
        return 1
    print(json.dumps(result, sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

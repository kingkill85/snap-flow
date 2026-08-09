#!/usr/bin/env python3
"""Fail-closed synchronization of a Neo Dev phase to its fixed GitHub repository."""

import argparse
import json
import pathlib
import subprocess
import sys
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


def _fetch_labels(gh_executable: str, issue: int, *, runner: Runner) -> list[str]:
    output = _run_gh(
        gh_executable,
        ["api", f"repos/{REPOSITORY}/issues/{issue}", "--jq", "[.labels[].name]"],
        runner=runner,
    )
    try:
        labels = json.loads(output)
    except json.JSONDecodeError as error:
        raise ReconciliationError("gh returned invalid label JSON") from error
    if not isinstance(labels, list) or not all(isinstance(label, str) for label in labels):
        raise ReconciliationError("gh returned an invalid label list")
    if len(labels) != len(set(labels)):
        raise ReconciliationError("GitHub returned duplicate labels")
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
    current = _fetch_labels(gh_executable, issue, runner=runner)
    desired = [label for label in current if label not in PHASE_LABELS]
    desired.append(expected)
    if current != desired:
        _run_gh(
            gh_executable,
            ["api", "--method", "PATCH", f"repos/{REPOSITORY}/issues/{issue}",
             "--input", "-"],
            runner=runner,
            input_text=json.dumps({"labels": desired}, separators=(",", ":")),
        )

    verified = _fetch_labels(gh_executable, issue, runner=runner)
    verified_phases = sorted(set(verified) & PHASE_LABELS)
    if verified_phases != [expected] or set(verified) != set(desired):
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

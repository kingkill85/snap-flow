from __future__ import annotations

from .independent_review import (
    apply_verdict, begin_review, migrate_review_state, record_correction,
    render_review_handoff,
)

EXPECTED_PHASES = [
    "reviewing", "stale_rejected", "correction_required",
    "awaiting_review", "reviewing", "clean",
]


def _evidence(sha: str) -> dict:
    return {
        "sha": sha, "approved_spec_sha": "9" * 40,
        "approval_artifact_sha": "9" * 40,
        "tests": {"focused": "passed", "full": "passed"},
        "lint": "passed", "typecheck": "passed", "build": "passed",
        "openspec": {"validate": "passed", "verify": "passed", "strict": True},
        "checks": [{"sha": sha, "state": "SUCCESS"}],
        "approval_artifacts": {"immutable": True}, "secret_scan": {"passed": True},
        "worktree": {"correct": True, "clean": True, "synced": True,
                     "tracked_and_relevant_untracked_reviewed": True},
        "ui": {"required": False, "reason": "non-destructive controller fixture"},
    }


def _verdict(sha: str, reviewer: str, run: str, *, clean: bool) -> dict:
    findings = [] if clean else [{
        "fingerprint": "fixture-race", "severity": "high", "category": "correctness",
        "summary": "fixture correction", "blocking": True, "material_spec_change": False,
    }]
    return {"reviewed_sha": sha, "reviewer_session_id": reviewer,
            "reviewer_run_id": run, "disposition": "clean" if clean else "blocking",
            "findings": findings}


def run_canary() -> dict:
    implementer = "12345678-1234-4abc-8def-123456789abc"
    first_reviewer = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    second_reviewer = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    first_sha, fixed_sha = "a" * 40, "b" * 40
    state = migrate_review_state({"lifecycle_state": "spec_approved",
                                  "codex_session_id": implementer, "spec_sha": "9" * 40})
    phases = []
    state = begin_review(state, first_sha, first_reviewer, "fixture-1", _evidence(first_sha))
    phases.append(state["review_phase"])
    try:
        apply_verdict(state, fixed_sha, _verdict(first_sha, first_reviewer, "fixture-1", clean=False))
    except ValueError:
        phases.append("stale_rejected")
    state = apply_verdict(state, first_sha,
                          _verdict(first_sha, first_reviewer, "fixture-1", clean=False))
    phases.append(state["review_phase"])
    state = record_correction(state, fixed_sha, implementer)
    phases.append(state["review_phase"])
    state = begin_review(state, fixed_sha, second_reviewer, "fixture-2", _evidence(fixed_sha))
    phases.append(state["review_phase"])
    state = apply_verdict(state, fixed_sha,
                          _verdict(fixed_sha, second_reviewer, "fixture-2", clean=True))
    phases.append(state["review_phase"])
    return {"phases": phases, "same_implementer": state["implementation_session_id"] == implementer,
            "fresh_reviewer": first_reviewer != second_reviewer,
            "footer": render_review_handoff(state, fixed_sha)}


def main() -> int:
    result = run_canary()
    if (result.get("phases") != EXPECTED_PHASES or result.get("same_implementer") is not True
            or result.get("fresh_reviewer") is not True
            or not result.get("footer", "").endswith("/cancel")):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

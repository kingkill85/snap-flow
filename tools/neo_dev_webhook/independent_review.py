from __future__ import annotations

import re
import uuid
from typing import Any


SHA = re.compile(r"[0-9a-f]{40}")
BLOCKING_CATEGORIES = frozenset({
    "correctness", "security", "regression", "scope", "spec-compliance",
    "migration-data-safety", "missing-test",
})
VERDICT_KEYS = frozenset({
    "reviewed_sha", "reviewer_session_id", "reviewer_run_id", "disposition", "findings",
})
FINDING_KEYS = frozenset({
    "fingerprint", "severity", "category", "summary", "blocking", "material_spec_change",
})


def begin_review(state: dict[str, Any], head_sha: str, reviewer_session_id: str,
                 reviewer_run_id: str, evidence: dict[str, Any]) -> dict[str, Any]:
    _validate_sha(head_sha)
    _validate_uuid(reviewer_session_id)
    if reviewer_session_id == state.get("implementation_session_id"):
        raise ValueError("independent reviewer identity must differ from implementer")
    if reviewer_session_id in state.get("reviewer_history", []):
        raise ValueError("each changed SHA requires a fresh independent reviewer")
    if not isinstance(reviewer_run_id, str) or not reviewer_run_id.strip():
        raise ValueError("reviewer run identity is required")
    _validate_evidence(evidence, head_sha, state.get("approved_spec_sha"))
    updated = dict(state)
    updated.update(review_phase="reviewing", reviewed_sha=head_sha,
                   reviewer_session_id=reviewer_session_id,
                   reviewer_run_id=reviewer_run_id, deterministic_evidence=evidence,
                   review_generation=state.get("review_generation", 0) + 1)
    return updated


def apply_verdict(state: dict[str, Any], current_head_sha: str,
                  verdict: dict[str, Any]) -> dict[str, Any]:
    if state.get("review_verdict") == verdict and state.get("review_phase") in {
        "clean", "needs_input", "correction_required",
    }:
        return state
    if state.get("review_phase") != "reviewing":
        raise ValueError("review verdict is not expected in the current phase")
    if (state.get("approval_artifact_sha") != state.get("approved_spec_sha")
            or state.get("deterministic_evidence", {}).get("approval_artifact_sha")
            != state.get("approved_spec_sha")):
        raise ValueError("approval artifact SHA does not match approved spec SHA")
    _validate_sha(current_head_sha)
    if not isinstance(verdict, dict) or set(verdict) != VERDICT_KEYS:
        raise ValueError("malformed independent review verdict")
    if (verdict["reviewed_sha"] != current_head_sha
            or verdict["reviewed_sha"] != state.get("reviewed_sha")):
        raise ValueError("stale reviewer SHA")
    if (verdict["reviewer_session_id"] != state.get("reviewer_session_id")
            or verdict["reviewer_run_id"] != state.get("reviewer_run_id")):
        raise ValueError("reviewer provenance mismatch")
    if verdict["disposition"] not in {"clean", "blocking"} or not isinstance(verdict["findings"], list):
        raise ValueError("malformed independent review verdict")
    findings = verdict["findings"]
    for finding in findings:
        _validate_finding(finding)
    if verdict["disposition"] == "clean" and findings:
        raise ValueError("clean verdict cannot contain findings")
    if verdict["disposition"] == "blocking" and not findings:
        raise ValueError("blocking verdict requires findings")

    updated = dict(state)
    history = list(state.get("reviewer_history", []))
    history.append(state["reviewer_session_id"])
    updated.update(review_verdict=verdict, review_findings=findings,
                   reviewer_history=history)
    if verdict["disposition"] == "clean":
        updated.update(review_phase="clean", review_disposition="independent review clean")
        return updated
    if any(item["material_spec_change"] for item in findings):
        updated.update(review_phase="needs_input",
                       review_disposition="material specification discovery requires /revise-spec")
        return updated
    fingerprints = set(state.get("finding_history", []))
    repeated = next((item["fingerprint"] for item in findings
                     if item["fingerprint"] in fingerprints), None)
    fingerprints.update(item["fingerprint"] for item in findings)
    updated["finding_history"] = sorted(fingerprints)
    if repeated is not None:
        updated.update(review_phase="needs_input",
                       review_disposition=f"repeated blocking finding: {repeated}")
        return updated
    cycle = state.get("fix_cycle", 0) + 1
    updated["fix_cycle"] = cycle
    if cycle > 3:
        updated.update(review_phase="needs_input",
                       review_disposition="maximum 3 fix/re-review cycles exhausted")
    else:
        updated.update(review_phase="correction_required",
                       correction_session_id=state.get("implementation_session_id"),
                       review_disposition="blocking findings require durable implementer correction")
    return updated


def record_correction(state: dict[str, Any], new_head_sha: str,
                      implementation_session_id: str) -> dict[str, Any]:
    _validate_sha(new_head_sha)
    if state.get("review_phase") != "correction_required":
        raise ValueError("correction is not expected")
    if implementation_session_id != state.get("implementation_session_id"):
        raise ValueError("correction must resume the same durable implementer")
    if new_head_sha == state.get("reviewed_sha"):
        raise ValueError("correction must produce a new SHA")
    updated = dict(state)
    updated.update(review_phase="awaiting_review", reviewed_sha=None,
                   reviewer_session_id=None, reviewer_run_id=None,
                   deterministic_evidence=None, review_verdict=None,
                   review_findings=[], review_disposition=None)
    return updated


def record_reviewer_failure(state: dict[str, Any], exact_evidence: str) -> dict[str, Any]:
    if state.get("review_phase") not in {"reviewer_starting", "reviewing"} \
            or not isinstance(exact_evidence, str) \
            or not exact_evidence.strip():
        raise ValueError("reviewer failure evidence is invalid")
    updated = dict(state)
    updated.update(review_phase="needs_input",
                   review_disposition=f"independent reviewer failure: {exact_evidence.strip()}")
    return updated


def render_review_handoff(state: dict[str, Any], current_head_sha: str) -> str:
    if state.get("review_phase") == "clean":
        if state.get("reviewed_sha") != current_head_sha:
            raise ValueError("clean review does not cover current PR head")
        return ("Independent review is clean for the exact current PR head.\n\n"
                f"/accept {current_head_sha}\n/fix <bounded request>\n"
                "/revise-spec <bounded request>\n/cancel")
    if state.get("review_phase") == "needs_input":
        return (f"{state.get('review_disposition', 'review blocked')}\n\n"
                "/revise-spec <bounded request>\n/cancel")
    raise ValueError("review handoff is not terminal")


def _validate_sha(value: object) -> None:
    if not isinstance(value, str) or SHA.fullmatch(value) is None:
        raise ValueError("exact full SHA is required")


def _validate_uuid(value: object) -> None:
    try:
        parsed = uuid.UUID(value)  # type: ignore[arg-type]
    except (ValueError, TypeError, AttributeError) as error:
        raise ValueError("reviewer session identity must be a canonical UUID") from error
    if str(parsed) != value:
        raise ValueError("reviewer session identity must be a canonical UUID")


def validate_review_evidence(evidence: object, sha: str, approved_spec_sha: str) -> None:
    _validate_evidence(evidence, sha, approved_spec_sha)


def validate_e2e_evidence(evidence: object, sha: str) -> None:
    if not isinstance(evidence, dict) or evidence.get("head_sha") != sha:
        raise ValueError("E2E evidence is missing or stale")
    local = evidence.get("local")
    if local != {"status": "passed", "command": "npm run e2e"}:
        raise ValueError("E2E local Cucumber execution is missing")
    mapping = evidence.get("mapping")
    if (not isinstance(mapping, dict) or mapping.get("status") != "passed"
            or type(mapping.get("required")) is not int
            or mapping.get("mapped") != mapping.get("required")):
        raise ValueError("E2E OpenSpec scenario mapping is incomplete")
    from .deterministic_gates import validate_e2e_check
    check = evidence.get("github_check")
    try:
        validate_e2e_check([check] if isinstance(check, dict) else [], sha)
    except RuntimeError as error:
        raise ValueError("E2E GitHub check evidence is invalid") from error
    artifacts = evidence.get("artifacts")
    expected = {
        "cucumber_report": f"cucumber-report-{sha}",
        "playwright_failures": f"playwright-failures-{sha}",
    }
    if artifacts != expected:
        raise ValueError("E2E report and failure artifact evidence is missing")


def validate_e2e_applicability(value: object, sha: str) -> None:
    if not isinstance(value, dict) or value.get("required") is not False:
        raise ValueError("E2E inapplicability is invalid")
    reason = value.get("reason")
    if (not isinstance(reason, str) or len(reason.strip()) < 20
            or value.get("reviewed_sha") != sha or value.get("reviewer_approved") is not True):
        raise ValueError("E2E inapplicability requires a specific persisted reviewer-approved reason")


def _validate_evidence(evidence: object, sha: str, approved_spec_sha: object) -> None:
    required = {"sha", "approved_spec_sha", "approval_artifact_sha", "tests", "lint",
                "typecheck", "build", "openspec", "checks",
                "approval_artifacts", "secret_scan", "worktree", "ui", "gates",
                "gate_context", "e2e"}
    if not isinstance(evidence, dict) or set(evidence) != required or evidence.get("sha") != sha:
        raise ValueError("deterministic review evidence is missing or stale")
    _validate_sha(approved_spec_sha)
    if evidence["approved_spec_sha"] != approved_spec_sha:
        raise ValueError("approved spec SHA does not match controller authority")
    if evidence["approval_artifact_sha"] != approved_spec_sha:
        raise ValueError("approval artifact SHA does not match approved spec SHA")
    from .deterministic_gates import (
        REQUIRED_GATES, expected_gate_commands, validate_gate_execution,
    )
    gates = evidence["gates"]
    if not isinstance(gates, dict) or set(gates) != set(REQUIRED_GATES):
        raise ValueError("deterministic gate provenance is incomplete")
    context = evidence["gate_context"]
    if (not isinstance(context, dict) or set(context) != {
            "changed_paths", "worktree", "change"}
            or not isinstance(context["changed_paths"], list)
            or not isinstance(context["worktree"], str)
            or not isinstance(context["change"], str)):
        raise ValueError("deterministic gate context is invalid")
    for name, record in gates.items():
        expected = expected_gate_commands(
            name, context["changed_paths"], context["worktree"], context["change"],
            approved_spec_sha,
        )
        try:
            validate_gate_execution(record, expected, sha, approved_spec_sha)
        except ValueError as error:
            raise ValueError(f"deterministic gate provenance is invalid: {name}") from error
        if record.get("status") != "passed":
            raise ValueError(f"deterministic gate provenance is invalid: {name}")
    tests = evidence["tests"]
    if not isinstance(tests, dict) or tests.get("focused") != "passed" or tests.get("full") != "passed":
        raise ValueError("required tests are not successful")
    if any(evidence[key] != "passed" for key in ("lint", "typecheck", "build")):
        raise ValueError("lint/type-check/build evidence is not successful")
    openspec = evidence["openspec"]
    if openspec != {"validate": "passed", "verify": "passed", "strict": True}:
        raise ValueError("strict OpenSpec evidence is not successful")
    checks = evidence["checks"]
    if not isinstance(checks, list) or not checks or any(
        not isinstance(item, dict) or item.get("head_sha") != sha
        or item.get("state") != "SUCCESS" or type(item.get("id")) is not int
        or not isinstance(item.get("name"), str) or item.get("status") != "completed"
        or item.get("conclusion") != "success"
        for item in checks
    ):
        raise ValueError("exact-SHA CI/check-runs are missing, pending, stale, or failed")
    if evidence["approval_artifacts"] != {"immutable": True}:
        raise ValueError("approval artifact immutability is not verified")
    if evidence["secret_scan"] != {"passed": True}:
        raise ValueError("secret/private-data scan is not successful")
    validate_e2e_evidence(evidence["e2e"], sha)
    worktree = evidence["worktree"]
    if not isinstance(worktree, dict) or any(worktree.get(key) is not True for key in (
        "correct", "clean", "synced", "tracked_and_relevant_untracked_reviewed",
    )):
        raise ValueError("worktree evidence is missing, dirty, unsynced, or incorrect")
    ui = evidence["ui"]
    if not isinstance(ui, dict) or type(ui.get("required")) is not bool:
        raise ValueError("UI applicability evidence is missing")
    if ui["required"] and (not isinstance(ui.get("screenshots"), list) or not ui["screenshots"]):
        raise ValueError("UI review requires browser evidence and screenshots")
    if not ui["required"] and not isinstance(ui.get("reason"), str):
        raise ValueError("UI N/A reason is missing")


def _validate_finding(finding: object) -> None:
    if not isinstance(finding, dict) or set(finding) != FINDING_KEYS:
        raise ValueError("malformed structured finding")
    if any(not isinstance(finding[key], str) or not finding[key].strip()
           for key in ("fingerprint", "severity", "category", "summary")):
        raise ValueError("malformed structured finding")
    if type(finding["blocking"]) is not bool or type(finding["material_spec_change"]) is not bool:
        raise ValueError("malformed structured finding")
    if finding["category"] in BLOCKING_CATEGORIES and not finding["blocking"]:
        raise ValueError("mandatory blocking finding was marked nonblocking")
    if not finding["blocking"] and finding["category"] != "cosmetic":
        raise ValueError("only justified cosmetic findings may be nonblocking")


def migrate_review_state(record: dict[str, Any]) -> dict[str, Any]:
    """Add controller review state without disturbing an in-flight implementer."""
    migrated = dict(record)
    migrated.setdefault("implementation_session_id", record.get("codex_session_id"))
    migrated.setdefault("approved_spec_sha", record.get("spec_sha"))
    migrated.setdefault("approval_artifact_sha", record.get("spec_sha"))
    migrated.setdefault("review_phase", "awaiting_implementation")
    migrated.setdefault("review_generation", 0)
    migrated.setdefault("fix_cycle", 0)
    migrated.setdefault("reviewed_sha", None)
    migrated.setdefault("reviewer_session_id", None)
    migrated.setdefault("reviewer_run_id", None)
    migrated.setdefault("review_findings", [])
    migrated.setdefault("deterministic_evidence", None)
    migrated.setdefault("review_disposition", None)
    migrated.setdefault("reviewer_history", [])
    migrated.setdefault("finding_history", [])
    migrated.setdefault("review_verdict", None)
    migrated.setdefault("correction_session_id", None)
    return migrated

from __future__ import annotations

import hashlib
import unittest


HEAD = "a" * 40
REVIEWER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
IMPLEMENTER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


SPEC = """
### Requirement: Catalog visibility
#### Scenario: Visitor sees products
- **GIVEN** products exist
- **AND** the visitor is signed in
- **WHEN** the visitor opens the catalog
- **THEN** the products are visible
"""

FEATURE = """
# openspec-scenario: openspec/changes/issue-42/specs/catalog/spec.md#visitor-sees-products
Scenario: Catalog products are visible
  Given products exist
  And the visitor is signed in
  When the visitor opens the catalog
  Then the products are visible
"""


class StructuredTraceabilityTests(unittest.TestCase):
    def test_exact_ordered_steps_bind_one_reference_to_one_gherkin_scenario(self):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping
        result = validate_structured_mapping(
            {"openspec/changes/issue-42/specs/catalog/spec.md": SPEC},
            {"e2e/features/catalog.feature": FEATURE}, require_all=True,
        )
        self.assertEqual(result, {"status": "passed", "required": 1, "mapped": 1})

    def test_changed_missing_reordered_duplicated_and_unrelated_steps_are_rejected(self):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping
        mutations = [
            FEATURE.replace("products are visible", "products are hidden"),
            FEATURE.replace("  And the visitor is signed in\n", ""),
            FEATURE.replace("  Given products exist\n  And the visitor is signed in",
                            "  Given the visitor is signed in\n  And products exist"),
            FEATURE.replace("  Then the products are visible",
                            "  Then the products are visible\n  And the products are visible"),
            FEATURE.replace("  Then the products are visible",
                            "  Then the products are visible\n  And an unrelated audit exists"),
        ]
        for feature in mutations:
            with self.subTest(feature=feature), self.assertRaisesRegex(ValueError, "step"):
                validate_structured_mapping(
                    {"openspec/changes/issue-42/specs/catalog/spec.md": SPEC},
                    {"e2e/features/catalog.feature": feature}, require_all=True,
                )

    def test_duplicate_and_ambiguous_references_are_rejected(self):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping
        for feature in (FEATURE + "\n" + FEATURE,
                        FEATURE.replace("Scenario:",
                                        FEATURE.splitlines()[1] + "\nScenario:")):
            with self.subTest(feature=feature), self.assertRaisesRegex(ValueError, "duplicate|exactly one"):
                validate_structured_mapping(
                    {"openspec/changes/issue-42/specs/catalog/spec.md": SPEC},
                    {"e2e/features/catalog.feature": feature}, require_all=True,
                )


class ArtifactAttestationTests(unittest.TestCase):
    def valid(self):
        report = b'[{"uri":"e2e/features/runtime-tracer.feature"}]'
        return {
            "artifact": {"id": 501, "name": f"cucumber-report-{HEAD}",
                         "digest": "sha256:" + "1" * 64, "expired": False},
            "run": {"id": 701, "attempt": 2, "head_sha": HEAD},
            "job": {"id": 801, "name": "E2E (Cucumber + Playwright)",
                    "run_id": 701, "run_attempt": 2, "head_sha": HEAD},
            "contents": {"tested_sha": HEAD,
                         "cucumber_report_sha256": hashlib.sha256(report).hexdigest(),
                         "cucumber_report_documents": 1},
            "failure_artifacts": [],
        }

    def test_full_attestation_accepts_exact_success_artifact(self):
        from neo_dev_webhook.verification import validate_e2e_artifact_attestation
        validate_e2e_artifact_attestation(self.valid(), HEAD, run_id=701, run_attempt=2,
                                          job_id=801)

    def test_stale_attempt_same_name_wrong_content_and_expired_are_rejected(self):
        from neo_dev_webhook.verification import validate_e2e_artifact_attestation
        values = []
        stale = self.valid(); stale["run"]["attempt"] = 1; values.append(stale)
        same_name = self.valid(); same_name["artifact"]["id"] = 0; values.append(same_name)
        wrong = self.valid(); wrong["contents"]["tested_sha"] = "b" * 40; values.append(wrong)
        expired = self.valid(); expired["artifact"]["expired"] = True; values.append(expired)
        for value in values:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "artifact"):
                validate_e2e_artifact_attestation(value, HEAD, 701, 2, 801)

    def test_success_does_not_synthesize_absent_failure_artifacts(self):
        from neo_dev_webhook.verification import validate_e2e_artifact_attestation
        from neo_dev_webhook.independent_review import validate_e2e_evidence
        from neo_dev_webhook.tests.test_deterministic_gates import check_run
        value = self.valid(); value["failure_artifacts"] = [f"playwright-failures-{HEAD}"]
        with self.assertRaisesRegex(ValueError, "failure artifact"):
            validate_e2e_artifact_attestation(value, HEAD, 701, 2, 801)
        validate_e2e_evidence({"head_sha": HEAD,
            "local": {"status": "passed", "command": "npm run e2e"},
            "mapping": {"status": "passed", "required": 0, "mapped": 0},
            "github_check": check_run(HEAD),
            "artifacts": {"cucumber_report": f"cucumber-report-{HEAD}"}}, HEAD)

    def test_pagination_collects_later_pages_with_a_bound(self):
        from neo_dev_webhook.verification import collect_paginated
        class Executor:
            def __init__(self): self.pages = []
            def run(self, argv, *, timeout):
                page = int(argv[-1].rsplit("page=", 1)[1]); self.pages.append(page)
                count = 100 if page == 1 else 1
                return __import__('json').dumps({"artifacts": [{"id": page * 100 + i}
                                                               for i in range(count)]})
        executor = Executor()
        items = collect_paginated(executor, ("gh",), "repos/o/r/actions/runs/1/artifacts",
                                  "artifacts", max_pages=3)
        self.assertEqual(len(items), 101)
        self.assertEqual(executor.pages, [1, 2])


class ApplicabilityPromotionTests(unittest.TestCase):
    def exception(self, **updates):
        value = {"required": False,
                 "reason": "Documentation-only change has no user-visible runtime behavior.",
                 "reviewed_sha": HEAD, "reviewer_session_id": REVIEWER,
                 "reviewer_run_id": "review-run-1", "reviewer_approved": True}
        value.update(updates)
        return value

    def test_specific_fresh_independent_exception_is_accepted(self):
        from neo_dev_webhook.independent_review import validate_persisted_e2e_applicability
        validate_persisted_e2e_applicability(self.exception(), HEAD, REVIEWER,
                                             "review-run-1", IMPLEMENTER)

    def test_absent_generic_stale_implementer_approved_and_conflicting_exceptions_block(self):
        from neo_dev_webhook.independent_review import validate_persisted_e2e_applicability
        values = [None, self.exception(reason="not needed"),
                  self.exception(reviewed_sha="b" * 40),
                  self.exception(reviewer_session_id=IMPLEMENTER),
                  {**self.exception(), "required": True}]
        for value in values:
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "E2E"):
                validate_persisted_e2e_applicability(value, HEAD, REVIEWER,
                                                     "review-run-1", IMPLEMENTER)

    def test_clean_promotion_persists_required_or_independent_inapplicability(self):
        from neo_dev_webhook.independent_review import apply_verdict
        base = {"review_phase": "reviewing", "reviewed_sha": HEAD,
                "reviewer_session_id": REVIEWER, "reviewer_run_id": "review-run-1",
                "implementation_session_id": IMPLEMENTER,
                "approved_spec_sha": "9" * 40, "approval_artifact_sha": "9" * 40,
                "deterministic_evidence": {"approval_artifact_sha": "9" * 40,
                                           "e2e": {"head_sha": HEAD}},
                "reviewer_history": []}
        verdict = {"reviewed_sha": HEAD, "reviewer_session_id": REVIEWER,
                   "reviewer_run_id": "review-run-1", "disposition": "clean",
                   "findings": [], "e2e_applicability": self.exception()}
        updated = apply_verdict(base, HEAD, verdict)
        self.assertEqual(updated["e2e_applicability"], self.exception())

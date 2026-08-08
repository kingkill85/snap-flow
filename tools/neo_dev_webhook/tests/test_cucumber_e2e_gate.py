from __future__ import annotations

import unittest


HEAD = "a" * 40


class CucumberE2EGateTests(unittest.TestCase):
    def test_scenario_mapping_rejects_missing_and_unknown_openspec_scenarios(self):
        from tools.neo_dev_webhook.scenario_traceability import validate_mapping

        specs = {
            "openspec/changes/issue-42/specs/catalog/spec.md": """
### Requirement: Visible catalog
#### Scenario: Visitor sees products
- **GIVEN** products exist
- **WHEN** the visitor opens the catalog
- **THEN** the products are visible
""",
        }
        with self.assertRaisesRegex(ValueError, "missing"):
            validate_mapping(specs, {})
        with self.assertRaisesRegex(ValueError, "unknown"):
            validate_mapping(specs, {
                "e2e/features/catalog.feature": [
                    "openspec/changes/issue-42/specs/catalog/spec.md#unknown-scenario"
                ],
            })

        result = validate_mapping(specs, {
            "e2e/features/catalog.feature": [
                "openspec/changes/issue-42/specs/catalog/spec.md#visitor-sees-products"
            ],
        })
        self.assertEqual(result["mapped"], 1)
        self.assertEqual(result["required"], 1)

    def test_dedicated_e2e_check_fails_closed_for_every_non_success_state(self):
        from tools.neo_dev_webhook.deterministic_gates import validate_e2e_check

        valid = {
            "id": 77, "name": "E2E (Cucumber + Playwright)", "head_sha": HEAD,
            "status": "completed", "conclusion": "success", "state": "SUCCESS",
            "artifacts": ["cucumber-report-" + HEAD],
        }
        self.assertEqual(validate_e2e_check([valid], HEAD)["id"], 77)
        mutations = [
            [],
            [{**valid, "head_sha": "b" * 40}],
            [{**valid, "status": "queued", "conclusion": None, "state": "PENDING"}],
            [{**valid, "conclusion": "failure", "state": "FAILURE"}],
            [{**valid, "conclusion": "skipped", "state": "SKIPPED"}],
            [{**valid, "conclusion": "cancelled", "state": "CANCELLED"}],
            [{**valid, "artifacts": []}],
        ]
        for checks in mutations:
            with self.subTest(checks=checks), self.assertRaisesRegex(RuntimeError, "E2E"):
                validate_e2e_check(checks, HEAD)

    def test_e2e_gate_runs_cucumber_and_requires_sha_bound_reports_and_failure_artifacts(self):
        from tools.neo_dev_webhook.deterministic_gates import expected_gate_commands

        commands = expected_gate_commands(
            "e2e", ["frontend/src/App.tsx"], "/workspace/snap-flow-issue-42",
            "issue-42", "9" * 40,
        )
        self.assertEqual(commands, [
            {
                "argv": ["python3", "-m", "tools.neo_dev_webhook.scenario_traceability",
                         "--features", "e2e/features", "--change", "issue-42",
                         "--require-all-active"],
                "cwd": "/workspace/snap-flow-issue-42",
            },
            {"argv": ["npm", "run", "e2e"], "cwd": "/workspace/snap-flow-issue-42"},
        ])

    def test_review_evidence_without_exact_e2e_artifacts_blocks_acceptance(self):
        from tools.neo_dev_webhook.independent_review import validate_e2e_evidence

        valid = {
            "head_sha": HEAD,
            "local": {"status": "passed", "command": "npm run e2e"},
            "mapping": {"status": "passed", "required": 1, "mapped": 1},
            "github_check": {
                "id": 77, "name": "E2E (Cucumber + Playwright)",
                "head_sha": HEAD, "status": "completed", "conclusion": "success",
                "state": "SUCCESS", "artifacts": ["cucumber-report-" + HEAD],
            },
            "artifacts": {
                "cucumber_report": "cucumber-report-" + HEAD,
                "playwright_failures": "playwright-failures-" + HEAD,
            },
        }
        validate_e2e_evidence(valid, HEAD)
        invalid = [
            {},
            {**valid, "head_sha": "b" * 40},
            {**valid, "local": {"status": "passed", "command": "npm exec playwright test"}},
            {**valid, "artifacts": {}},
        ]
        for evidence in invalid:
            with self.subTest(evidence=evidence), self.assertRaisesRegex(ValueError, "E2E"):
                validate_e2e_evidence(evidence, HEAD)

    def test_inapplicability_requires_specific_persisted_reviewer_approval(self):
        from tools.neo_dev_webhook.independent_review import validate_e2e_applicability

        with self.assertRaisesRegex(ValueError, "reviewer-approved"):
            validate_e2e_applicability({
                "required": False, "reason": "not needed", "reviewed_sha": HEAD,
                "reviewer_approved": False,
            }, HEAD)
        validate_e2e_applicability({
            "required": False,
            "reason": "Only documentation outside user-visible behavior changed.",
            "reviewed_sha": HEAD,
            "reviewer_approved": True,
        }, HEAD)


if __name__ == "__main__":
    unittest.main()

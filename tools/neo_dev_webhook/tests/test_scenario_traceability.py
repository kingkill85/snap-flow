from __future__ import annotations

import json
import unittest
from pathlib import Path

from tools.neo_dev_webhook import scenario_traceability


APPROVED_SHA = "d13afe536e6e8dcd727a7a2a32da642ab3de6ee2"
SPEC_PATH = (
    "openspec/changes/issue-89-generic-zoning-parameters/"
    "specs/area-zoning-values/spec.md"
)
SPECS = {
    SPEC_PATH: """
#### Scenario: Browser path
- **GIVEN** browser setup
- **WHEN** the browser acts
- **THEN** persisted state is visible

#### Scenario: Backend-only path
- **GIVEN** repository setup
- **WHEN** persistence fails
- **THEN** the transaction rolls back
"""
}
FEATURES = {
    "e2e/features/issue-89.feature": f"""
@issue-89
Feature: representative behavior

  # openspec-scenario: {SPEC_PATH}#browser-path
  Scenario: Browser path
    Given browser setup
    When the browser acts
    Then persisted state is visible
"""
}


def matrix(*rows: str, sha: str = APPROVED_SHA, count: int = 2) -> str:
    return "\n".join(
        [
            "# Issue #89 scenario traceability",
            "",
            f"Approved source SHA: `{sha}`",
            f"Approved scenario count: **{count}**",
            "",
            "| Approved scenario | Evidence layer | Exact evidence |",
            "| --- | --- | --- |",
            *rows,
        ]
    )


VALID_ROWS = (
    "| Browser path | cucumber | `e2e/features/issue-89.feature` |",
    "| Backend-only path | backend | `backend/tests/example_test.ts` |",
)


class EvidenceMatrixTests(unittest.TestCase):
    def validate(self, document: str) -> dict:
        return scenario_traceability.validate_evidence_matrix(
            SPECS, FEATURES, document, APPROVED_SHA
        )

    def test_complete_matrix_uses_all_approved_scenarios_as_denominator(self) -> None:
        result = self.validate(matrix(*VALID_ROWS))
        self.assertEqual(
            result,
            {"status": "passed", "required": 2, "mapped": 2, "cucumber": 1},
        )

    def test_rejects_self_selected_cucumber_denominator(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing evidence matrix scenarios"):
            self.validate(matrix(VALID_ROWS[0]))

    def test_rejects_stale_sha_count_duplicate_unknown_layer_or_empty_evidence(self) -> None:
        invalid = (
            matrix(*VALID_ROWS, sha="7" * 40),
            matrix(*VALID_ROWS, count=1),
            matrix(VALID_ROWS[0], VALID_ROWS[0], VALID_ROWS[1]),
            matrix(
                VALID_ROWS[0],
                "| Backend-only path | workflow | `backend/tests/example_test.ts` |",
            ),
            matrix(VALID_ROWS[0], "| Backend-only path | backend |  |"),
            matrix(
                VALID_ROWS[0],
                VALID_ROWS[1],
                "| Unknown scenario | backend | `backend/tests/example_test.ts` |",
                count=3,
            ),
        )
        for document in invalid:
            with self.subTest(document=document):
                with self.assertRaises(ValueError):
                    self.validate(document)

    def test_repository_gate_pins_change_matrix_and_approved_sha(self) -> None:
        command = json.loads(Path("package.json").read_text())["scripts"][
            "e2e:traceability"
        ]
        self.assertIn("--change issue-89-generic-zoning-parameters", command)
        self.assertIn("--matrix docs/issue-89-scenario-traceability.md", command)
        self.assertIn(f"--approved-sha {APPROVED_SHA}", command)


if __name__ == "__main__":
    unittest.main()

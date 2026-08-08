from __future__ import annotations

import unittest

from neo_dev_webhook.tests.test_e2e_review_cycle_one import FEATURE, SPEC


class CompleteGherkinArgumentTests(unittest.TestCase):
    def validate(self, feature: str):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping

        return validate_structured_mapping(
            {"openspec/changes/issue-42/specs/catalog/spec.md": SPEC},
            {"e2e/features/catalog.feature": feature},
            require_all=True,
        )

    def test_scenario_outline_examples_are_rejected(self):
        outline = FEATURE.replace(
            "Scenario: Catalog products are visible",
            "Scenario Outline: Catalog products are visible",
        ).replace("products exist", "<product> exists")
        outline += """
    Examples:
      | product |
      | lamp    |
"""
        with self.assertRaisesRegex(ValueError, "Examples"):
            self.validate(outline)

    def test_multiple_tagged_examples_blocks_are_rejected(self):
        outline = FEATURE.replace(
            "Scenario: Catalog products are visible",
            "Scenario Outline: Catalog products are visible",
        )
        outline += """
    @first
    Examples: first set
      | product |
      | lamp    |

    @second @smoke
    Examples: second set
      | product |
      | switch  |
"""
        with self.assertRaisesRegex(ValueError, "Examples"):
            self.validate(outline)

    def test_step_data_table_is_rejected(self):
        feature = FEATURE.replace(
            "  Given products exist",
            """  Given products exist
    | product | state |
    | lamp    | new   |""",
        )
        with self.assertRaisesRegex(ValueError, "data table"):
            self.validate(feature)

    def test_step_doc_strings_are_rejected(self):
        for delimiter in ('"""', "```"):
            feature = FEATURE.replace(
                "  Given products exist",
                f"""  Given products exist
    {delimiter}application/json
    {{"product": "lamp"}}
    {delimiter}""",
            )
            with self.subTest(delimiter=delimiter), self.assertRaisesRegex(
                ValueError, "doc string"
            ):
                self.validate(feature)

    def test_plain_product_scenario_remains_valid(self):
        self.assertEqual(
            self.validate(FEATURE),
            {"status": "passed", "required": 1, "mapped": 1},
        )

    def test_infrastructure_tracer_without_arguments_remains_valid(self):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping

        tracer = """@infrastructure
Feature: Runtime tracer
  Scenario: Runtime is reachable
    Given the isolated runtime exists
    Then the frontend and backend are reachable
"""
        self.assertEqual(
            validate_structured_mapping(
                {}, {"e2e/features/runtime-tracer.feature": tracer}
            ),
            {"status": "passed", "required": 0, "mapped": 0},
        )


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import unittest

from neo_dev_webhook.tests.test_e2e_review_cycle_one import FEATURE, SPEC


class CompleteGherkinInventoryTests(unittest.TestCase):
    def validate(self, feature: str):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping
        return validate_structured_mapping(
            {"openspec/changes/issue-42/specs/catalog/spec.md": SPEC},
            {"e2e/features/catalog.feature": feature}, require_all=True,
        )

    def test_unreferenced_scenario_is_rejected(self):
        feature = FEATURE + """
Scenario: Hidden executable behavior
  Given an unapproved state exists
  Then an unapproved result occurs
"""
        with self.assertRaisesRegex(ValueError, "unreferenced"):
            self.validate(feature)

    def test_unreferenced_scenario_outline_is_rejected(self):
        feature = FEATURE + """
Scenario Outline: Hidden executable examples
  Given product <name> exists
  Then product <name> is visible
Examples:
  | name |
  | lamp |
"""
        with self.assertRaisesRegex(ValueError, "unreferenced"):
            self.validate(feature)

    def test_background_steps_are_rejected_as_unmapped_behavior(self):
        feature = """Feature: Catalog
  Background:
    Given an unapproved shared state exists
""" + FEATURE
        with self.assertRaisesRegex(ValueError, "Background"):
            self.validate(feature)

    def test_malformed_infrastructure_tags_and_classification_are_rejected(self):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping
        tracer = """Feature: Tracer
  Scenario: Runtime is reachable
    Given the runtime exists
    Then it is reachable
"""
        malformed = [
            "@Infrastructure\n" + tracer,
            "@infrastructure-extra\n" + tracer,
            "@infrastructure @product\n" + tracer,
            tracer.replace("Scenario:", "@infrastructure\n  Scenario:"),
        ]
        for feature in malformed:
            with self.subTest(feature=feature), self.assertRaisesRegex(
                    ValueError, "infrastructure|classification|tag"):
                validate_structured_mapping({}, {"e2e/features/tracer.feature": feature})

    def test_infrastructure_and_product_behavior_cannot_be_mixed(self):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping
        mixed = "@infrastructure\nFeature: Mixed\n" + FEATURE
        with self.assertRaisesRegex(ValueError, "mixed|infrastructure"):
            validate_structured_mapping(
                {"openspec/changes/issue-42/specs/catalog/spec.md": SPEC},
                {"e2e/features/mixed.feature": mixed}, require_all=True,
            )

    def test_explicit_non_product_infrastructure_feature_is_permitted(self):
        from neo_dev_webhook.scenario_traceability import validate_structured_mapping
        tracer = """@infrastructure
Feature: Runtime tracer
  Scenario: Runtime is reachable
    Given the isolated runtime exists
    Then the frontend and backend are reachable
"""
        self.assertEqual(validate_structured_mapping(
            {}, {"e2e/features/runtime-tracer.feature": tracer}),
            {"status": "passed", "required": 0, "mapped": 0})


if __name__ == "__main__":
    unittest.main()

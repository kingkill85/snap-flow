import unittest

from neo_dev_webhook.operator_commands import (
    classify_command,
    finalize_handoff,
    render_available_commands,
)


SPEC_SHA = "a" * 40
IMPLEMENTATION_SHA = "b" * 40


class OperatorCommandsTest(unittest.TestCase):
    def assert_section(self, state, sha, expected_commands):
        rendered = render_available_commands(state, exact_sha=sha)
        self.assertTrue(rendered.startswith("## Available commands\n"))
        self.assertEqual(rendered, rendered.rstrip())
        command_lines = [line.split(" — ", 1)[0][3:-1]
                         for line in rendered.splitlines() if line.startswith("- `")]
        self.assertEqual(command_lines, expected_commands)

    def test_specification_ready_has_exact_legal_command_set(self):
        self.assert_section("specification_ready", SPEC_SHA, [
            f"/approve-spec {SPEC_SHA}", "/revise-spec <bounded request>", "/cancel",
        ])

    def test_implementation_verified_has_exact_legal_command_set(self):
        self.assert_section("implementation_verified", IMPLEMENTATION_SHA, [
            f"/accept {IMPLEMENTATION_SHA}", "/fix <bounded request>",
            "/revise-spec <bounded request>", "/cancel",
        ])

    def test_accepted_has_exact_legal_command_set(self):
        self.assert_section("accepted", None, [
            "/merge", "/fix <bounded request>", "/revise-spec <bounded request>", "/cancel",
        ])

    def test_input_and_blocker_states_only_render_legal_actions(self):
        self.assert_section("needs_input", None, ["/revise-spec <bounded request>", "/cancel"])
        self.assert_section("blocked", None, ["/cancel"])

    def test_governed_literals_reject_legacy_and_sha_less_forms(self):
        self.assertEqual(classify_command(f"/accept {IMPLEMENTATION_SHA}"), "accept")
        self.assertEqual(classify_command("/revise-spec bound the retry scenario"), "revise-spec")
        self.assertEqual(classify_command("/fix repair the verified retry race"), "fix")
        self.assertEqual(classify_command("/merge"), "merge")
        self.assertEqual(classify_command("/cancel"), "cancel")
        for invalid in ("/revise old spelling", "/accept", "/accept deadbeef", "/cancel now"):
            with self.subTest(invalid=invalid):
                self.assertIsNone(classify_command(invalid))

    def test_bounded_requests_enforce_the_shared_limit(self):
        self.assertEqual(classify_command("/fix " + "x" * 4000), "fix")
        self.assertIsNone(classify_command("/fix " + "x" * 4001))

    def test_finalizer_guarantees_the_command_section_is_last(self):
        rendered = finalize_handoff("Verified specification.\n", "specification_ready",
                                     exact_sha=SPEC_SHA)
        self.assertTrue(rendered.startswith("Verified specification.\n\n"))
        self.assertTrue(rendered.endswith(render_available_commands(
            "specification_ready", exact_sha=SPEC_SHA,
        )))


if __name__ == "__main__":
    unittest.main()

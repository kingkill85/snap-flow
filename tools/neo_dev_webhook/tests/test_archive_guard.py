import json
import os
import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
GUARD = ROOT / "tools" / "openspec_archive_guard.py"


class ArchiveGuardTest(unittest.TestCase):
    @staticmethod
    def run_guard(root, env=None):
        return subprocess.run(
            ["python3", str(GUARD), "demo", "--root", str(root)],
            capture_output=True,
            text=True,
            env=env,
        )

    def test_unsynced_delta_blocks_archive_and_synced_delta_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            delta.write_text("## ADDED Requirements\n\n### Requirement: One\nText\n", encoding="utf-8")
            main.write_text("## Requirements\n", encoding="utf-8")
            failed = subprocess.run(["python3", str(GUARD), "demo", "--root", str(root)], capture_output=True, text=True)
            self.assertNotEqual(failed.returncode, 0)
            main.write_text("## Requirements\n\n### Requirement: One\nText\n", encoding="utf-8")
            passed = subprocess.run(["python3", str(GUARD), "demo", "--root", str(root)], capture_output=True, text=True)
            self.assertEqual(passed.returncode, 0, passed.stderr)

    def test_generated_archive_skill_requires_guard_without_override(self):
        text = (ROOT / ".agents/skills/openspec-archive-change/SKILL.md").read_text(encoding="utf-8")
        self.assertIn("tools/openspec_archive_guard.py", text)
        self.assertIn("openspec validate", text)
        self.assertIn("--strict", text)
        self.assertNotIn("--allow-no-delta", text)
        self.assertIn("status JSON", text)
        self.assertNotIn("Archive without syncing", text)

    def test_all_delta_operations_must_be_synced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            delta.write_text(
                "## ADDED Requirements\n\n### Requirement: Added\nNew text\n\n"
                "## MODIFIED Requirements\n\n### Requirement: Changed\nNew changed text\n\n"
                "## REMOVED Requirements\n\n### Requirement: Removed\nOld text\n\n"
                "## RENAMED Requirements\n\n- FROM: `Old name`\n- TO: `New name`\n",
                encoding="utf-8",
            )
            main.write_text(
                "## Requirements\n\n### Requirement: Added\nNew text\n\n"
                "### Requirement: Changed\nNew changed text\n\n"
                "### Requirement: New name\nRename text\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                ["python3", str(GUARD), "demo", "--root", str(root)],
                capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_removed_and_renamed_requirements_block_when_unsynced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            delta.write_text(
                "## REMOVED Requirements\n\n### Requirement: Removed\nOld text\n\n"
                "## RENAMED Requirements\n\n- FROM: `Old name`\n- TO: `New name`\n",
                encoding="utf-8",
            )
            main.write_text(
                "## Requirements\n\n### Requirement: Removed\nOld text\n\n"
                "### Requirement: Old name\nRename text\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                ["python3", str(GUARD), "demo", "--root", str(root)],
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("still present", result.stderr)
            self.assertIn("rename", result.stderr)

    def test_added_requirement_with_stale_extra_scenario_is_unsynced(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            delta.write_text(
                "## ADDED Requirements\n\n### Requirement: Exact\nCurrent text\n\n"
                "#### Scenario: Current\n- **WHEN** current\n- **THEN** pass\n",
                encoding="utf-8",
            )
            main.write_text(
                "## Requirements\n\n### Requirement: Exact\nCurrent text\n\n"
                "#### Scenario: Current\n- **WHEN** current\n- **THEN** pass\n\n"
                "#### Scenario: Stale\n- **WHEN** stale\n- **THEN** must not pass\n",
                encoding="utf-8",
            )
            result = subprocess.run(
                ["python3", str(GUARD), "demo", "--root", str(root)],
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Exact", result.stderr)


    def test_malformed_or_unknown_delta_operations_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            for content in (
                "## RENAMED Requirements\n\n- FROM: `Old name`\n",
                "## CHANGED Requirements\n\n### Requirement: One\nText\n",
                "## ADDED Requirements\n\nnot a requirement block\n",
            ):
                delta.write_text(content, encoding="utf-8")
                result = subprocess.run(
                    ["python3", str(GUARD), "demo", "--root", str(root)],
                    capture_output=True, text=True,
                )
                self.assertNotEqual(result.returncode, 0, content)
                self.assertIn("malformed", result.stderr.lower())

    def test_mixed_case_unknown_operation_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            main.write_text("### Requirement: Good\nText\n", encoding="utf-8")
            delta.write_text(
                "## ADDED Requirements\n\n### Requirement: Good\nText\n\n"
                "## Changed Requirements\n\n### Requirement: Hidden\nUnsynced\n",
                encoding="utf-8",
            )
            result = self.run_guard(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("unknown", result.stderr.lower())

    def test_duplicate_sections_and_cross_operation_names_fail_closed(self):
        variants = (
            "## ADDED Requirements\n\n### Requirement: Good\nText\n\n"
            "## ADDED Requirements\n\n### Requirement: Good\nText\n",
            "## ADDED Requirements\n\n### Requirement: Good\nText\n\n"
            "## MODIFIED Requirements\n\n### Requirement: Good\nText\n",
        )
        for content in variants:
            with self.subTest(content=content), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                delta = root / "openspec/changes/demo/specs/example/spec.md"
                main = root / "openspec/specs/example/spec.md"
                delta.parent.mkdir(parents=True)
                main.parent.mkdir(parents=True)
                main.write_text("### Requirement: Good\nText\n", encoding="utf-8")
                delta.write_text(content, encoding="utf-8")
                result = self.run_guard(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("duplicate", result.stderr.lower())

    def test_no_delta_parses_openspec_status_and_requires_specs_skipped(self):
        for status, expected in (("done", 1), ("skipped", 0)):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                (root / "openspec/changes/demo").mkdir(parents=True)
                binary = root / "bin"
                binary.mkdir()
                payload = {
                    "artifacts": [{"id": "specs", "status": status}],
                    "artifactPaths": {"specs": {"existingOutputPaths": []}},
                }
                npm = binary / "npm"
                npm.write_text(
                    "#!/usr/bin/env python3\nimport json\nprint(" + repr(json.dumps(payload)) + ")\n",
                    encoding="utf-8",
                )
                npm.chmod(0o755)
                env = os.environ.copy()
                env["PATH"] = str(binary) + os.pathsep + env.get("PATH", "")
                result = self.run_guard(root, env=env)
                self.assertEqual(result.returncode, expected, result.stderr)

    def test_unknown_level2_variants_fail_closed_even_with_valid_section(self):
        variants = ("CHANGED", "CHANGED Requirement", "ADDED Requirement", "ADDED Requrements")
        for heading in variants:
            with self.subTest(heading=heading), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                delta = root / "openspec/changes/demo/specs/example/spec.md"
                main = root / "openspec/specs/example/spec.md"
                delta.parent.mkdir(parents=True)
                main.parent.mkdir(parents=True)
                main.write_text("### Requirement: Good\nText\n", encoding="utf-8")
                delta.write_text(
                    "## ADDED Requirements\n\n### Requirement: Good\nText\n\n"
                    f"## {heading}\n\n### Requirement: Hidden\nUnsynced\n",
                    encoding="utf-8",
                )
                result = self.run_guard(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("unknown or malformed", result.stderr.lower())

    def test_missing_space_operation_heading_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            main.write_text("### Requirement: Good\nText\n", encoding="utf-8")
            delta.write_text(
                "## ADDED Requirements\n\n### Requirement: Good\nText\n\n"
                "##CHANGED Requirements\n\n### Requirement: Hidden\nUnsynced\n",
                encoding="utf-8",
            )
            result = self.run_guard(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("unknown or malformed", result.stderr.lower())

    def test_no_space_valid_operation_cannot_hide_unsynced_requirement(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            main.write_text("### Requirement: Good\nCurrent\n", encoding="utf-8")
            delta.write_text(
                "##ADDED Requirements\n\n### Requirement: Hidden\nUnsynced\n\n"
                "## MODIFIED Requirements\n\n### Requirement: Good\nCurrent\n",
                encoding="utf-8",
            )
            result = self.run_guard(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("whitespace after ##", result.stderr)

    def test_commonmark_indented_operation_headings_are_parsed(self):
        for spaces in (1, 2, 3):
            with self.subTest(spaces=spaces), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                delta = root / "openspec/changes/demo/specs/example/spec.md"
                main = root / "openspec/specs/example/spec.md"
                delta.parent.mkdir(parents=True)
                main.parent.mkdir(parents=True)
                main.write_text("### Requirement: Good\nText\n", encoding="utf-8")
                indent = " " * spaces
                delta.write_text(
                    f"{indent}## ADDED Requirements\n\n### Requirement: Good\nText\n",
                    encoding="utf-8",
                )
                result = self.run_guard(root)
                self.assertEqual(result.returncode, 0, result.stderr)

    def test_commonmark_indented_hidden_operations_fail_closed(self):
        for spaces in (1, 2, 3):
            with self.subTest(spaces=spaces), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                delta = root / "openspec/changes/demo/specs/example/spec.md"
                main = root / "openspec/specs/example/spec.md"
                delta.parent.mkdir(parents=True)
                main.parent.mkdir(parents=True)
                main.write_text("### Requirement: Good\nCurrent\n", encoding="utf-8")
                indent = " " * spaces
                delta.write_text(
                    f"{indent}## MODIFIED Requirements\n\n### Requirement: Hidden\nUnsynced\n\n"
                    "## ADDED Requirements\n\n### Requirement: Good\nCurrent\n",
                    encoding="utf-8",
                )
                result = self.run_guard(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Hidden", result.stderr)

    def test_nested_capability_paths_are_all_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            top_delta = root / "openspec/changes/demo/specs/top/spec.md"
            nested_delta = root / "openspec/changes/demo/specs/identity/user-auth/spec.md"
            top_main = root / "openspec/specs/top/spec.md"
            nested_main = root / "openspec/specs/identity/user-auth/spec.md"
            for path in (top_delta, nested_delta, top_main, nested_main):
                path.parent.mkdir(parents=True, exist_ok=True)
            top_delta.write_text("## ADDED Requirements\n\n### Requirement: Top\nCurrent\n", encoding="utf-8")
            top_main.write_text("### Requirement: Top\nCurrent\n", encoding="utf-8")
            nested_delta.write_text("## ADDED Requirements\n\n### Requirement: Nested\nCurrent\n", encoding="utf-8")
            nested_main.write_text("### Requirement: Nested\nStale\n", encoding="utf-8")
            failed = self.run_guard(root)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("identity/user-auth/spec.md", failed.stderr)
            nested_main.write_text("### Requirement: Nested\nCurrent\n", encoding="utf-8")
            passed = self.run_guard(root)
            self.assertEqual(passed.returncode, 0, passed.stderr)

    def test_content_outside_operations_and_duplicate_purpose_fail_closed(self):
        variants = (
            "### Requirement: Orphan hidden delta\nUnsynced\n\n"
            "## ADDED Requirements\n\n### Requirement: Good\nText\n",
            "## Purpose\n\n### Requirement: Hidden in purpose\nUnsynced\n\n"
            "## ADDED Requirements\n\n### Requirement: Good\nText\n",
            "## Purpose\nOne\n\n## Purpose\nTwo\n\n"
            "## ADDED Requirements\n\n### Requirement: Good\nText\n",
        )
        for content in variants:
            with self.subTest(content=content), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                delta = root / "openspec/changes/demo/specs/example/spec.md"
                main = root / "openspec/specs/example/spec.md"
                delta.parent.mkdir(parents=True)
                main.parent.mkdir(parents=True)
                delta.write_text(content, encoding="utf-8")
                main.write_text("### Requirement: Good\nText\n", encoding="utf-8")
                result = self.run_guard(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("malformed", result.stderr.lower())

    def test_nested_commonmark_requirement_content_in_purpose_fails_closed(self):
        invalid_bodies = (
            "> ### Requirement: Hidden\n> Unsynced\n",
            "- > ### Requirement: Hidden\n  > Unsynced\n",
            "1. - FROM: `Old`\n   - TO: `New`\n",
            "> ## ADDED Requirements\n> ### Requirement: Hidden\n",
            "    ### Requirement: Code-like hidden requirement\n",
        )
        for purpose in invalid_bodies:
            with self.subTest(purpose=purpose), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                delta = root / "openspec/changes/demo/specs/example/spec.md"
                main = root / "openspec/specs/example/spec.md"
                delta.parent.mkdir(parents=True)
                main.parent.mkdir(parents=True)
                main.write_text("### Requirement: Good\nCurrent\n", encoding="utf-8")
                delta.write_text(
                    "## Purpose\n" + purpose + "\n"
                    "## ADDED Requirements\n\n### Requirement: Good\nCurrent\n",
                    encoding="utf-8",
                )
                result = self.run_guard(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Purpose", result.stderr)

        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            delta = root / "openspec/changes/demo/specs/example/spec.md"
            main = root / "openspec/specs/example/spec.md"
            delta.parent.mkdir(parents=True)
            main.parent.mkdir(parents=True)
            main.write_text("### Requirement: Good\nCurrent\n", encoding="utf-8")
            delta.write_text(
                "## Purpose\n- Explain the workflow\n> Additional context only\n\n"
                "## ADDED Requirements\n\n### Requirement: Good\nCurrent\n",
                encoding="utf-8",
            )
            result = self.run_guard(root)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_duplicate_normalized_main_requirements_fail_closed(self):
        duplicates = (("Good", "Good"), ("Good", "good"), ("Good  name", "Good name"), ("Caf\u00e9 access", "Cafe\u0301 access"))
        for first, second in duplicates:
            with self.subTest(first=first, second=second), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory)
                delta = root / "openspec/changes/demo/specs/example/spec.md"
                main = root / "openspec/specs/example/spec.md"
                delta.parent.mkdir(parents=True)
                main.parent.mkdir(parents=True)
                delta.write_text(
                    f"## ADDED Requirements\n\n### Requirement: {second}\nCurrent\n",
                    encoding="utf-8",
                )
                main.write_text(
                    f"### Requirement: {first}\nStale\n\n### Requirement: {second}\nCurrent\n",
                    encoding="utf-8",
                )
                result = self.run_guard(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("duplicate normalized requirement", result.stderr.lower())


if __name__ == "__main__":
    unittest.main()

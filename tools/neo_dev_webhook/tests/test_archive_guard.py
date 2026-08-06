import pathlib
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[3]
GUARD = ROOT / "tools" / "openspec_archive_guard.py"


class ArchiveGuardTest(unittest.TestCase):
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
        self.assertIn("--allow-no-delta", text)
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

    def test_no_delta_requires_explicit_validated_skip_flag(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            change = root / "openspec/changes/demo"
            change.mkdir(parents=True)
            denied = subprocess.run(
                ["python3", str(GUARD), "demo", "--root", str(root)],
                capture_output=True, text=True,
            )
            self.assertNotEqual(denied.returncode, 0)
            allowed = subprocess.run(
                ["python3", str(GUARD), "demo", "--root", str(root), "--allow-no-delta"],
                capture_output=True, text=True,
            )
            self.assertEqual(allowed.returncode, 0, allowed.stderr)


if __name__ == "__main__":
    unittest.main()

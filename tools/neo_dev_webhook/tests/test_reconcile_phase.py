import json
import pathlib
import subprocess
import tempfile
import unittest

from neo_dev_webhook.deploy.reconcile_phase import (
    PHASE_TO_LABEL,
    ReconciliationError,
    reconcile_phase,
)


class FakeGh:
    def __init__(self, labels, *, mutation_fails=False, verification_labels=None):
        self.labels = list(labels)
        self.mutation_fails = mutation_fails
        self.verification_labels = verification_labels
        self.fetches = 0

    def __call__(self, command, **kwargs):
        if "PATCH" in command:
            if self.mutation_fails:
                return subprocess.CompletedProcess(command, 1, "", "mutation rejected")
            self.labels = json.loads(kwargs["input"])["labels"]
            return subprocess.CompletedProcess(command, 0, "{}", "")
        self.fetches += 1
        labels = (self.verification_labels
                  if self.fetches > 1 and self.verification_labels is not None
                  else self.labels)
        return subprocess.CompletedProcess(command, 0, json.dumps(labels), "")


class ReconcilePhaseTest(unittest.TestCase):
    def test_complete_current_phase_mapping(self):
        self.assertEqual(PHASE_TO_LABEL, {
            "awaiting_input": "needs-input",
            "awaiting_spec_approval": "needs-approval",
            "awaiting_privileged_approval": "needs-approval",
            "awaiting_merge_approval": "needs-approval",
            "implementation_in_progress": "in-progress",
            "ready_for_review": "ready-for-review",
            "blocked": "blocked",
            "non_convergent": "blocked",
        })

    def test_required_phase_mappings(self):
        for phase, expected in (("awaiting_spec_approval", "needs-approval"),
                                ("ready_for_review", "ready-for-review")):
            with self.subTest(phase=phase):
                fake = FakeGh(["neo-dev"])
                result = reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                                         phase=phase, runner=fake)
                self.assertEqual(result["phase_label"], expected)
                self.assertEqual(fake.labels, ["neo-dev", expected])

    def test_replaces_contradictory_labels_and_preserves_non_phase_labels(self):
        fake = FakeGh(["neo-dev", "bug", "blocked", "needs-input"])
        reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                        phase="implementation_in_progress", runner=fake)
        self.assertEqual(fake.labels, ["neo-dev", "bug", "in-progress"])

    def test_mutation_and_verification_fail_closed(self):
        with self.assertRaisesRegex(ReconciliationError, "mutation rejected"):
            reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                            phase="ready_for_review",
                            runner=FakeGh(["neo-dev"], mutation_fails=True))
        with self.assertRaisesRegex(ReconciliationError, "verification failed"):
            reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                            phase="ready_for_review",
                            runner=FakeGh(["neo-dev"], verification_labels=["neo-dev", "blocked"]))

    def test_cli_returns_nonzero_when_gh_fails(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/reconcile_phase.py"
        with tempfile.TemporaryDirectory() as directory:
            gh = pathlib.Path(directory) / "gh"
            gh.write_text("#!/bin/sh\necho unavailable >&2\nexit 1\n")
            gh.chmod(0o755)
            result = subprocess.run(
                [str(script), "--repo", "kingkill85/snap-flow", "--issue", "84",
                 "--phase", "awaiting_spec_approval", "--gh-executable", str(gh)],
                capture_output=True, text=True,
            )
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "")
        self.assertIn("phase reconciliation failed", result.stderr)


if __name__ == "__main__":
    unittest.main()

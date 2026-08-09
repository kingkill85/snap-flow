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
    def __init__(self, labels, *, state="open", is_pr=False, mutation_fails=False,
                 verification_labels=None, concurrent_label=None):
        self.labels = list(labels)
        self.state = state
        self.is_pr = is_pr
        self.mutation_fails = mutation_fails
        self.verification_labels = verification_labels
        self.concurrent_label = concurrent_label
        self.fetches = 0
        self.mutations = []

    def __call__(self, command, **kwargs):
        if "POST" in command or "DELETE" in command:
            self.mutations.append(command)
            if self.mutation_fails:
                return subprocess.CompletedProcess(command, 1, "", "mutation rejected")
            if self.concurrent_label and self.concurrent_label not in self.labels:
                self.labels.append(self.concurrent_label)
                self.concurrent_label = None
            if "POST" in command:
                for label in json.loads(kwargs["input"])["labels"]:
                    if label not in self.labels:
                        self.labels.append(label)
            else:
                label = command[-1].rsplit("/", 1)[-1]
                self.labels.remove(label)
            return subprocess.CompletedProcess(command, 0, "{}", "")
        self.fetches += 1
        labels = (self.verification_labels
                  if self.fetches > 1 and self.verification_labels is not None
                  else self.labels)
        body = {"state": self.state, "labels": [{"name": label} for label in labels]}
        if self.is_pr:
            body["pull_request"] = {"url": "https://example.invalid/pr"}
        return subprocess.CompletedProcess(command, 0, json.dumps(body), "")


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

    def test_replaces_contradictory_phase_labels_and_preserves_non_phase_labels(self):
        fake = FakeGh(["neo-dev", "bug", "blocked", "needs-input"])
        reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                        phase="implementation_in_progress", runner=fake)
        self.assertEqual(set(fake.labels), {"neo-dev", "bug", "in-progress"})
        self.assertTrue(all("PATCH" not in mutation for mutation in fake.mutations))

    def test_concurrent_non_phase_label_survives_mutation(self):
        fake = FakeGh(["neo-dev", "blocked"], concurrent_label="security")
        reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                        phase="ready_for_review", runner=fake)
        self.assertEqual(set(fake.labels), {"neo-dev", "security", "ready-for-review"})

    def test_exact_phase_is_an_order_independent_noop(self):
        fake = FakeGh(["ready-for-review", "bug", "neo-dev"])
        reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                        phase="ready_for_review", runner=fake)
        self.assertEqual(fake.mutations, [])

    def test_rejects_ineligible_targets_without_mutation(self):
        cases = (
            (FakeGh(["neo-dev"], state="closed"), "not open"),
            (FakeGh(["neo-dev"], is_pr=True), "pull request"),
            (FakeGh(["bug"]), "not eligible"),
        )
        for fake, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(
                ReconciliationError, message
            ):
                reconcile_phase(repository="kingkill85/snap-flow", issue=84,
                                phase="ready_for_review", runner=fake)
            self.assertEqual(fake.mutations, [])

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

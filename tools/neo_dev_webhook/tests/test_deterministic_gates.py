from __future__ import annotations

import unittest


class Executor:
    def __init__(self, failing: str | None = None, branch="feature/issue-6", remote_sha="a" * 40):
        self.failing = failing
        self.branch = branch
        self.remote_sha = remote_sha
        self.calls = []

    def run(self, argv, *, timeout):
        self.calls.append((tuple(argv), timeout))
        if argv[0] == "gate" and argv[2] == self.failing:
            raise RuntimeError(f"{self.failing} failed")
        if argv[0] == "git" and "rev-parse" in argv:
            return "a" * 40 + "\n"
        if argv[0] == "git" and "branch" in argv:
            return self.branch + "\n"
        if argv[0] == "git" and "ls-remote" in argv:
            return f"{self.remote_sha}\trefs/heads/{self.branch}\n"
        if argv[0] == "git" and "status" in argv:
            return ""
        if argv[0] == "git" and "diff" in argv:
            return "tools/neo_dev_webhook/project_control.py\n"
        return f"{argv[-1]} ok\n"


class DeterministicGateTests(unittest.TestCase):
    def test_openspec_verify_rejects_incomplete_status(self):
        from tools.neo_dev_webhook.gate_exec import verify_openspec_status
        with self.assertRaisesRegex(RuntimeError, "incomplete"):
            verify_openspec_status({"isPlanningComplete": False, "isComplete": False})

    def test_wrong_branch_or_unsynced_live_head_blocks_before_gate_execution(self):
        from tools.neo_dev_webhook.deterministic_gates import run_gates
        target = type("Target", (), {
            "worktree": "/workspace/snap-flow-issue-6", "branch": "feature/issue-6",
        })()
        for executor in (Executor(branch="wrong"), Executor(remote_sha="b" * 40)):
            with self.assertRaisesRegex(RuntimeError, "branch|synced"):
                run_gates(executor, target, "a" * 40, "9" * 40,
                          [{"state": "SUCCESS", "sha": "a" * 40}])
            self.assertFalse(any(call[0][0] == "gate" for call in executor.calls))

    def test_every_required_gate_failure_blocks_and_success_persists_provenance(self):
        from tools.neo_dev_webhook.deterministic_gates import REQUIRED_GATES, run_gates
        target = type("Target", (), {
            "worktree": "/workspace/snap-flow-issue-6", "branch": "feature/issue-6",
        })()
        for gate in REQUIRED_GATES:
            with self.subTest(gate=gate), self.assertRaisesRegex(RuntimeError, gate):
                run_gates(Executor(gate), target, "a" * 40, "9" * 40,
                          [{"state": "SUCCESS", "sha": "a" * 40}])
        result = run_gates(Executor(), target, "a" * 40, "9" * 40,
                           [{"state": "SUCCESS", "sha": "a" * 40}])
        self.assertEqual(set(result["gates"]), set(REQUIRED_GATES))
        for gate, record in result["gates"].items():
            self.assertEqual(record["status"], "passed")
            self.assertEqual(record["head_sha"], "a" * 40)
            self.assertIn("command", record)
            self.assertIn("output_sha256", record)
            self.assertNotEqual(record["command"], ["passed"])


if __name__ == "__main__":
    unittest.main()

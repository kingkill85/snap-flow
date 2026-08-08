from __future__ import annotations

import json
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
        if argv[0] == "gate":
            from tools.neo_dev_webhook.deterministic_gates import expected_gate_commands
            plan = expected_gate_commands(argv[2],
                ["tools/neo_dev_webhook/project_control.py"], argv[1], "issue-6", argv[3])
            return json.dumps({"gate": argv[2], "head_sha": "a" * 40,
                "approved_spec_sha": argv[3], "result": {}, "commands": [
                    {**item, "exit_code": 0, "stdout_sha256": "0" * 64,
                     "stderr_sha256": "1" * 64, "observed_at": "2026-08-08T00:00:00Z",
                     "head_sha": "a" * 40, "approved_spec_sha": argv[3]}
                    for item in plan]})
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
        if argv[0] == "git" and "ls-files" in argv:
            return "openspec/changes/issue-6/proposal.md\n"
        return f"{argv[-1]} ok\n"


class DeterministicGateTests(unittest.TestCase):
    def test_nested_command_provenance_rejects_omission_substitution_duplicate_partial_and_sha(self):
        from tools.neo_dev_webhook.deterministic_gates import validate_gate_execution
        expected = [{"argv": ["python3", "-m", "unittest", "focused"],
                     "cwd": "/workspace/snap-flow-issue-6"},
                    {"argv": ["python3", "-m", "unittest", "full"],
                     "cwd": "/workspace/snap-flow-issue-6"}]
        def record(plan):
            return {"head_sha": "a" * 40, "approved_spec_sha": "9" * 40,
                    "commands": [{**item, "exit_code": 0,
                                  "stdout_sha256": "0" * 64, "stderr_sha256": "1" * 64,
                                  "observed_at": "2026-08-08T00:00:00Z",
                                  "head_sha": "a" * 40, "approved_spec_sha": "9" * 40}
                                 for item in plan]}
        mutations = [expected[:1],
                     [{**expected[0], "argv": ["sh", "-c", "true"]}, expected[1]],
                     [expected[0], expected[0]],
                     [expected[0], {**expected[1], "exit_code": 1}],
                     expected]
        for index, plan in enumerate(mutations):
            value = record(plan) if index != 3 else {"head_sha": "a" * 40,
                "approved_spec_sha": "9" * 40, "commands": [
                    {**expected[0], "exit_code": 0, "stdout_sha256": "0" * 64,
                     "stderr_sha256": "1" * 64, "observed_at": "2026-08-08T00:00:00Z",
                     "head_sha": "a" * 40, "approved_spec_sha": "9" * 40},
                    {**expected[1], "exit_code": 1, "stdout_sha256": "0" * 64,
                     "stderr_sha256": "1" * 64, "observed_at": "2026-08-08T00:00:00Z",
                     "head_sha": "a" * 40, "approved_spec_sha": "9" * 40}]}
            if index == 4:
                value["head_sha"] = "b" * 40
            with self.subTest(index=index), self.assertRaises(ValueError):
                validate_gate_execution(value, expected, "a" * 40, "9" * 40)

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
                          [check_run()])
            self.assertFalse(any(call[0][0] == "gate" for call in executor.calls))

    def test_every_required_gate_failure_blocks_and_success_persists_provenance(self):
        from tools.neo_dev_webhook.deterministic_gates import REQUIRED_GATES, run_gates
        target = type("Target", (), {
            "worktree": "/workspace/snap-flow-issue-6", "branch": "feature/issue-6",
        })()
        for gate in REQUIRED_GATES:
            with self.subTest(gate=gate), self.assertRaisesRegex(RuntimeError, gate):
                run_gates(Executor(gate), target, "a" * 40, "9" * 40,
                          [check_run()])
        result = run_gates(Executor(), target, "a" * 40, "9" * 40,
                           [check_run()])
        self.assertEqual(set(result["gates"]), set(REQUIRED_GATES))
        for gate, record in result["gates"].items():
            self.assertEqual(record["status"], "passed")
            self.assertEqual(record["head_sha"], "a" * 40)
            self.assertTrue(record["commands"])
            self.assertNotEqual(record["commands"][0]["argv"], ["passed"])
        self.assertNotEqual(result["gates"]["focused_tests"]["commands"],
                            result["gates"]["full_tests"]["commands"])


def check_run(sha="a" * 40):
    return {"id": 42, "name": "E2E (Cucumber + Playwright)", "head_sha": sha,
            "status": "completed", "conclusion": "success", "state": "SUCCESS"}


if __name__ == "__main__":
    unittest.main()

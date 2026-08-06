import json
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

from neo_dev_webhook.automation import TaskRunner
from neo_dev_webhook.codex_runtime import initial_prompt
from neo_dev_webhook.project_control import (
    CODEX_RUNTIME_PATH,
    Controller,
    InMemoryResolutionStore,
    Registry,
)
from neo_dev_webhook.remote_adapter import (
    IDENTITY_FILE,
    KNOWN_HOSTS_FILE,
    REMOTE_CONTROLLER,
    main as remote_main,
)


REPOSITORY = "kingkill85/snap-flow"
KEY = "12345678-1234-4abc-8def-123456789abc"
TEMPLATE = {
    "repository": REPOSITORY,
    "project": "snap-flow",
    "session": "snapflow-dev",
    "repository_path": "/workspace/snap-flow",
    "worktree_root": "/workspace/snap-flow",
    "branch_prefix": "feature",
    "worker": "Codex",
}


class FakeExecutor:
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def run(self, argv, *, timeout):
        self.calls.append((tuple(argv), timeout))
        return self.outputs.pop(0) if self.outputs else ""


class GenericOrchestratorTest(unittest.TestCase):
    def test_issue_template_derives_13_and_another_number_and_preserves_77_override(self):
        registry_path = pathlib.Path(__file__).parents[1] / "controller" / "registry.v1.json"
        registry = Registry.load(registry_path)
        issue13 = registry.resolve(REPOSITORY, 13)
        issue42 = registry.resolve(REPOSITORY, 42)
        issue77 = registry.resolve(REPOSITORY, 77)
        self.assertEqual((issue13.branch, issue13.worktree, issue13.window),
                         ("feature/issue-13", "/workspace/snap-flow-issue-13", "issue-13"))
        self.assertEqual((issue42.branch, issue42.worktree, issue42.window),
                         ("feature/issue-42", "/workspace/snap-flow-issue-42", "issue-42"))
        self.assertEqual(issue77.branch, "chore/issue-77-openspec-workflow")

    def test_generic_start_fetches_main_creates_branch_worktree_and_one_window(self):
        registry = Registry((), (TEMPLATE,))
        executor = FakeExecutor([
            "", "", "", "", "feature/issue-13\n", "", "feature/issue-13\n", "",
        ])
        result = Controller(registry, InMemoryResolutionStore(), executor).execute(
            "start", REPOSITORY, 13, KEY,
        )
        argv = [call[0] for call in executor.calls]
        self.assertEqual(argv[0], ("git", "-C", "/workspace/snap-flow", "fetch", "--prune",
                                   "origin", "main"))
        self.assertIn(("git", "-C", "/workspace/snap-flow", "worktree", "add", "-b",
                       "feature/issue-13", "/workspace/snap-flow-issue-13", "origin/main"), argv)
        self.assertEqual(argv.count(("tmux", "new-window", "-d", "-t", "snapflow-dev", "-n",
                                     "issue-13", "-c", "/workspace/snap-flow-issue-13",
                                     CODEX_RUNTIME_PATH, "start", "--idempotency-key", KEY)), 1)
        self.assertEqual(result["status"], "starting")

    def test_existing_generic_worktree_is_verified_not_recreated(self):
        executor = FakeExecutor([
            "", "worktree /workspace/snap-flow-issue-13\nbranch refs/heads/feature/issue-13\n\n",
            "feature/issue-13\n", "", "feature/issue-13\n", "",
        ])
        Controller(Registry((), (TEMPLATE,)), InMemoryResolutionStore(), executor).execute(
            "start", REPOSITORY, 13, KEY,
        )
        self.assertFalse(any(call[0][3:5] == ("worktree", "add") for call in executor.calls))

    def test_remote_adapter_has_fixed_host_identity_known_hosts_and_command(self):
        run = mock.Mock(return_value=subprocess.CompletedProcess([], 0))
        self.assertEqual(remote_main([
            "start", "--repository", REPOSITORY, "--issue-number", "13",
            "--idempotency-key", KEY,
        ], run=run), 0)
        argv = run.call_args.args[0]
        self.assertEqual(argv[0], "/usr/bin/ssh")
        self.assertIn(f"UserKnownHostsFile={KNOWN_HOSTS_FILE}", argv)
        self.assertIn(IDENTITY_FILE, argv)
        self.assertEqual(argv[argv.index("dev@snapflow-dev") + 1], REMOTE_CONTROLLER)
        self.assertFalse(run.call_args.kwargs["shell"])
        for option in ("--host", "--identity", "--known-hosts", "--command"):
            with self.subTest(option=option), self.assertRaises(SystemExit):
                remote_main(["start", "--repository", REPOSITORY, "--issue-number", "13",
                             "--idempotency-key", KEY, option, "attacker"], run=run)

    def test_initial_prompt_is_issue_specific_and_spec_only(self):
        prompt = initial_prompt(REPOSITORY, 13)
        self.assertIn("Issue #13", prompt)
        self.assertIn("AGENTS.md", prompt)
        self.assertIn("openspec/config.yaml", prompt)
        self.assertIn("Create ONLY", prompt)
        self.assertIn("Draft PR", prompt)
        self.assertIn("/approve-spec <full-sha>", prompt)
        self.assertIn("Do not implement", prompt)

    def test_continuation_task_reuses_identity_and_selects_accept_archive_phase(self):
        runner = TaskRunner(script_path="/test/task.py")
        help_result = mock.Mock(stdout="title --body --max-runtime --workspace --idempotency-key")
        completed = mock.Mock(stdout='{"task_id":"same-task","durable":true}\n')
        work = {"issue_number": 13, "task_id": "same-task", "wakeups": [{
            "event": "issue_comment", "action": "created", "command": "/accept",
        }]}
        with mock.patch("subprocess.run", side_effect=[help_result, completed]) as run:
            self.assertEqual(runner.create(work, KEY), "same-task")
        body = run.call_args_list[1].args[0][4]
        self.assertIn("Current phase: archive", body)
        self.assertIn("neo-dev-project-control resume", body)
        self.assertIn(KEY, body)
        self.assertIn("Acceptance does not authorize merge", body)

    def test_deployment_manifest_keeps_concurrency_one_and_declares_both_services(self):
        path = pathlib.Path(__file__).parents[1] / "deploy" / "install-manifest.v1.json"
        document = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(document["concurrency"], 1)
        destinations = {entry["destination"] for entry in document["files"]}
        self.assertIn("/etc/systemd/system/neo-dev-webhook-receiver.service", destinations)
        self.assertIn("/etc/systemd/system/neo-dev-webhook-consumer.service", destinations)
        self.assertIn("/usr/local/bin/neo-dev-project-control", destinations)


if __name__ == "__main__":
    unittest.main()

import json
import pathlib
import tempfile
import unittest
import uuid

from neo_dev_webhook.project_control import (
    Controller,
    GovernedTarget,
    InMemoryResolutionStore,
    Registry,
    main,
)


REPOSITORY = "kingkill85/snap-flow"
KEY = "12345678-1234-4abc-8def-123456789abc"
TARGET = GovernedTarget(
    repository=REPOSITORY,
    issue_number=77,
    project="snapflow-dev",
    session="snapflow-dev",
    window="issue-77",
    worktree="/workspace/snap-flow-issue-77",
    branch="chore/issue-77-openspec-workflow",
    worker="Codex",
)


class FakeExecutor:
    def __init__(self, outputs=None):
        self.calls = []
        self.outputs = list(outputs or [])

    def run(self, argv, *, timeout):
        self.calls.append((tuple(argv), timeout))
        return self.outputs.pop(0) if self.outputs else ""


class ProjectControlTest(unittest.TestCase):
    def controller(self, outputs=None, records=(TARGET,), store=None):
        executor = FakeExecutor(outputs)
        controller = Controller(Registry(records), store or InMemoryResolutionStore(), executor)
        return controller, executor

    def test_preflight_verifies_exact_issue_77_topology_with_safe_argv(self):
        controller, executor = self.controller([
            "issue-77\n", "/workspace/snap-flow-issue-77\n",
            "chore/issue-77-openspec-workflow\n", "codex\n",
        ])
        result = controller.execute("preflight", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["governed_identity"], {"repository": REPOSITORY, "issue_number": 77})
        self.assertEqual(executor.calls, [
            (("tmux", "list-windows", "-t", "snapflow-dev", "-F", "#{window_name}"), 10.0),
            (("tmux", "display-message", "-p", "-t", "snapflow-dev:issue-77", "#{pane_current_path}"), 10.0),
            (("git", "-C", "/workspace/snap-flow-issue-77", "branch", "--show-current"), 10.0),
            (("tmux", "list-panes", "-t", "snapflow-dev:issue-77", "-F", "#{pane_current_command}"), 10.0),
        ])

    def test_start_persists_before_launch_and_uses_exact_codex_argv(self):
        events = []

        class Store(InMemoryResolutionStore):
            def bind(self, key, target):
                events.append("persist")
                return super().bind(key, target)

        class Executor(FakeExecutor):
            def run(self, argv, *, timeout):
                events.append(tuple(argv))
                return super().run(argv, timeout=timeout)

        executor = Executor(["\n", "chore/issue-77-openspec-workflow\n"])
        controller = Controller(Registry((TARGET,)), Store(), executor)
        result = controller.execute("start", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "started")
        self.assertEqual(events, [
            "persist",
            ("tmux", "list-windows", "-t", "snapflow-dev", "-F", "#{window_name}"),
            ("git", "-C", "/workspace/snap-flow-issue-77", "branch", "--show-current"),
            ("tmux", "new-window", "-d", "-t", "snapflow-dev", "-n", "issue-77", "-c",
             "/workspace/snap-flow-issue-77", "codex"),
        ])
        self.assertEqual(executor.calls[-1][1], 20.0)

    def test_retry_and_resume_preserve_original_resolution_and_identity(self):
        store = InMemoryResolutionStore()
        first, _ = self.controller([
            "\n", "chore/issue-77-openspec-workflow\n",
        ], store=store)
        first.execute("start", REPOSITORY, 77, KEY)
        retry, retry_executor = self.controller([
            "issue-77\n", "/workspace/snap-flow-issue-77\n",
            "chore/issue-77-openspec-workflow\n", "codex\n",
        ], store=store)
        result = retry.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(result["idempotency_key"], KEY)
        self.assertEqual(retry_executor.calls[-1][0],
                         ("tmux", "select-window", "-t", "snapflow-dev:issue-77"))

    def test_start_retry_after_uncertain_launch_reuses_persisted_resolution(self):
        store = InMemoryResolutionStore()
        store.bind(KEY, TARGET)
        controller, executor = self.controller([
            "\n", "chore/issue-77-openspec-workflow\n",
        ], store=store)
        result = controller.execute("start", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "started")
        self.assertEqual(executor.calls[-1][0], (
            "tmux", "new-window", "-d", "-t", "snapflow-dev", "-n", "issue-77",
            "-c", "/workspace/snap-flow-issue-77", "codex",
        ))

    def test_start_rejects_wrong_branch_before_codex_launch(self):
        controller, executor = self.controller(["\n", "main\n"])
        with self.assertRaises(RuntimeError):
            controller.execute("start", REPOSITORY, 77, KEY)
        self.assertFalse(any(call[0][:2] == ("tmux", "new-window")
                             for call in executor.calls))

    def test_fail_closed_cases_never_execute_a_process(self):
        conflicting = GovernedTarget(**{**TARGET.as_dict(), "branch": "other"})
        cases = (
            (Registry(()), InMemoryResolutionStore(), REPOSITORY, 77, KEY),
            (Registry((TARGET, TARGET)), InMemoryResolutionStore(), REPOSITORY, 77, KEY),
            (Registry((TARGET, conflicting)), InMemoryResolutionStore(), REPOSITORY, 77, KEY),
            (Registry((TARGET,)), InMemoryResolutionStore(), "KINGKILL85/snap-flow", 77, KEY),
            (Registry((TARGET,)), InMemoryResolutionStore(), REPOSITORY, 0, KEY),
            (Registry((TARGET,)), InMemoryResolutionStore(), REPOSITORY, 77, str(uuid.uuid4()).upper()),
        )
        for registry, store, repository, issue, key in cases:
            with self.subTest(repository=repository, issue=issue, key=key):
                executor = FakeExecutor()
                with self.assertRaises((ValueError, RuntimeError)):
                    Controller(registry, store, executor).execute("preflight", repository, issue, key)
                self.assertEqual(executor.calls, [])

    def test_prohibited_registry_topologies_fail_before_process(self):
        variants = (
            {"project": "other"}, {"session": "other"}, {"window": "0"},
            {"worktree": "/workspace/other"}, {"branch": "other"},
            {"worker": "devsnapflow-worker"}, {"worker": "Neo Dev"},
        )
        for change in variants:
            with self.subTest(change=change):
                bad = GovernedTarget(**{**TARGET.as_dict(), **change})
                executor = FakeExecutor()
                with self.assertRaises(ValueError):
                    Controller(Registry((bad,)), InMemoryResolutionStore(), executor).execute(
                        "preflight", REPOSITORY, 77, KEY)
                self.assertEqual(executor.calls, [])

    def test_live_mismatch_fails_before_codex_launch_or_resume(self):
        for outputs in (
            ["0\n"],
            ["issue-77\n", "/workspace/other\n"],
            ["issue-77\n", "/workspace/snap-flow-issue-77\n", "main\n"],
            ["issue-77\n", "/workspace/snap-flow-issue-77\n", "chore/issue-77-openspec-workflow\n", "python\n"],
            ["issue-77\n", "/workspace/snap-flow-issue-77\n", "chore/issue-77-openspec-workflow\n", "codex\npython\n"],
        ):
            with self.subTest(outputs=outputs):
                controller, executor = self.controller(outputs)
                with self.assertRaises(RuntimeError):
                    controller.execute("preflight", REPOSITORY, 77, KEY)
                self.assertFalse(any(call[0][:2] in (("tmux", "new-window"), ("tmux", "select-window"))
                                     for call in executor.calls))

    def test_resume_rejects_missing_persistence_or_registry_drift(self):
        controller, executor = self.controller()
        with self.assertRaises(RuntimeError):
            controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(executor.calls, [])

        store = InMemoryResolutionStore()
        store.bind(KEY, TARGET)
        drift = GovernedTarget(**{**TARGET.as_dict(), "branch": "other"})
        executor = FakeExecutor()
        with self.assertRaises((ValueError, RuntimeError)):
            Controller(Registry((drift,)), store, executor).execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(executor.calls, [])

    def test_cli_accepts_only_the_versioned_narrow_api(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry = root / "registry.json"
            state = root / "state.json"
            registry.write_text(json.dumps({"version": 1, "targets": [TARGET.as_dict()]}), encoding="utf-8")
            executor = FakeExecutor(["issue-77\n", "/workspace/snap-flow-issue-77\n",
                                     "chore/issue-77-openspec-workflow\n", "codex\n"])
            output = []
            exit_code = main([
                "preflight", "--repository", REPOSITORY, "--issue-number", "77",
                "--idempotency-key", KEY,
            ], registry_path=registry, state_path=state, executor=executor, write=output.append)
            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(output[0])["version"], 1)

            for option in ("--host", "--port", "--identity", "--project", "--session", "--window",
                           "--worktree", "--branch", "--worker", "--command", "--cwd", "--path"):
                with self.subTest(option=option):
                    with self.assertRaises(SystemExit):
                        main(["preflight", "--repository", REPOSITORY, "--issue-number", "77",
                              "--idempotency-key", KEY, option, "attacker"])

    def test_controller_artifacts_are_versioned_exact_and_non_secret(self):
        controller_dir = pathlib.Path(__file__).parents[1] / "controller"
        registry = json.loads((controller_dir / "registry.v1.json").read_text(encoding="utf-8"))
        policy = json.loads((controller_dir / "card-capability-policy.v1.json").read_text(encoding="utf-8"))
        manifest = json.loads((controller_dir / "install-manifest.v1.json").read_text(encoding="utf-8"))
        self.assertEqual(registry, {"version": 1, "targets": [TARGET.as_dict()]})
        self.assertEqual(policy["project_command_capabilities"]["allow"],
                         ["/usr/local/bin/neo-dev-project-control"])
        self.assertEqual(manifest["version"], 1)
        combined = " ".join(path.read_text(encoding="utf-8") for path in controller_dir.iterdir())
        for forbidden in ("HostName", "IdentityFile", "known_hosts", "ssh-rsa", "ssh-ed25519",
                          "private endpoint", "pinned host key"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()

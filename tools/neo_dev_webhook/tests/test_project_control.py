import json
import pathlib
import tempfile
import unittest
import uuid

from neo_dev_webhook.project_control import (
    CODEX_RUNTIME_PATH,
    CONTINUE_PROMPT,
    Controller,
    FileResolutionStore,
    GovernedTarget,
    InMemoryResolutionStore,
    Registry,
    WorkState,
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
SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
RUNTIME_START = f"{CODEX_RUNTIME_PATH} start --idempotency-key {KEY}"
RUNTIME_METADATA = f"python3\t{RUNTIME_START}\t4242\n"
APP_SERVER_CHILD = "4243 4242 node node /usr/local/bin/codex app-server --stdio\n"


def effective_mode_allows(entry, account, groups, required):
    mode = int(entry["mode"], 8)
    shift = 6 if entry["owner"] == account else 3 if entry["group"] in groups else 0
    return ((mode >> shift) & required) == required


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

    def state_store(self, phase="active", *, restart_count=0, terminal=None):
        store = InMemoryResolutionStore()
        initial = store.bind(KEY, TARGET)
        state = WorkState(
            TARGET, SESSION_ID, phase, process_generation=0,
            restart_count=restart_count, terminal=terminal,
        )
        store.save(KEY, initial, state)
        return store

    def test_preflight_verifies_exact_issue_77_topology_with_safe_argv(self):
        controller, executor = self.controller([
            "issue-77\n", "/workspace/snap-flow-issue-77\n",
            "chore/issue-77-openspec-workflow\n", RUNTIME_METADATA,
            APP_SERVER_CHILD,
        ], store=self.state_store())
        result = controller.execute("preflight", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "ready")
        self.assertEqual(result["governed_identity"], {"repository": REPOSITORY, "issue_number": 77})
        self.assertEqual(executor.calls, [
            (("tmux", "list-windows", "-t", "snapflow-dev", "-F", "#{window_name}"), 10.0),
            (("tmux", "display-message", "-p", "-t", "snapflow-dev:issue-77", "#{pane_current_path}"), 10.0),
            (("git", "-C", "/workspace/snap-flow-issue-77", "branch", "--show-current"), 10.0),
            (("tmux", "list-panes", "-t", "snapflow-dev:issue-77", "-F",
              "#{pane_current_command}\t#{pane_start_command}\t#{pane_pid}"), 10.0),
            (("ps", "-o", "pid=,ppid=,comm=,args=", "--ppid", "4242"), 10.0),
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
        self.assertEqual(result["status"], "starting")
        self.assertEqual(events, [
            "persist",
            ("tmux", "list-windows", "-t", "snapflow-dev", "-F", "#{window_name}"),
            ("git", "-C", "/workspace/snap-flow-issue-77", "branch", "--show-current"),
            ("tmux", "new-window", "-d", "-t", "snapflow-dev", "-n", "issue-77", "-c",
             "/workspace/snap-flow-issue-77", CODEX_RUNTIME_PATH, "start",
             "--idempotency-key", KEY),
        ])
        self.assertEqual(executor.calls[-1][1], 20.0)

    def test_retry_and_resume_preserve_original_resolution_and_identity(self):
        store = InMemoryResolutionStore()
        first, _ = self.controller([
            "\n", "chore/issue-77-openspec-workflow\n",
        ], store=store)
        first.execute("start", REPOSITORY, 77, KEY)
        first.observe_session(KEY, SESSION_ID)
        retry, retry_executor = self.controller([
            "issue-77\n", "/workspace/snap-flow-issue-77\n",
            "chore/issue-77-openspec-workflow\n", RUNTIME_METADATA,
            APP_SERVER_CHILD,
        ], store=store)
        result = retry.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(result["idempotency_key"], KEY)
        self.assertEqual(retry_executor.calls[-2][0], (
            "tmux", "send-keys", "-t", "snapflow-dev:issue-77", "-l", "--",
            CONTINUE_PROMPT,
        ))
        self.assertEqual(retry_executor.calls[-1][0],
                         ("tmux", "send-keys", "-t", "snapflow-dev:issue-77", "Enter"))

    def test_start_retry_never_launches_a_second_worker(self):
        store = InMemoryResolutionStore()
        initial = store.bind(KEY, TARGET)
        store.save(KEY, initial, WorkState(TARGET, phase="starting"))
        controller, executor = self.controller([
            "\n", "chore/issue-77-openspec-workflow\n",
        ], store=store)
        with self.assertRaises(RuntimeError):
            controller.execute("start", REPOSITORY, 77, KEY)
        self.assertEqual(executor.calls, [])

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
            ["issue-77\n", "/workspace/snap-flow-issue-77\n", "chore/issue-77-openspec-workflow\n", "python3\tattacker.py\t4242\n"],
            ["issue-77\n", "/workspace/snap-flow-issue-77\n", "chore/issue-77-openspec-workflow\n", RUNTIME_METADATA, "4243 4242 python3 attacker.py\n"],
            ["issue-77\n", "/workspace/snap-flow-issue-77\n", "chore/issue-77-openspec-workflow\n", RUNTIME_METADATA, APP_SERVER_CHILD + APP_SERVER_CHILD],
        ):
            with self.subTest(outputs=outputs):
                controller, executor = self.controller(outputs, store=self.state_store())
                with self.assertRaises(RuntimeError):
                    controller.execute("preflight", REPOSITORY, 77, KEY)
                self.assertFalse(any(call[0][:2] in (("tmux", "new-window"), ("tmux", "select-window"))
                                     for call in executor.calls))

    def test_resume_rejects_missing_persistence_or_registry_drift(self):
        controller, executor = self.controller()
        with self.assertRaises(RuntimeError):
            controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(executor.calls, [])

    def test_correctable_finding_steers_same_active_process_and_session(self):
        store = self.state_store()
        controller, executor = self.controller([
            "issue-77\n", "/workspace/snap-flow-issue-77\n",
            "chore/issue-77-openspec-workflow\n", RUNTIME_METADATA,
            APP_SERVER_CHILD,
        ], store=store)
        controller.observe_correctable(KEY)
        result = controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "steered")
        self.assertEqual(result["execution"]["codex_session_id"], SESSION_ID)
        self.assertEqual(executor.calls[-2:], [
            (("tmux", "send-keys", "-t", "snapflow-dev:issue-77", "-l", "--",
              CONTINUE_PROMPT), 10.0),
            (("tmux", "send-keys", "-t", "snapflow-dev:issue-77", "Enter"), 10.0),
        ])
        self.assertFalse(any("codex" in call[0] for call in executor.calls[-2:]))

    def test_exited_resumable_state_continues_exact_session(self):
        store = self.state_store()
        observer = Controller(Registry((TARGET,)), store, FakeExecutor())
        observer.observe_terminal(KEY, 0, "correctable", True)
        controller, executor = self.controller([
            "issue-77\n", "1\t4242\t\n",
            "chore/issue-77-openspec-workflow\n",
        ], store=store)
        result = controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "resuming")
        self.assertEqual(executor.calls[:3], [
            (("tmux", "list-windows", "-t", "snapflow-dev", "-F",
              "#{window_name}"), 10.0),
            (("tmux", "list-panes", "-t", "snapflow-dev:issue-77", "-F",
              "#{pane_dead}\t#{pane_pid}\t#{pane_current_path}"), 10.0),
            (("git", "-C", "/workspace/snap-flow-issue-77", "branch",
              "--show-current"), 10.0),
        ])
        self.assertFalse(any("#{pane_current_path}" in call[0]
                             and call[0][:2] == ("tmux", "display-message")
                             for call in executor.calls))
        self.assertEqual(executor.calls[-1], ((
            "tmux", "respawn-pane", "-k", "-t", "snapflow-dev:issue-77", "-c",
            "/workspace/snap-flow-issue-77", CODEX_RUNTIME_PATH, "resume",
            "--idempotency-key", KEY, "--session-id", SESSION_ID,
        ), 20.0))

    def test_exited_state_rejects_live_unrelated_python_before_respawn(self):
        store = self.state_store()
        observer = Controller(Registry((TARGET,)), store, FakeExecutor())
        observer.observe_terminal(KEY, 0, "correctable", True)
        controller, executor = self.controller([
            "issue-77\n", "0\t4242\t/workspace/snap-flow-issue-77\n",
        ], store=store)
        with self.assertRaisesRegex(RuntimeError, "live process"):
            controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertFalse(any(call[0][:2] == ("tmux", "respawn-pane")
                             for call in executor.calls))

    def test_exited_state_rejects_ambiguous_dead_panes_before_respawn(self):
        store = self.state_store()
        observer = Controller(Registry((TARGET,)), store, FakeExecutor())
        observer.observe_terminal(KEY, 0, "correctable", True)
        controller, executor = self.controller([
            "issue-77\n", "1\t4242\t\n1\t4243\t\n",
        ], store=store)
        with self.assertRaisesRegex(RuntimeError, "ambiguous"):
            controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertFalse(any(call[0][:2] == ("tmux", "respawn-pane")
                             for call in executor.calls))

    def test_exit_zero_requires_trusted_semantic_success(self):
        for outcome, expected_phase in (
            ("blocked", "semantic_blocked"),
            ("invalid", "semantic_blocked"),
            ("correctable", "exited_resumable"),
        ):
            with self.subTest(outcome=outcome):
                store = self.state_store()
                controller = Controller(Registry((TARGET,)), store, FakeExecutor())
                state = controller.observe_terminal(KEY, 0, outcome, outcome == "correctable")
                self.assertEqual(state.phase, expected_phase)
                self.assertNotEqual(state.phase, "semantic_success")

        store = self.state_store()
        controller = Controller(Registry((TARGET,)), store, FakeExecutor())
        self.assertEqual(controller.observe_terminal(KEY, 0, "success", False).phase,
                         "semantic_success")

    def test_correctable_operator_finding_recovers_exit_zero_blocker_by_exact_session(self):
        store = self.state_store()
        observer = Controller(Registry((TARGET,)), store, FakeExecutor())
        blocked = observer.observe_terminal(KEY, 0, "blocked", True)
        self.assertEqual(blocked.phase, "semantic_blocked")
        corrected = observer.observe_correctable(KEY)
        self.assertEqual(corrected.phase, "exited_resumable")
        controller, executor = self.controller([
            "issue-77\n", "1\t4242\t\n",
            "chore/issue-77-openspec-workflow\n",
        ], store=store)
        result = controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "resuming")
        self.assertEqual(executor.calls[-1][0][-4:], (
            "--idempotency-key", KEY, "--session-id", SESSION_ID,
        ))

    def test_fresh_session_fallback_is_consumed_at_most_once(self):
        store = self.state_store()
        observer = Controller(Registry((TARGET,)), store, FakeExecutor())
        observer.observe_terminal(KEY, 1, "crashed", False)
        controller, executor = self.controller([
            "issue-77\n", "1\t4242\t\n",
            "chore/issue-77-openspec-workflow\n",
        ], store=store)
        result = controller.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(result["status"], "restarted")
        self.assertEqual(result["execution"]["restart_count"], 1)
        self.assertEqual(executor.calls[-1][0], (
            "tmux", "respawn-pane", "-k", "-t", "snapflow-dev:issue-77", "-c",
            "/workspace/snap-flow-issue-77", CODEX_RUNTIME_PATH, "start",
            "--idempotency-key", KEY,
        ))

        restarted = store.load(KEY)
        assert restarted is not None
        crashed_again = WorkState(
            TARGET, SESSION_ID, "crashed", process_generation=1, restart_count=1,
            terminal=restarted.terminal,
        )
        store.save(KEY, restarted, crashed_again)
        retry, retry_executor = self.controller(store=store)
        with self.assertRaises(RuntimeError):
            retry.execute("resume", REPOSITORY, 77, KEY)
        self.assertEqual(retry_executor.calls, [])

    def test_missing_trusted_state_never_becomes_semantic_success(self):
        store = self.state_store()
        state = store.load(KEY)
        assert state is not None
        self.assertEqual(state.phase, "active")
        self.assertIsNone(state.terminal)
        with self.assertRaises((ValueError, RuntimeError)):
            Controller(Registry((TARGET,)), store, FakeExecutor()).observe_terminal(
                KEY, 0, "success from prose", False,
            )

    def test_file_store_persists_session_and_structured_terminal_state(self):
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "resolutions.json"
            store = FileResolutionStore(path)
            initial = store.bind(KEY, TARGET)
            store.save(KEY, initial, WorkState(TARGET, phase="starting"))
            controller = Controller(Registry((TARGET,)), store, FakeExecutor())
            controller.observe_session(KEY, SESSION_ID)
            completed = controller.observe_terminal(KEY, 0, "success", False)
            reloaded = FileResolutionStore(path).load(KEY)
            self.assertEqual(reloaded, completed)
            self.assertEqual(reloaded.phase, "semantic_success")
            self.assertEqual(reloaded.codex_session_id, SESSION_ID)
            self.assertEqual(reloaded.terminal.semantic_outcome, "success")

        store = self.state_store()
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
            file_store = FileResolutionStore(state)
            initial = file_store.bind(KEY, TARGET)
            file_store.save(KEY, initial, WorkState(TARGET, SESSION_ID, "active"))
            executor = FakeExecutor(["issue-77\n", "/workspace/snap-flow-issue-77\n",
                                     "chore/issue-77-openspec-workflow\n", RUNTIME_METADATA,
                                     APP_SERVER_CHILD])
            output = []
            exit_code = main([
                "preflight", "--repository", REPOSITORY, "--issue-number", "77",
                "--idempotency-key", KEY,
            ], registry_path=registry, state_path=state, executor=executor, write=output.append)
            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(output[0])["version"], 1)

            for option in ("--host", "--port", "--identity", "--project", "--session", "--window",
                           "--worktree", "--branch", "--worker", "--command", "--cwd", "--path",
                           "--outcome", "--exit-code", "--session-id"):
                with self.subTest(option=option):
                    with self.assertRaises(SystemExit):
                        main(["preflight", "--repository", REPOSITORY, "--issue-number", "77",
                              "--idempotency-key", KEY, option, "attacker"])

    def test_controller_artifacts_are_versioned_exact_and_non_secret(self):
        controller_dir = pathlib.Path(__file__).parents[1] / "controller"
        registry = json.loads((controller_dir / "registry.v1.json").read_text(encoding="utf-8"))
        policy = json.loads((controller_dir / "card-capability-policy.v1.json").read_text(encoding="utf-8"))
        manifest = json.loads((controller_dir / "install-manifest.v1.json").read_text(encoding="utf-8"))
        state_schema = json.loads((controller_dir / "state-schema.v1.json").read_text(encoding="utf-8"))
        self.assertEqual(registry, {"version": 1, "targets": [TARGET.as_dict()]})
        self.assertEqual(policy["project_command_capabilities"]["allow"],
                         ["/usr/local/bin/neo-dev-project-control"])
        self.assertEqual(manifest["version"], 1)
        self.assertEqual(state_schema["properties"]["restart_count"]["maximum"], 1)
        self.assertIn("semantic_success", state_schema["properties"]["phase"]["enum"])
        self.assertIn("state-schema.v1.json", [entry["source"] for entry in manifest["files"]])
        runtime_entry = next(entry for entry in manifest["files"]
                             if entry["source"] == "neo-dev-codex-runtime")
        self.assertTrue(effective_mode_allows(runtime_entry, "dev", {"dev"}, 0o1))
        self.assertFalse(effective_mode_allows(runtime_entry, "other", {"other"}, 0o1))
        self.assertTrue(effective_mode_allows(manifest["state"], "dev", {"dev"}, 0o3))
        self.assertFalse(effective_mode_allows(manifest["state"], "other", {"other"}, 0o3))
        self.assertNotIn(runtime_entry["destination"],
                         policy["project_command_capabilities"]["allow"])
        combined = " ".join(path.read_text(encoding="utf-8") for path in controller_dir.iterdir())
        for forbidden in ("HostName", "IdentityFile", "known_hosts", "ssh-rsa", "ssh-ed25519",
                          "private endpoint", "pinned host key"):
            self.assertNotIn(forbidden, combined)


if __name__ == "__main__":
    unittest.main()

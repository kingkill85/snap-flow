import io
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

from neo_dev_webhook.codex_runtime import AppServer, run_runtime, validate_completion
from neo_dev_webhook.project_control import (
    CODEX_RUNTIME_PATH,
    Controller,
    FileResolutionStore,
    GovernedTarget,
    Registry,
)


REPOSITORY = "kingkill85/snap-flow"
KEY = "12345678-1234-4abc-8def-123456789abc"
SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
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
    def __init__(self, outputs):
        self.outputs = list(outputs)
        self.calls = []

    def run(self, argv, *, timeout):
        self.calls.append((tuple(argv), timeout))
        return self.outputs.pop(0) if self.outputs else ""


class FakeAppServer:
    def __init__(self, state_path, completion, status="completed"):
        self.state_path = state_path
        self.completion = completion
        self.status = status
        self.calls = []
        self.closed = False
        self.events = [
            ("event", {"method": "item/agentMessage/delta", "params": {
                "delta": json.dumps(completion),
            }}),
            ("event", {"method": "turn/completed", "params": {
                "turn": {"status": status},
            }}),
        ]

    def request(self, method, params):
        self.calls.append((method, params))
        if method == "initialize":
            return {}
        if method in {"thread/start", "thread/resume"}:
            return {"thread": {"id": SESSION_ID}}
        if method == "turn/start":
            state = FileResolutionStore(self.state_path).load(KEY)
            if state is None or state.phase != "active" or state.codex_session_id != SESSION_ID:
                raise AssertionError("runtime did not persist active session before the turn")
            return {"turn": {"id": "turn-1"}}
        if method == "turn/steer":
            return {}
        raise AssertionError(f"unexpected request {method}")

    def send(self, method, params, request_id=None):
        self.calls.append((method, params))

    def poll(self, control_input):
        return self.events.pop(0)

    def close(self):
        self.closed = True


class CrashingAppServer(FakeAppServer):
    def poll(self, control_input):
        raise RuntimeError("Codex app-server exited unexpectedly")


class FakeProcess:
    def __init__(self, timeouts=1):
        self.stdin = io.StringIO()
        self.stdout = io.StringIO()
        self.wait_calls = 0
        self.terminated = False
        self.killed = False
        self.timeouts = timeouts

    def wait(self, timeout=None):
        self.wait_calls += 1
        if self.wait_calls <= self.timeouts:
            import subprocess
            raise subprocess.TimeoutExpired("codex", timeout)
        return 0

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True


class CodexRuntimeTest(unittest.TestCase):
    def files(self, root):
        registry_path = root / "registry.json"
        state_path = root / "state.json"
        registry_path.write_text(json.dumps({
            "version": 1, "targets": [TARGET.as_dict()],
        }), encoding="utf-8")
        return registry_path, state_path

    def test_public_start_path_records_session_and_terminal_end_to_end(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path, state_path = self.files(root)
            executor = FakeExecutor(["\n", "chore/issue-77-openspec-workflow\n"])
            controller = Controller(
                Registry((TARGET,)), FileResolutionStore(state_path), executor,
            )
            result = controller.execute("start", REPOSITORY, 77, KEY)
            self.assertEqual(result["execution"]["phase"], "starting")
            self.assertEqual(executor.calls[-1][0], (
                "tmux", "new-window", "-d", "-t", "snapflow-dev", "-n", "issue-77",
                "-c", "/workspace/snap-flow-issue-77", CODEX_RUNTIME_PATH, "start",
                "--idempotency-key", KEY,
            ))

            completion = {
                "semantic_outcome": "success", "resumable": False,
                "summary": "Repository-side work verified",
            }
            server = FakeAppServer(state_path, completion)
            exit_code = run_runtime(
                "start", KEY, None, registry_path=registry_path, state_path=state_path,
                app_server=server, control_input=io.StringIO(""),
            )
            self.assertEqual(exit_code, 0)
            persisted = FileResolutionStore(state_path).load(KEY)
            self.assertEqual(persisted.codex_session_id, SESSION_ID)
            self.assertEqual(persisted.phase, "semantic_success")
            self.assertEqual(persisted.terminal.exit_code, 0)
            self.assertEqual(persisted.terminal.semantic_outcome, "success")
            self.assertTrue(server.closed)

    def test_app_server_uses_fixed_argv_and_deterministically_reaps_child(self):
        process = FakeProcess()
        with patch("neo_dev_webhook.codex_runtime.subprocess.Popen",
                   return_value=process) as popen:
            server = AppServer.start()
        popen.assert_called_once_with(
            ["/usr/local/bin/codex", "app-server", "--stdio"],
            stdin=-1, stdout=-1, stderr=-3, text=True, bufsize=1, shell=False,
        )
        server.close()
        self.assertTrue(process.stdin.closed)
        self.assertTrue(process.terminated)
        self.assertFalse(process.killed)
        self.assertEqual(process.wait_calls, 2)

    def test_app_server_kills_and_reaps_child_that_ignores_terminate(self):
        process = FakeProcess(timeouts=2)
        server = AppServer(process)
        server.close()
        self.assertTrue(process.terminated)
        self.assertTrue(process.killed)
        self.assertEqual(process.wait_calls, 3)

    def test_runtime_captures_invalid_completion_as_non_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path, state_path = self.files(root)
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, TARGET)
            from dataclasses import replace
            store.save(KEY, initial, replace(initial, phase="starting"))
            server = FakeAppServer(state_path, {"semantic_outcome": "success"})
            self.assertEqual(run_runtime(
                "start", KEY, None, registry_path=registry_path, state_path=state_path,
                app_server=server, control_input=io.StringIO(""),
            ), 1)
            persisted = FileResolutionStore(state_path).load(KEY)
            self.assertEqual(persisted.phase, "semantic_blocked")
            self.assertEqual(persisted.terminal.semantic_outcome, "invalid")

    def test_live_runtime_steers_existing_thread_and_turn(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path, state_path = self.files(root)
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, TARGET)
            from dataclasses import replace
            store.save(KEY, initial, replace(initial, phase="starting"))
            completion = {
                "semantic_outcome": "correctable", "resumable": True,
                "summary": "Finding remains correctable",
            }
            server = FakeAppServer(state_path, completion)
            server.events.insert(0, ("control", "Continue the governed Issue work and address the latest trusted operator finding.\n"))
            self.assertEqual(run_runtime(
                "start", KEY, None, registry_path=registry_path, state_path=state_path,
                app_server=server, control_input=io.StringIO(""),
            ), 1)
            steer = [call for call in server.calls if call[0] == "turn/steer"]
            self.assertEqual(len(steer), 1)
            self.assertEqual(steer[0][1]["threadId"], SESSION_ID)
            self.assertEqual(steer[0][1]["expectedTurnId"], "turn-1")

    def test_nonzero_turn_with_nominal_success_persists_invalid_not_success(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path, state_path = self.files(root)
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, TARGET)
            from dataclasses import replace
            store.save(KEY, initial, replace(initial, phase="starting"))
            completion = {
                "semantic_outcome": "success", "resumable": True, "summary": "done",
            }
            server = FakeAppServer(state_path, completion, status="failed")
            self.assertEqual(run_runtime(
                "start", KEY, None, registry_path=registry_path, state_path=state_path,
                app_server=server, control_input=io.StringIO(""),
            ), 1)
            persisted = FileResolutionStore(state_path).load(KEY)
            self.assertNotEqual(persisted.phase, "semantic_success")
            self.assertEqual(persisted.terminal.exit_code, 1)
            self.assertEqual(persisted.terminal.semantic_outcome, "invalid")

    def test_nonzero_exit_can_never_validate_nominal_success(self):
        completion = {
            "semantic_outcome": "success", "resumable": True, "summary": "done",
        }
        with self.assertRaises(ValueError):
            validate_completion(completion, 1)

    def test_runtime_crash_persists_resumable_terminal_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path, state_path = self.files(root)
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, TARGET)
            from dataclasses import replace
            store.save(KEY, initial, replace(initial, phase="starting"))
            server = CrashingAppServer(state_path, {})
            with self.assertRaisesRegex(RuntimeError, "exited unexpectedly"):
                run_runtime(
                    "start", KEY, None, registry_path=registry_path,
                    state_path=state_path, app_server=server,
                    control_input=io.StringIO(""),
                )
            persisted = store.load(KEY)
            self.assertEqual(persisted.phase, "crashed")
            self.assertEqual(persisted.codex_session_id, SESSION_ID)
            self.assertEqual(persisted.terminal.exit_code, 1)
            self.assertEqual(persisted.terminal.semantic_outcome, "crashed")
            self.assertTrue(persisted.terminal.resumable)
            self.assertTrue(server.closed)

    def test_completion_schema_rejects_extra_missing_and_wrong_types(self):
        invalid = (
            {"semantic_outcome": "success", "resumable": False},
            {"semantic_outcome": "success", "resumable": False, "summary": "ok", "x": 1},
            {"semantic_outcome": "success", "resumable": "false", "summary": "ok"},
            {"semantic_outcome": "unknown", "resumable": False, "summary": "ok"},
        )
        for value in invalid:
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_completion(value, 0)


if __name__ == "__main__":
    unittest.main()

import json
import base64
import pathlib
import shutil
import subprocess
import tempfile
import unittest
import uuid
from unittest import mock

from neo_dev_webhook.automation import ProjectDispatcher, TaskRunner
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
from neo_dev_webhook.forced_command import PRIVILEGED_CONTROLLER, validated_original_command


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
PROJECT = {"repository": REPOSITORY, "repository_path": "/workspace/snap-flow",
           "origin_url": "git@github.com:kingkill85/snap-flow.git"}


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
        registry = Registry((), (TEMPLATE,), (PROJECT,))
        executor = FakeExecutor([
            "/workspace/snap-flow\n", "/workspace/snap-flow/.git\n",
            "git@github.com:kingkill85/snap-flow.git\n", "", "", "", "",
            "feature/issue-13\n", "", "", "feature/issue-13\n", "",
        ])
        result = Controller(registry, InMemoryResolutionStore(), executor).execute(
            "start", REPOSITORY, 13, KEY,
        )
        argv = [call[0] for call in executor.calls]
        self.assertEqual(argv[0], ("git", "-C", "/workspace/snap-flow", "rev-parse",
                                   "--show-toplevel"))
        self.assertIn(("git", "-C", "/workspace/snap-flow", "fetch", "--prune",
                       "origin", "main"), argv)
        self.assertIn(("git", "-C", "/workspace/snap-flow", "worktree", "add", "-b",
                       "feature/issue-13", "/workspace/snap-flow-issue-13", "origin/main"), argv)
        self.assertEqual(argv.count(("tmux", "new-window", "-d", "-t", "snapflow-dev", "-n",
                                     "issue-13", "-c", "/workspace/snap-flow-issue-13",
                                     CODEX_RUNTIME_PATH, "start", "--idempotency-key", KEY)), 1)
        self.assertEqual(result["status"], "starting")

    def test_existing_generic_worktree_is_verified_not_recreated(self):
        executor = FakeExecutor([
            "/workspace/snap-flow\n", "/workspace/snap-flow/.git\n",
            "git@github.com:kingkill85/snap-flow.git\n", "",
            "worktree /workspace/snap-flow-issue-13\nbranch refs/heads/feature/issue-13\n\n",
            "/workspace/snap-flow/.git\n", "feature/issue-13\n", "", "",
            "feature/issue-13\n", "",
        ])
        Controller(Registry((), (TEMPLATE,), (PROJECT,)), InMemoryResolutionStore(), executor).execute(
            "start", REPOSITORY, 13, KEY,
        )
        self.assertFalse(any(call[0][3:5] == ("worktree", "add") for call in executor.calls))

    def test_repository_root_common_dir_and_origin_mismatch_fail_before_fetch(self):
        for outputs in (
            ["/attacker\n", "/workspace/snap-flow/.git\n", PROJECT["origin_url"] + "\n"],
            ["/workspace/snap-flow\n", "/attacker/.git\n", PROJECT["origin_url"] + "\n"],
            ["/workspace/snap-flow\n", "/workspace/snap-flow/.git\n",
             "git@github.com:attacker/repo.git\n"],
        ):
            with self.subTest(outputs=outputs):
                executor = FakeExecutor(outputs)
                controller = Controller(
                    Registry((), (TEMPLATE,), (PROJECT,)), InMemoryResolutionStore(), executor,
                )
                with self.assertRaises(RuntimeError):
                    controller.execute("start", REPOSITORY, 13, KEY)
                self.assertFalse(any("fetch" in call[0] for call in executor.calls))

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
        self.assertEqual(argv[argv.index("neo-controller@192.168.178.4") + 1], REMOTE_CONTROLLER)
        self.assertIn("GlobalKnownHostsFile=/dev/null", argv)
        self.assertIn("ProxyCommand=none", argv)
        self.assertEqual(argv[argv.index("-p") + 1], "2222")
        self.assertFalse(run.call_args.kwargs["shell"])
        for option in ("--host", "--identity", "--known-hosts", "--command"):
            with self.subTest(option=option), self.assertRaises(SystemExit):
                remote_main(["start", "--repository", REPOSITORY, "--issue-number", "13",
                             "--idempotency-key", KEY, option, "attacker"], run=run)

    def test_server_forced_command_accepts_only_exact_controller_grammar(self):
        original = (f"/usr/local/bin/neo-dev-project-control resume --repository {REPOSITORY} "
                    f"--issue-number 13 --idempotency-key {KEY}")
        argv = validated_original_command(original)
        self.assertEqual(argv[0], PRIVILEGED_CONTROLLER)
        self.assertEqual(argv[1:], ("resume", "--repository", REPOSITORY, "--issue-number",
                                    "13", "--idempotency-key", KEY))
        for command in (
            "bash -c id", "git status", original + " --command id",
            original.replace("resume", "rm"), original.replace("13", "13;id"),
        ):
            with self.subTest(command=command), self.assertRaises(ValueError):
                validated_original_command(command)
        evidence = base64.b64encode(b'{"version":1}').decode()
        evidence_command = original.replace("resume", "attest") + f" --evidence {evidence}"
        self.assertEqual(validated_original_command(evidence_command)[-2:],
                         ("--evidence", evidence))
        with self.assertRaises(ValueError):
            validated_original_command(original.replace("resume", "status") +
                                       f" --evidence {evidence}")
        options = (pathlib.Path(__file__).parents[1] / "controller" /
                   "authorized_keys.options").read_text()
        for required in ("restrict", "no-pty", "no-agent-forwarding", "no-port-forwarding",
                         "command=\"/usr/local/bin/neo-dev-forced-command\""):
            self.assertIn(required, options)

    def test_initial_prompt_is_issue_specific_and_spec_only(self):
        prompt = initial_prompt(REPOSITORY, 13)
        self.assertIn("Issue #13", prompt)
        self.assertIn("AGENTS.md", prompt)
        self.assertIn("openspec/config.yaml", prompt)
        self.assertIn("Create ONLY", prompt)
        self.assertIn("Draft PR", prompt)
        self.assertIn("/approve-spec <full-sha>", prompt)
        self.assertIn("Do not implement", prompt)

    def test_deployment_preflights_exact_host_pin_and_dedicated_identity(self):
        deploy = pathlib.Path(__file__).parents[1] / "deploy"
        installer = (deploy / "hermes-stage.sh").read_text() + (deploy / "hermes-controller-install.sh").read_text()
        self.assertIn('validate_pinned_host(pathlib.Path("/opt/data/tailscale_known_hosts"), "192.168.178.4", 2222)', installer)
        self.assertIn("hermes:hermes:600", installer)
        self.assertIn("snapflow-controller-client", installer)
        self.assertNotIn("dev ALL=(root)", (pathlib.Path(__file__).parents[1] /
                                            "controller/neo-dev-control.sudoers").read_text())

    def test_continuation_task_reuses_identity_and_selects_accept_awaiting_merge_phase(self):
        runner = TaskRunner(script_path="/test/task.py")
        help_result = mock.Mock(stdout="title --body --max-runtime --workspace --idempotency-key")
        completed = mock.Mock(stdout='{"task_id":"same-task","durable":true}\n')
        work = {"issue_number": 13, "task_id": "same-task", "wakeups": [{
            "event": "issue_comment", "action": "created", "command": "/accept",
            "delivery_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        }]}
        with mock.patch("subprocess.run", side_effect=[help_result, completed]) as run:
            self.assertEqual(runner.create(work, KEY), "same-task")
        body = run.call_args_list[1].args[0][4]
        self.assertIn("Current phase: awaiting-merge", body)
        self.assertIn("dispatch operation already performed", body)
        self.assertIn(KEY, body)
        self.assertIn("Acceptance does not authorize merge", body)

    def test_consumer_dispatch_boundary_rejects_non_lifecycle_operations(self):
        dispatcher = ProjectDispatcher("/fixed/controller")
        with self.assertRaisesRegex(ValueError, "unsupported"):
            dispatcher.dispatch("shell", REPOSITORY, 13, KEY)
        controller_output = json.dumps({"status": "resuming"})
        wakeup = {"comment_id": 102, "command": "/fix repair the race",
                  "delivery_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}
        with mock.patch("neo_dev_webhook.automation.collect_host_evidence",
                        return_value=base64.b64encode(b'{}').decode()) as collect, mock.patch(
                            "subprocess.run", return_value=subprocess.CompletedProcess([], 0, controller_output)
                        ) as run:
            dispatcher.dispatch("resume", REPOSITORY, 13, KEY, wakeup)
        collect.assert_called_once_with("/fixed/controller", REPOSITORY, 13, KEY, wakeup)
        self.assertEqual(run.call_args.args[0], [
            "/fixed/controller", "resume", "--repository", REPOSITORY,
            "--issue-number", "13", "--idempotency-key", KEY, "--evidence",
            base64.b64encode(b'{}').decode(),
        ])
        self.assertFalse(run.call_args.kwargs["shell"])

    def test_start_retry_recovers_matching_active_controller_before_card_creation(self):
        dispatcher = ProjectDispatcher("/fixed/controller")
        existing = {
            "idempotency_key": KEY,
            "governed_identity": {"repository": REPOSITORY, "issue_number": 13},
            "execution": {"phase": "active", "codex_session_id": "session"},
        }
        with mock.patch("subprocess.run", return_value=subprocess.CompletedProcess(
                [], 0, json.dumps(existing))) as run:
            context = dispatcher.dispatch("start", REPOSITORY, 13, KEY)
        self.assertEqual(context, {"controller": existing, "github": None})
        self.assertEqual(run.call_count, 1)
        self.assertEqual(run.call_args.args[0][1], "status")
        self.assertFalse(run.call_args.kwargs["check"])

    def test_new_start_checks_status_then_dispatches_when_state_is_absent(self):
        dispatcher = ProjectDispatcher("/fixed/controller")
        started = {"status": "starting"}
        with mock.patch("subprocess.run", side_effect=[
                subprocess.CompletedProcess([], 1, '{"status":"not_found"}'),
                subprocess.CompletedProcess([], 0, json.dumps(started)),
        ]) as run:
            context = dispatcher.dispatch("start", REPOSITORY, 13, KEY)
        self.assertEqual(context, {"controller": started, "github": None})
        self.assertEqual([call.args[0][1] for call in run.call_args_list], ["status", "start"])
        self.assertTrue(run.call_args_list[1].kwargs["check"])

    def test_terminal_real_helper_semantics_get_unique_runnable_execution_per_wakeup(self):
        fixture = pathlib.Path(__file__).with_name("fixtures") / "terminal_task.py"
        with tempfile.TemporaryDirectory() as directory:
            helper = pathlib.Path(directory) / "task.py"
            shutil.copyfile(fixture, helper)
            runner = TaskRunner(script_path=str(helper))
            first_wakeup = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
            second_wakeup = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
            first = runner.create({"issue_number": 13, "task_id": None, "wakeups": [{
                "delivery_id": first_wakeup, "event": "issues", "action": "labeled",
                "command": None,
            }]}, KEY)
            second_work = {"issue_number": 13, "task_id": first, "wakeups": [{
                "delivery_id": first_wakeup, "event": "issues", "action": "labeled",
                "command": None,
            }, {
                "delivery_id": second_wakeup, "event": "issue_comment", "action": "created",
                "command": "/accept",
            }]}
            second = runner.create(second_work, KEY)
            replay = runner.create(second_work, KEY)
            cards = json.loads((pathlib.Path(directory) / ".terminal-cards.json").read_text())
        self.assertNotEqual(first, second)
        self.assertEqual(second, replay)
        self.assertEqual(len(cards), 2)
        self.assertIn("Current phase: specification", cards[
            str(uuid.uuid5(uuid.UUID(KEY), str(uuid.UUID(first_wakeup))))]["body"])
        self.assertIn("Current phase: awaiting-merge", cards[
            str(uuid.uuid5(uuid.UUID(KEY), str(uuid.UUID(second_wakeup))))]["body"])

    def test_deployment_updates_existing_compose_stack_without_systemd_or_profile_overwrite(self):
        deploy = pathlib.Path(__file__).parents[1] / "deploy"
        hermes = (deploy / "hermes-stage.sh").read_text()
        controller = (deploy / "controller-install.sh").read_text()
        dockge = (deploy / "dockge-activate.sh").read_text()
        self.assertIn("services/snapflow-neo-dev-webhook/src", hermes)
        self.assertNotIn("docker ", hermes)
        self.assertNotIn("python3 verify_live_compose", dockge)
        self.assertIn("grep -Fxq /opt/data", dockge)
        self.assertIn("/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook", dockge)
        self.assertNotIn("docker", controller)
        self.assertFalse((deploy / "compose.neo-dev-repair.yaml").exists())
        self.assertFalse((deploy / "install.sh").exists())


if __name__ == "__main__":
    unittest.main()

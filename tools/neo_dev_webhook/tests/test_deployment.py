import base64
import pathlib
import os
import tempfile
import unittest
import subprocess
import hashlib
import json
import importlib.util
import sys
import types
from unittest import mock

from neo_dev_webhook.deployment import validate_pinned_host
from neo_dev_webhook.deploy.verify_live_compose import verify
from neo_dev_webhook.hermes_transition import CapabilityBroker
from neo_dev_webhook.automation import TaskRunner


class DeploymentTest(unittest.TestCase):
    def test_exact_operator_pin_is_required_and_mismatch_rejected(self):
        key = base64.b64encode(b"operator-verified-key").decode()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "known_hosts"
            path.write_text(f"[192.168.178.4]:2222 ssh-ed25519 {key}\n")
            self.assertIn("192.168.178.4", validate_pinned_host(path, "192.168.178.4", 2222))
            path.write_text(f"192.168.178.4 ssh-ed25519 {key}\n")
            with self.assertRaisesRegex(ValueError, "exactly one"):
                validate_pinned_host(path, "192.168.178.4", 2222)
            path.write_text(f"[192.168.178.4]:2222 ssh-ed25519 {key}\n" * 2)
            with self.assertRaisesRegex(ValueError, "exactly one"):
                validate_pinned_host(path, "192.168.178.4", 2222)

    def test_exact_live_compose_is_accepted_and_drift_rejected(self):
        fixture = pathlib.Path(__file__).with_name("fixtures") / "live-compose.yaml"
        text = fixture.read_text()
        verify(text)
        with self.assertRaisesRegex(ValueError, "consumer command drift"):
            verify(text.replace("/var/lib/neo-dev/neo-dev.sqlite", "/tmp/new.sqlite"))

    def test_one_use_transition_capability_allows_decision_not_shell(self):
        with tempfile.TemporaryDirectory() as directory:
            broker = CapabilityBroker(pathlib.Path(directory))
            token = broker.issue("workflow", "execution", 13, "specification")
            result = broker.submit("execution", token, "proceed", "planning complete")
            self.assertEqual(result["decision"], "proceed")
            with self.assertRaisesRegex(ValueError, "consumed"):
                broker.submit("execution", token, "proceed", "replay")
            with self.assertRaisesRegex(ValueError, "bounded"):
                broker.submit("execution", "wrong", "shell", "id")

    def test_hermes_scope_stage_and_rollback_are_byte_identical(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "root"; backup = pathlib.Path(directory) / "backup"
            root.mkdir(); (root / ".hermes-scope-fixture").write_text("guard\n")
            (root / "existing").write_bytes(b"before\x00")
            before = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            subprocess.run([str(script), "fixture-install", str(root), str(backup)], check=True)
            subprocess.run([str(script), "fixture-rollback", str(root), str(backup)], check=True,
                           capture_output=True)
            after = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            self.assertEqual(after, before)

    def test_controller_scope_fixture_install_and_rollback_are_isolated(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/controller-install.sh"
        controller = pathlib.Path(__file__).parents[1] / "controller"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "root"; backup = pathlib.Path(directory) / "backup"
            bundle = pathlib.Path(directory) / "bundle"; (bundle / "controller").mkdir(parents=True)
            (bundle / "controller/neo-dev-project-control").write_bytes(
                (controller / "neo-dev-project-control").read_bytes())
            root.mkdir(); (root / ".controller-scope-fixture").write_text("guard\n")
            before = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            env = {**os.environ, "NEO_CONTROLLER_BUNDLE": str(bundle)}
            subprocess.run([str(script), "fixture-install", str(root), str(backup)], check=True, env=env)
            subprocess.run([str(script), "fixture-rollback", str(root), str(backup)], check=True, env=env)
            after = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            self.assertEqual(after, before)

    def test_native_plugin_registers_exact_narrow_tool_and_requires_kanban(self):
        plugin = pathlib.Path(__file__).parents[1] / "deploy/hermes-plugin/snapflow_neo_dev_transition/__init__.py"
        manifest = json.loads((plugin.parent / "plugin.yaml").read_text())
        self.assertEqual(manifest["provides_tools"], ["snapflow_neo_dev_transition"])
        spec = importlib.util.spec_from_file_location("snapflow_plugin", plugin)
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
        ctx = mock.Mock(); module.register(ctx)
        kwargs = ctx.register_tool.call_args.kwargs
        self.assertEqual((kwargs["name"], kwargs["toolset"]),
                         ("snapflow_neo_dev_transition", "snapflow_neo_dev"))
        self.assertFalse(kwargs["schema"]["additionalProperties"])
        self.assertEqual(kwargs["schema"]["properties"]["decision"]["enum"], ["proceed", "block"])
        call = {"execution_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                "capability": "x" * 32, "decision": "block", "summary": "bounded"}
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(PermissionError):
                kwargs["handler"](call)
        broker = mock.Mock(); broker.submit.return_value = {"decision": "block"}
        with mock.patch.object(module, "CapabilityBroker", return_value=broker), \
             mock.patch.dict(os.environ, {"HERMES_KANBAN_TASK": "t_1"}, clear=True):
            self.assertEqual(json.loads(kwargs["handler"](call)), {"decision": "block"})
        broker.submit.assert_called_once_with(call["execution_id"], "x" * 32, "block", "bounded")
        with mock.patch.dict(os.environ, {"HERMES_KANBAN_TASK": "t_1"}, clear=True):
            with self.assertRaisesRegex(ValueError, "exactly"):
                kwargs["handler"]({**call, "command": "git status"})

    def test_live_resolver_verifier_rejects_broad_worker_toolsets(self):
        verifier_path = pathlib.Path(__file__).parents[1] / "deploy/verify_hermes_runtime.py"
        spec = importlib.util.spec_from_file_location("hermes_runtime_verifier", verifier_path)
        verifier = importlib.util.module_from_spec(spec); spec.loader.exec_module(verifier)
        package = types.ModuleType("hermes_cli"); package.__path__ = []
        kanban = types.ModuleType("hermes_cli.kanban_db")
        plugins = types.ModuleType("hermes_cli.plugins")
        model_tools = types.ModuleType("model_tools")
        toolsets = types.ModuleType("toolsets")
        registry_module = types.ModuleType("tools.registry")
        plugins.discover_plugins = lambda: None
        plugins.get_plugin_manager = lambda: types.SimpleNamespace(list_plugins=lambda: [{
            "key": "snapflow-neo-dev-transition", "enabled": True, "tools": 1,
        }])
        safe = verifier.SAFE_TOOLSETS
        model_tools.get_tool_definitions = lambda **_kwargs: [
            {"function": {"name": name}} for name in
            ["snapflow_neo_dev_transition", "web_search", "kanban_complete"]
        ]
        toolsets.resolve_toolset = lambda name: {
            "snapflow_neo_dev": ["snapflow_neo_dev_transition"],
            "web": ["web_search"], "kanban": ["kanban_complete"],
        }.get(name, [])
        registry_module.registry = types.SimpleNamespace(dispatch=lambda *_args, **_kwargs: '{"error":"unknown capability"}')
        with mock.patch.dict(sys.modules, {
            "hermes_cli": package, "hermes_cli.kanban_db": kanban,
            "hermes_cli.plugins": plugins, "model_tools": model_tools,
            "toolsets": toolsets, "tools.registry": registry_module,
        }):
            kanban._resolve_worker_cli_toolsets = lambda _home: verifier.EXPECTED_RESOLVED_TOOLSETS
            self.assertEqual(verifier.verify("/profile")["resolved_worker_toolsets"],
                             verifier.EXPECTED_RESOLVED_TOOLSETS)
            kanban._resolve_worker_cli_toolsets = lambda _home: sorted([
                *verifier.EXPECTED_RESOLVED_TOOLSETS, "terminal",
            ])
            with self.assertRaisesRegex(RuntimeError, "unsafe"):
                verifier.verify("/profile")

    def test_task_body_names_native_tool_not_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            runner = TaskRunner(script_path="/task.py", capability_broker=CapabilityBroker(root / "caps"))
            help_result = mock.Mock(stdout="title --body --max-runtime --workspace --idempotency-key")
            completed = mock.Mock(stdout='{"task_id":"card","durable":true}')
            with mock.patch("subprocess.run", side_effect=[help_result, completed]) as run:
                runner.create({"issue_number": 13, "task_id": None, "wakeups": [{
                    "delivery_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                }]}, "12345678-1234-4abc-8def-123456789abc")
            body = run.call_args_list[1].args[0][4]
            self.assertIn("snapflow_neo_dev_transition", body)
            self.assertNotIn("/opt/data/bin/snapflow-neo-dev-transition", body)
            self.assertIn("Terminal, code execution, shell, SSH, Git", body)

    def test_dockge_verify_and_activate_need_no_python(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/dockge-activate.sh"
        fixture_compose = pathlib.Path(__file__).with_name("fixtures") / "live-compose.yaml"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory); stack = root / "stack"; bin_dir = root / "bin"
            stack.mkdir(); bin_dir.mkdir()
            (stack / ".dockge-scope-fixture").write_text("guard\n")
            (stack / "compose.yaml").write_bytes(fixture_compose.read_bytes())
            for command in ("bash", "grep"):
                (bin_dir / command).symlink_to(pathlib.Path("/usr/bin") / command)
            docker = bin_dir / "docker"
            docker.write_text("""#!/bin/bash
args="$*"
case "$args" in
  "compose version") exit 0;;
  *"config --services") printf 'receiver\\nconsumer\\n';;
  *" config") exit 0;;
  *"ps -q receiver") echo rid;;
  *"ps -q consumer") echo cid;;
  "inspect --format {{json .Config.Cmd}} rid") echo '["exec python3 -m neo_dev_webhook.server --host 0.0.0.0 --port 8787"]';;
  "inspect --format {{json .Config.Cmd}} cid") echo '["exec python3 -m neo_dev_webhook.consumer /var/lib/neo-dev/neo-dev.sqlite --max-runtime 2h --max-attempts 5"]';;
  "inspect --format {{range .Mounts}}{{println .Destination}}{{end}} rid") printf '/srv/webhook\\n/var/lib/neo-dev\\n/etc/passwd\\n/etc/group\\n';;
  "inspect --format {{range .Mounts}}{{println .Destination}}{{end}} cid") printf '/srv/webhook\\n/var/lib/neo-dev\\n/opt/data\\n/etc/passwd\\n/etc/group\\n';;
  "exec rid getent passwd 1000"|"exec cid getent passwd 1000") echo 'neo-runtime:x:1000:1000:Neo Dev runtime:/tmp:/usr/sbin/nologin';;
  "exec rid getent group 1000"|"exec cid getent group 1000") echo 'neo-runtime:x:1000:';;
  *" up -d --no-deps --force-recreate receiver consumer") exit 0;;
  "exec cid test -s /var/lib/neo-dev/neo-dev.sqlite") exit 0;;
  *) echo "unexpected docker argv: $args" >&2; exit 3;;
esac
""")
            docker.chmod(0o755)
            env = {"PATH": str(bin_dir)}
            subprocess.run([str(script), "fixture-verify", str(stack)], check=True, env=env)
            subprocess.run([str(script), "fixture-activate", str(stack)], check=True, env=env)

    def test_hermes_configuration_uses_tools_api_not_string_config_values(self):
        stage = (pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh").read_text()
        self.assertIn('tools disable "$toolset" --platform cli', stage)
        self.assertIn('tools enable "$toolset" --platform cli', stage)
        self.assertNotIn("config set platform_toolsets.cli", stage)
        self.assertNotIn("config set agent.disabled_toolsets '[", stage)
        self.assertIn("resolve_hermes_python", stage)
        self.assertNotIn('head -n 1 "$hermes_bin"', stage)
        self.assertIn("import json,sys; from hermes_cli.config import load_config", stage)
        verifier = (pathlib.Path(__file__).parents[1] / "deploy/verify_hermes_runtime.py").read_text()
        self.assertIn("get_plugin_manager", verifier)
        self.assertNotIn("get_plugin_tool_names", verifier)


if __name__ == "__main__":
    unittest.main()

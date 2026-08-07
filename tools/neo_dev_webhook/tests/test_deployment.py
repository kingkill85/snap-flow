import base64
import pathlib
import os
import tempfile
import unittest
import subprocess
import hashlib
import json
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

    def test_attested_safe_policy_admits_only_one_use_transition_tool(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory); policy = root / "policy.json"
            document = {"dispatcher_tasks": {
                "allow": ["/opt/data/bin/snapflow-neo-dev-transition"],
                "deny": ["terminal", "code_execution", "shell", "ssh", "git", "filesystem_write"],
            }}
            policy.write_text(json.dumps(document))
            (root / "policy.json.enforced").write_text(json.dumps({
                "policy_sha256": hashlib.sha256(policy.read_bytes()).hexdigest(),
                "disabled": document["dispatcher_tasks"]["deny"],
            }))
            runner = TaskRunner(script_path="/task.py", policy_path=str(policy),
                                capability_broker=CapabilityBroker(root / "caps"))
            help_result = mock.Mock(stdout="title --body --max-runtime --workspace --idempotency-key")
            completed = mock.Mock(stdout='{"task_id":"card","durable":true}')
            with mock.patch("subprocess.run", side_effect=[help_result, completed]) as run:
                runner.create({"issue_number": 13, "task_id": None, "wakeups": [{
                    "delivery_id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                }]}, "12345678-1234-4abc-8def-123456789abc")
            body = run.call_args_list[1].args[0][4]
            self.assertIn("snapflow-neo-dev-transition", body)
            self.assertIn("Terminal, code execution, shell, SSH, Git", body)


if __name__ == "__main__":
    unittest.main()

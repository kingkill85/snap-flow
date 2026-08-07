import importlib
import json
import os
import pathlib
import shutil
import sys
import tempfile
import unittest
from unittest import mock

from neo_dev_webhook.hermes_transition import CapabilityBroker


class ActualHermesPluginIntegrationTest(unittest.TestCase):
    def test_profile_discovery_resolution_and_registry_dispatch(self):
        source = os.environ.get("HERMES_AGENT_SOURCE")
        if not source or not (pathlib.Path(source) / "hermes_cli/plugins.py").is_file():
            self.skipTest("set HERMES_AGENT_SOURCE to an actual hermes-agent checkout")
        source = str(pathlib.Path(source).resolve())
        sys.path.insert(0, source)
        self.addCleanup(lambda: sys.path.remove(source))
        with tempfile.TemporaryDirectory() as directory:
            profile = pathlib.Path(directory) / "profiles/dev"
            target = profile / "plugins/snapflow_neo_dev_transition"
            target.mkdir(parents=True)
            bundled = pathlib.Path(directory) / "bundled-plugins"
            bundled.mkdir()
            bundle = pathlib.Path(__file__).parents[1] / "deploy/hermes-plugin/snapflow_neo_dev_transition"
            shutil.copy2(bundle / "plugin.yaml", target / "plugin.yaml")
            shutil.copy2(bundle / "__init__.py", target / "__init__.py")
            safe = ["snapflow_neo_dev", "web", "browser", "memory", "session_search", "skills"]
            (profile / "config.yaml").write_text(json.dumps({
                "plugins": {"enabled": ["snapflow-neo-dev-transition"]},
                "platform_toolsets": {"cli": safe},
                "agent": {"disabled_toolsets": ["bfl", "terminal", "code_execution",
                                                   "file", "delegation", "cronjob"]},
            }))
            with mock.patch.dict(os.environ, {
                "HERMES_HOME": str(profile), "HERMES_BUNDLED_PLUGINS": str(bundled),
            }, clear=False):
                plugins = importlib.import_module("hermes_cli.plugins")
                manager = plugins.PluginManager()
                manager.discover_and_load()
                loaded = manager._plugins["snapflow-neo-dev-transition"]
                self.assertTrue(loaded.enabled, loaded.error)
                self.assertEqual(loaded.tools_registered, ["snapflow_neo_dev_transition"])
                kanban = importlib.import_module("hermes_cli.kanban_db")
                self.assertEqual(kanban._resolve_worker_cli_toolsets(str(profile)),
                                 sorted([*safe, "kanban"]))
                execution = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                broker = CapabilityBroker(pathlib.Path(directory) / "capabilities")
                capability = broker.issue("workflow", execution, 13, "specification")
                args = {"execution_id": execution, "capability": capability,
                        "decision": "proceed", "summary": "planning is complete"}
                registry = importlib.import_module("tools.registry").registry
                registry.get_entry("snapflow_neo_dev_transition").handler.__globals__["CapabilityBroker"] = lambda: broker
                with mock.patch.dict(os.environ, {"HERMES_KANBAN_TASK": "t_integration"}):
                    first = registry.dispatch("snapflow_neo_dev_transition", args)
                    replay = registry.dispatch("snapflow_neo_dev_transition", args)
                self.assertEqual(json.loads(first)["decision"], "proceed")
                self.assertIn("consumed", replay)
                with mock.patch.dict(os.environ, {}, clear=True):
                    direct = registry.dispatch("snapflow_neo_dev_transition", args)
                self.assertIn("restricted to a dispatched Kanban task", direct)


if __name__ == "__main__":
    unittest.main()

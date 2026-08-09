import contextlib
import importlib.util
import io
import pathlib
import os
import subprocess
import tempfile
import time
import unittest
import uuid
from unittest import mock

from neo_dev_webhook.deploy.verify_live_compose import verify
from neo_dev_webhook.deploy.verify_hermes_contract import load_contract, verify as verify_hermes
from neo_dev_webhook.consumer import build_parser as build_consumer_parser


class DeploymentSourceTest(unittest.TestCase):
    REAL_PROCESS_GUARD_ENV = {
        **os.environ,
        "CONTROLLER_FIXTURE_CHECK_REAL_PROCESSES": "1",
    }

    @staticmethod
    def _hermes_fixture_data(directory):
        root = pathlib.Path(directory) / "root"
        root.mkdir()
        (root / ".hermes-scope-fixture").write_text("guard\n")
        return root / "opt/data"

    @staticmethod
    def _wait_for_process_guard(script):
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            result = subprocess.run([str(script), "fixture-check-inactive"],
                                    capture_output=True, text=True,
                                    env=DeploymentSourceTest.REAL_PROCESS_GUARD_ENV)
            if result.returncode != 0 and "still active" in result.stderr:
                return result
            time.sleep(0.01)
        raise AssertionError("controller process was not observed before deadline")

    @staticmethod
    def _wait_for_process_guard_clear(script):
        deadline = time.monotonic() + 5
        last_result = None
        while time.monotonic() < deadline:
            last_result = subprocess.run([str(script), "fixture-check-inactive"],
                                         capture_output=True, text=True,
                                         env=DeploymentSourceTest.REAL_PROCESS_GUARD_ENV)
            if last_result.returncode == 0:
                return
            time.sleep(0.01)
        detail = last_result.stderr.strip() if last_result is not None else "not checked"
        raise AssertionError(f"controller process guard did not clear before deadline: {detail}")

    def test_profile_contains_complete_orchestrator_and_gate_contract(self):
        root = pathlib.Path(__file__).parents[1]
        profile = (root / "deploy/profile.managed-block.md").read_text()
        for required in (
            "persistent `dev` profile is Neo Dev", "`snapflow-orchestrator` skill",
            "/opt/data/profiles/dev/projects/snapflow.md", "OpenSpec explore/new/proposal",
            "delta specs, design, and tasks", "/approve-spec <sha>",
            "sole resumable Codex implementation worker", "Cucumber/Playwright",
            "exact-implementation-SHA CI", "fresh independent", "same Codex session",
            "/accept <implementation-sha>", "sync delta specs", "archive the change",
            "final exact-SHA CI", "separate `/merge`", "/revise-spec", "/fix",
            "/cancel", "byte-frozen", "Record progress", "release, deployment",
            "secrets/access", "destructive cleanup", "at most two unsuccessful",
            "non_convergent", "kanban_complete", "reconcile-phase.py", "kanban_block",
            "normal human-wait", "without recursively reconciling",
            "/preview <full-40-char-sha>", "optional", "CLEAN independent review",
            "/mnt/marder/docker/dockge/stacks/snapflow-test",
            "https://snapflow-test.kingkill.org", "runnable product implementation",
            "never implies acceptance", "must already resolve",
        ):
            self.assertIn(required, profile)
        self.assertIn("no transition-only tool", profile)

    def test_staging_installs_no_plugin_or_tool_surface_restriction(self):
        root = pathlib.Path(__file__).parents[1]
        stage = (root / "deploy/hermes-stage.sh").read_text()
        self.assertNotIn("tools disable", stage)
        self.assertNotIn("tools enable", stage)
        self.assertNotIn("hermes-plugin", stage)
        self.assertNotIn("controller-install", stage)
        retire = (root / "deploy/controller-retire.sh").read_text()
        self.assertIn("CONTROLLER_RETIRE_AUTHORIZED:-} == MICHAEL_APPROVED", retire)
        self.assertNotIn("CONTROLLER_RETIRE_AUTHORIZED:-} == YES", retire)

    def test_hermes_fixture_stage_and_rollback_are_byte_identical(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "root"
            backup = pathlib.Path(directory) / "backup"
            root.mkdir()
            (root / ".hermes-scope-fixture").write_text("guard\n")
            (root / "existing").write_bytes(b"before\x00")
            before = {str(path.relative_to(root)): path.read_bytes()
                      for path in root.rglob("*") if path.is_file()}
            subprocess.run([str(script), "fixture-install", str(root), str(backup)], check=True)
            subprocess.run([str(script), "fixture-rollback", str(root), str(backup)], check=True)
            after = {str(path.relative_to(root)): path.read_bytes()
                     for path in root.rglob("*") if path.is_file()}
            self.assertEqual(after, before)

    def test_real_install_and_rollback_restore_initially_absent_scope(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        with tempfile.TemporaryDirectory() as directory:
            data = self._hermes_fixture_data(directory)
            env = {**os.environ, "NEO_DEV_DATA_ROOT": str(data)}
            result = subprocess.run([str(script), "install"], check=True, env=env,
                                    capture_output=True, text=True)
            backup = result.stdout.strip()
            live = data / "services/snapflow-neo-dev-webhook/src"
            self.assertTrue(live.exists())
            helper = data / "scripts/neo-dev/task.py"
            self.assertEqual(helper.read_bytes(),
                             (script.parent / "task.py").read_bytes())
            self.assertTrue(os.access(helper, os.X_OK))
            phase_helper = data / "scripts/neo-dev/reconcile-phase.py"
            self.assertEqual(phase_helper.read_bytes(),
                             (script.parent / "reconcile_phase.py").read_bytes())
            self.assertTrue(os.access(phase_helper, os.X_OK))
            subprocess.run([str(script), "verify"], check=True, env=env)
            subprocess.run([str(script), "rollback", backup], check=True, env=env)
            self.assertFalse(live.exists())
            self.assertFalse((data / "profiles/dev/SOUL.md").exists())
            self.assertFalse(helper.exists())

    def test_profile_without_final_newline_gets_separated_managed_block(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        with tempfile.TemporaryDirectory() as directory:
            data = self._hermes_fixture_data(directory)
            profile = data / "profiles/dev/SOUL.md"
            profile.parent.mkdir(parents=True)
            profile.write_bytes(b"unrelated content")
            env = {**os.environ, "NEO_DEV_DATA_ROOT": str(data)}
            subprocess.run([str(script), "install"], check=True, env=env,
                           capture_output=True, text=True)
            self.assertTrue(profile.read_text().startswith(
                "unrelated content\n<!-- snapflow-neo-dev-orchestrator:start -->\n"
            ))

    def test_install_verification_failure_restores_exact_scope(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "root"
            data = root / "opt/data"
            root.mkdir(); (root / ".hermes-scope-fixture").write_text("guard\n")
            profile = data / "profiles/dev/SOUL.md"
            profile.parent.mkdir(parents=True)
            profile.write_bytes(b"original-without-newline")
            before = profile.read_bytes()
            result = subprocess.run(
                [str(script), "install"],
                env={**os.environ, "NEO_DEV_DATA_ROOT": str(data),
                     "NEO_DEV_INJECT_VERIFY_FAILURE": "1"},
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("exact backup restored", result.stderr)
            self.assertEqual(profile.read_bytes(), before)
            self.assertFalse((data / "services/snapflow-neo-dev-webhook/src").exists())
            self.assertFalse((data / "scripts/neo-dev/task.py").exists())
            self.assertFalse((data / "scripts/neo-dev/reconcile-phase.py").exists())

            result = subprocess.run(
                [str(script), "install"],
                env={**os.environ, "NEO_DEV_DATA_ROOT": str(data),
                     "NEO_DEV_INJECT_LATE_DRIFT": "1"},
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(profile.read_bytes(), before)
            self.assertFalse((data / "lib/neo_dev_webhook").exists())

            for variable in ("NEO_DEV_INJECT_MUTATION_FAILURE", "NEO_DEV_INJECT_MUTATION_SIGNAL"):
                result = subprocess.run([str(script), "install"], env={
                    **os.environ, "NEO_DEV_DATA_ROOT": str(data), variable: "1"
                }, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(profile.read_bytes(), before)

    def test_real_staging_requires_explicit_michael_authorization(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        env = {key: value for key, value in os.environ.items()
               if key not in {"NEO_DEV_DEPLOY_AUTHORIZED", "NEO_DEV_DATA_ROOT"}}
        result = subprocess.run([str(script), "install"], capture_output=True, text=True,
                                env=env)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Michael deployment authorization required", result.stderr)

    def test_staging_canonicalizes_production_aliases_and_rejects_unmarked_roots(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        clean_env = {key: value for key, value in os.environ.items()
                     if key not in {"NEO_DEV_DEPLOY_AUTHORIZED", "NEO_DEV_DATA_ROOT"}}
        with tempfile.TemporaryDirectory() as directory:
            alias = pathlib.Path(directory) / "data-alias"
            alias.symlink_to("/opt/data", target_is_directory=True)
            for spelling in ("/opt/data/", "/opt/data/.", str(alias)):
                with self.subTest(spelling=spelling):
                    result = subprocess.run(
                        [str(script), "install"],
                        env={**clean_env, "NEO_DEV_DATA_ROOT": spelling},
                        capture_output=True, text=True,
                    )
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("Michael deployment authorization required", result.stderr)
            self.assertTrue(alias.is_symlink())

        with tempfile.TemporaryDirectory() as directory:
            data = pathlib.Path(directory) / "unmarked/opt/data"
            sentinel = data / "profiles/dev/SOUL.md"
            sentinel.parent.mkdir(parents=True)
            sentinel.write_bytes(b"must-not-change\x00")
            before = {str(path.relative_to(data)): path.read_bytes()
                      for path in data.rglob("*") if path.is_file()}
            result = subprocess.run(
                [str(script), "install"],
                env={**clean_env, "NEO_DEV_DATA_ROOT": str(data)},
                capture_output=True, text=True,
            )
            self.assertNotEqual(result.returncode, 0)
            after = {str(path.relative_to(data)): path.read_bytes()
                     for path in data.rglob("*") if path.is_file()}
            self.assertEqual(after, before)
            self.assertFalse((data / "backups").exists())

    def test_upgrade_removes_stale_hermes_scope_and_rollback_restores_exact_tree(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        with tempfile.TemporaryDirectory() as directory:
            data = self._hermes_fixture_data(directory)
            stale = {
                "services/snapflow-neo-dev-webhook/src/neo_dev_webhook/project_control.py": b"old-module\n",
                "services/snapflow-neo-dev-webhook/src/unrelated.txt": b"stale-root\n",
                "profiles/dev/plugins/snapflow_neo_dev_transition/plugin.yaml": b"old-plugin\n",
                "profiles/dev/.snapflow-neo-dev-tools.enforced": b"old-marker\n",
                "bin/neo-dev-project-control": b"old-adapter\n",
                "bin/snapflow-neo-dev-transition": b"old-transition\n",
                "lib/neo_dev_webhook/project_control.py": b"old-library\n",
                "profiles/dev/SOUL.md": b"before-profile\n",
                "scripts/neo-dev/task.py": b"old-task-helper\x00",
            }
            for relative, content in stale.items():
                target = data / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            before = {str(path.relative_to(data)): path.read_bytes()
                      for path in data.rglob("*") if path.is_file()}
            env = {**os.environ, "NEO_DEV_DATA_ROOT": str(data)}
            result = subprocess.run([str(script), "install"], check=True, env=env,
                                    capture_output=True, text=True)
            backup = result.stdout.strip()
            package = data / "services/snapflow-neo-dev-webhook/src/neo_dev_webhook"
            self.assertEqual({path.name for path in package.iterdir()},
                             {"__init__.py", "automation.py", "consumer.py", "server.py"})
            self.assertFalse((data / "services/snapflow-neo-dev-webhook/src/unrelated.txt").exists())
            installed_profile = (data / "profiles/dev/SOUL.md").read_text()
            self.assertTrue(installed_profile.startswith("before-profile\n"))
            self.assertEqual(installed_profile.count("before-profile"), 1)
            for relative in (
                "profiles/dev/plugins/snapflow_neo_dev_transition",
                "profiles/dev/.snapflow-neo-dev-tools.enforced",
                "bin/neo-dev-project-control", "bin/snapflow-neo-dev-transition",
                "lib/neo_dev_webhook",
            ):
                self.assertFalse((data / relative).exists())
            subprocess.run([str(script), "verify"], check=True, env=env)
            self.assertEqual((data / "scripts/neo-dev/task.py").read_bytes(),
                             (script.parent / "task.py").read_bytes())
            subprocess.run([str(script), "rollback", backup], check=True, env=env)
            after = {str(path.relative_to(data)): path.read_bytes()
                     for path in data.rglob("*") if path.is_file()
                     and not str(path.relative_to(data)).startswith("backups/")}
            self.assertEqual(after, before)

    def test_staging_rejects_malformed_markers_before_mutation(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/hermes-stage.sh"
        malformed = (
            "<!-- snapflow-neo-dev-orchestrator:start -->\nmissing\n",
            "<!-- snapflow-neo-dev-orchestrator:end -->\nmissing\n",
            "<!-- snapflow-neo-dev-orchestrator:end -->\n<!-- snapflow-neo-dev-orchestrator:start -->\n",
            "<!-- snapflow-neo-dev-orchestrator:start -->\na\n<!-- snapflow-neo-dev-orchestrator:start -->\n<!-- snapflow-neo-dev-orchestrator:end -->\n<!-- snapflow-neo-dev-orchestrator:end -->\n",
        )
        for content in malformed:
            with self.subTest(content=content), tempfile.TemporaryDirectory() as directory:
                data = self._hermes_fixture_data(directory)
                profile = data / "profiles/dev/SOUL.md"
                profile.parent.mkdir(parents=True)
                original = ("unrelated-before\n" + content + "unrelated-after\n").encode()
                profile.write_bytes(original)
                result = subprocess.run([str(script), "install"],
                                        env={**os.environ, "NEO_DEV_DATA_ROOT": str(data)},
                                        capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(profile.read_bytes(), original)
                self.assertFalse((data / "services").exists())
                self.assertFalse((data / "backups").exists())

    @staticmethod
    def _load_task_helper():
        helper = pathlib.Path(__file__).parents[1] / "deploy/task.py"
        spec = importlib.util.spec_from_file_location("managed_neo_dev_task", helper)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    @staticmethod
    def _task_args(module):
        return module.parse_args([
            "title", "--body", "body", "--max-runtime", "2h",
            "--workspace", "dir:/opt/data/profiles/dev", "--board", "private-dev",
            "--assignee", "dev", "--idempotency-key", str(uuid.uuid4()),
        ])

    @staticmethod
    def _kanban(rows):
        connection = mock.MagicMock()
        connection.execute.return_value.fetchall.side_effect = rows
        kanban = mock.MagicMock()
        kanban.connect_closing.return_value = contextlib.nullcontext(connection)
        kanban.kanban_db_path.return_value = pathlib.Path("/host/private-dev.db")
        return kanban, connection

    def test_owned_task_helper_uses_exact_hermes_create_and_dispatch_argv(self):
        module = self._load_task_helper()
        args = self._task_args(module)
        row = {"id": "card-1", "title": "title", "body": "body", "assignee": "dev",
               "workspace_kind": "dir", "workspace_path": "/opt/data/profiles/dev"}
        kanban, _ = self._kanban([[], [row]])
        created = mock.Mock(returncode=0, stdout='{"id":"card-1","status":"ready"}\n')
        with mock.patch.object(module.subprocess, "run", return_value=created) as run:
            self.assertEqual(module.create_or_reconcile(args, kanban), "card-1")
            module.dispatch(args, kanban)
        self.assertEqual(run.call_args_list[0].args[0], [
            "/opt/hermes/.venv/bin/hermes", "kanban", "--board", "private-dev",
            "create", "title", "--body", "body", "--max-runtime", "2h",
            "--workspace", "dir:/opt/data/profiles/dev", "--assignee", "dev",
            "--idempotency-key", args.idempotency_key,
            "--skill", "snapflow-orchestrator", "--json",
        ])
        self.assertEqual(run.call_args_list[0].kwargs["env"]["HERMES_KANBAN_DB"],
                         "/host/private-dev.db")
        self.assertEqual(run.call_args_list[1].args[0], [
            "/opt/hermes/.venv/bin/hermes", "kanban", "--board", "private-dev",
            "dispatch", "--max", "1", "--json",
        ])
        self.assertEqual(run.call_args_list[1].kwargs["timeout"], 10)
        self.assertEqual(run.call_args_list[1].kwargs["env"]["HERMES_KANBAN_DB"],
                         "/host/private-dev.db")
        self.assertEqual(kanban.connect_closing.call_args_list,
                         [mock.call(board="private-dev"), mock.call(board="private-dev")])

    def test_owned_task_helper_reconciles_uncertain_results_and_rejects_ambiguity(self):
        module = self._load_task_helper()
        args = self._task_args(module)
        row = {"id": "card-1", "title": "title", "body": "body", "assignee": "dev",
               "workspace_kind": "dir", "workspace_path": "/opt/data/profiles/dev"}
        uncertain = (
            subprocess.TimeoutExpired("hermes", 60),
            mock.Mock(returncode=7, stdout=""),
            mock.Mock(returncode=0, stdout="not a creation result\n"),
            mock.Mock(returncode=0, stdout='{"id":"conflicting-card"}\n'),
        )
        for outcome in uncertain:
            with self.subTest(outcome=outcome):
                kanban, _ = self._kanban([[], [row]])
                effect = outcome if isinstance(outcome, BaseException) else None
                with mock.patch.object(module.subprocess, "run", side_effect=effect,
                                       return_value=None if effect else outcome):
                    self.assertEqual(module.create_or_reconcile(args, kanban), "card-1")
                kanban, _ = self._kanban([[], []])
                with mock.patch.object(module.subprocess, "run", side_effect=effect,
                                       return_value=None if effect else outcome):
                    with self.assertRaises(RuntimeError):
                        module.create_or_reconcile(args, kanban)
                self.assertEqual(kanban.connect_closing.call_count, 2)
        kanban, _ = self._kanban([[], [row, row]])
        with mock.patch.object(module.subprocess, "run",
                               return_value=mock.Mock(returncode=0, stdout="ambiguous")):
            with self.assertRaisesRegex(RuntimeError, "ambiguous"):
                module.create_or_reconcile(args, kanban)

    def test_owned_task_helper_lock_idempotency_stdout_and_route_rejection(self):
        module = self._load_task_helper()
        args = self._task_args(module)
        row = {"id": "existing", "title": "title", "body": "body", "assignee": "dev",
               "workspace_kind": "dir", "workspace_path": "/opt/data/profiles/dev"}
        kanban, _ = self._kanban([[row]])
        with tempfile.TemporaryDirectory() as directory, \
             mock.patch.object(module, "LOCK_PATH", pathlib.Path(directory) / "lock"), \
             mock.patch.object(module, "load_kanban_db", return_value=kanban), \
             mock.patch.object(module.fcntl, "flock") as flock, \
             mock.patch.object(module, "dispatch") as dispatch, \
             mock.patch.object(module.subprocess, "run") as run, \
             contextlib.redirect_stdout(io.StringIO()) as stdout:
            module.main([
                args.title, "--body", args.body, "--max-runtime", args.max_runtime,
                "--workspace", args.workspace, "--board", args.board,
                "--assignee", args.assignee, "--idempotency-key", args.idempotency_key,
            ])
        self.assertEqual(stdout.getvalue(), '{"task_id":"existing","durable":true}\n')
        flock.assert_called_once()
        run.assert_not_called()
        dispatch.assert_called_once_with(mock.ANY, kanban)
        for option, wrong in (("--board", "dev"), ("--assignee", "neo-dev"),
                              ("--max-runtime", "120m")):
            values = [args.title, "--body", args.body, "--max-runtime", args.max_runtime,
                      "--workspace", args.workspace, "--board", args.board,
                      "--assignee", args.assignee, "--idempotency-key", args.idempotency_key]
            values[values.index(option) + 1] = wrong
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                module.parse_args(values)

    def test_archived_idempotency_match_is_authoritative(self):
        module = self._load_task_helper()
        args = self._task_args(module)
        archived = {"id": "archived-card", "title": "title", "body": "body",
                    "assignee": "dev", "workspace_kind": "dir",
                    "workspace_path": "/opt/data/profiles/dev"}
        kanban, connection = self._kanban([[archived]])
        with mock.patch.object(module.subprocess, "run") as run:
            self.assertEqual(module.create_or_reconcile(args, kanban), "archived-card")
        run.assert_not_called()
        query = connection.execute.call_args.args[0]
        self.assertNotIn("archived", query.lower())

    def test_consumer_rejects_noncanonical_max_runtime(self):
        parser = build_consumer_parser()
        self.assertEqual(parser.parse_args(["db.sqlite", "--max-runtime", "2h"]).max_runtime,
                         "2h")
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            parser.parse_args(["db.sqlite", "--max-runtime", "120m"])

    def test_pinned_hermes_contract_data_and_read_only_verifier(self):
        contract = load_contract()
        self.assertEqual(contract["version_output"], "Hermes Agent v0.20.0 (2026.8.3)")
        self.assertEqual(contract["install_root"], "/opt/hermes")
        self.assertEqual(contract["binary"], "/opt/hermes/.venv/bin/hermes")
        self.assertEqual(contract["board"], "private-dev")
        self.assertEqual(set(contract["create_options"]), {
            "--help", "--body", "--assignee", "--parent", "--workspace",
            "--branch", "--project", "--tenant", "--priority", "--triage",
            "--idempotency-key", "--max-runtime", "--created-by", "--skill",
            "--max-retries", "--model", "--provider", "--goal",
            "--goal-max-turns", "--initial-status", "--json",
        })
        self.assertEqual(set(contract["dispatch_options"]),
                         {"--help", "--dry-run", "--max", "--failure-limit", "--json"})
        columns = contract["task_table_info"]
        self.assertEqual([column["name"] for column in columns], [
            "id", "title", "body", "assignee", "status", "priority", "created_by",
            "created_at", "started_at", "completed_at", "workspace_kind",
            "workspace_path", "branch_name", "project_id", "claim_lock",
            "claim_expires", "tenant", "result", "idempotency_key",
            "consecutive_failures", "worker_pid", "last_failure_error",
            "max_runtime_seconds", "last_heartbeat_at", "current_run_id",
            "workflow_template_id", "current_step_key", "skills", "model_override",
            "provider_override", "reasoning_effort", "max_retries", "goal_mode",
            "goal_max_turns", "session_id", "block_kind", "block_recurrences",
        ])
        self.assertEqual(columns[7], {
            "cid": 7, "name": "created_at", "type": "INTEGER", "notnull": 1,
            "dflt_value": None, "pk": 0,
        })
        self.assertEqual(contract["idempotency_index"], {
            "name": "idx_tasks_idempotency", "unique": 0,
            "origin": "c", "partial": 0,
            "index_info": [{"seqno": 0, "cid": 18, "name": "idempotency_key"}],
        })

        connection = mock.MagicMock()
        indexes = [{"name": "idx_tasks_idempotency", "unique": 0,
                    "origin": "c", "partial": 0}]
        index_info = [{"seqno": 0, "cid": 18, "name": "idempotency_key"}]
        connection.execute.side_effect = [columns, indexes, index_info,
                                          mock.Mock(fetchone=lambda: {"contract_probe": 1})]
        kb = mock.Mock()
        kb.kanban_db_path.return_value = pathlib.Path("/host/private-dev.db")

        def run(command):
            if command[-1] == "--version":
                return ("\n" + contract["version_output"] + "\n"
                        "Install directory: /opt/hermes\n"
                        "Python: 3.13.5\nOpenAI SDK: 2.24.0\nRun hermes --help\n")
            if "create" in command:
                options = contract["create_options"]
            else:
                options = contract["dispatch_options"]
            return "options:\n" + "\n".join(f"  {option} VALUE" for option in options) \
                + "\n  descriptions may mention --ignored without declaring it\n"

        sqlite_connect = mock.Mock(return_value=connection)
        result = verify_hermes(
            contract, run=run, import_module=lambda name: kb,
            sqlite_connect=sqlite_connect, is_file=lambda path: True,
        )
        self.assertEqual(result["board"], "private-dev")
        kb.kanban_db_path.assert_called_once_with(board="private-dev")
        self.assertEqual(connection.row_factory, __import__("sqlite3").Row)
        sqlite_connect.assert_called_once_with("file:/host/private-dev.db?mode=ro", uri=True)
        connection.close.assert_called_once()

        schema_drifts = []
        changed = [dict(column) for column in columns]
        changed[2]["type"] = "BLOB"; schema_drifts.append(("type", changed))
        changed = [dict(column) for column in columns]
        changed[1]["notnull"] = 0; schema_drifts.append(("nullability", changed))
        changed = [dict(column) for column in columns]
        changed[7]["dflt_value"] = "CURRENT_TIMESTAMP"
        schema_drifts.append(("default", changed))
        schema_drifts.append(("order", [columns[1], columns[0], *columns[2:]]))
        schema_drifts.append(("extra", [*columns, {
            "cid": 37, "name": "unexpected", "type": "TEXT", "notnull": 0,
            "dflt_value": None, "pk": 0,
        }]))
        for drift_name, drift_columns in schema_drifts:
            drift = mock.MagicMock()
            drift.execute.side_effect = [drift_columns]
            with self.subTest(schema_drift=drift_name), \
                    self.assertRaisesRegex(RuntimeError, "tasks table schema drifted"):
                verify_hermes(contract, run=run, import_module=lambda name: kb,
                              sqlite_connect=lambda *a, **k: drift,
                              is_file=lambda path: True)

        for command_name, drift_name, replacement in (
            ("create", "missing", contract["create_options"][:-1]),
            ("create", "extra", [*contract["create_options"], "--unexpected"]),
            ("dispatch", "missing", contract["dispatch_options"][:-1]),
            ("dispatch", "extra", [*contract["dispatch_options"], "--unexpected"]),
        ):
            def drift_run(command, replacement=replacement, command_name=command_name):
                if command[-1] == "--version":
                    return contract["version_output"] + "\nInstall directory: /opt/hermes\n"
                current = "create" if "create" in command else "dispatch"
                options = replacement if current == command_name else contract[f"{current}_options"]
                return "\n".join(f"  {option} VALUE" for option in options)
            with self.subTest(command=command_name, option_drift=drift_name), \
                    self.assertRaisesRegex(RuntimeError, "help option drift"):
                verify_hermes(contract, run=drift_run, is_file=lambda path: True)

        for index_rows, info_rows, message in (
            ([], index_info, "missing or definition"),
            ([{"name": "idx_tasks_idempotency", "unique": 1,
               "origin": "c", "partial": 0}], index_info, "missing or definition"),
            ([{"name": "idx_tasks_idempotency", "unique": 0,
               "origin": "u", "partial": 0}], index_info, "missing or definition"),
            ([{"name": "idx_tasks_idempotency", "unique": 0,
               "origin": "c", "partial": 1}], index_info, "missing or definition"),
            (indexes, [{"seqno": 0, "cid": 17, "name": "idempotency_key"}],
             "info drifted"),
        ):
            drift = mock.MagicMock()
            drift.execute.side_effect = [columns, index_rows, info_rows]
            with self.subTest(message=message), self.assertRaisesRegex(RuntimeError, message):
                verify_hermes(contract, run=run, import_module=lambda name: kb,
                              sqlite_connect=lambda *a, **k: drift,
                              is_file=lambda path: True)

        with self.assertRaisesRegex(RuntimeError, "install directory mismatch"):
            verify_hermes(
                contract,
                run=lambda command: (
                    contract["version_output"] + "\nInstall directory: /wrong\n"
                    if command[-1] == "--version" else ""
                ),
                is_file=lambda path: True,
            )

    def test_controller_retirement_fixture_is_exactly_reversible(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/controller-retire.sh"
        managed = (
            "usr/local/lib/neo_dev_webhook", "usr/local/lib/neo-dev-project-control",
            "usr/local/bin/neo-dev-project-control", "usr/local/bin/neo-dev-forced-command",
            "usr/local/sbin/neo-dev-project-control-privileged",
            "usr/local/sbin/neo-dev-project-worker", "usr/local/sbin/neo-dev-runtime-supervisor",
            "etc/neo-dev/project-control", "etc/sudoers.d/neo-dev-control",
            "var/lib/neo-dev/project-control",
        )
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "root"
            backup = pathlib.Path(directory) / "backup"
            root.mkdir()
            (root / ".controller-retire-fixture").write_text("guard\n")
            for index, relative in enumerate(managed[::2]):
                target = root / relative
                target.mkdir(parents=True)
                (target / "bytes").write_bytes(f"value-{index}".encode() + b"\x00")
            unrelated = root / "home/neo-controller/.ssh/authorized_keys"
            unrelated.parent.mkdir(parents=True)
            unrelated.write_bytes(b"untouched\n")
            before = {str(path.relative_to(root)): path.read_bytes()
                      for path in root.rglob("*") if path.is_file()}
            subprocess.run([str(script), "fixture-retire", str(root), str(backup)], check=True)
            subprocess.run([str(script), "fixture-verify", str(root)], check=True)
            self.assertEqual(unrelated.read_bytes(), b"untouched\n")
            subprocess.run([str(script), "fixture-rollback", str(root), str(backup)], check=True)
            after = {str(path.relative_to(root)): path.read_bytes()
                     for path in root.rglob("*") if path.is_file()}
            self.assertEqual(after, before)

    def test_controller_retirement_rejects_tampered_backup_and_active_process(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/controller-retire.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "root"
            backup = pathlib.Path(directory) / "backup"
            root.mkdir()
            (root / ".controller-retire-fixture").write_text("guard\n")
            target = root / "usr/local/lib/neo_dev_webhook/file"
            target.parent.mkdir(parents=True)
            target.write_bytes(b"controller-bytes\n")
            subprocess.run([str(script), "fixture-retire", str(root), str(backup)], check=True)
            with (backup / "state.tar").open("ab") as archive:
                archive.write(b"tampered")
            result = subprocess.run([str(script), "fixture-rollback", str(root), str(backup)],
                                    capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(target.exists())
        executable_names = (
            "/usr/local/lib/neo-dev-project-control/neo-dev-codex-runtime",
            "/usr/local/bin/neo-dev-project-control",
            "/usr/local/bin/neo-dev-remote-project-control",
            "/usr/local/bin/neo-dev-forced-command",
            "/usr/local/sbin/neo-dev-project-control-privileged",
            "/usr/local/sbin/neo-dev-project-worker",
            "/usr/local/sbin/neo-dev-runtime-supervisor",
        )
        module_names = (
            "codex_runtime", "independent_review", "independent_review_canary",
            "deterministic_gates", "gate_exec", "gate_scan", "verification",
            "operator_commands", "forced_command", "project_control", "project_worker",
            "runtime_supervisor", "remote_adapter",
        )
        process_names = (executable_names
                         + tuple(f"neo_dev_webhook.{name}" for name in module_names)
                         + tuple(f"/usr/local/lib/neo_dev_webhook/{name}.py"
                                 for name in module_names))
        for process_name in process_names:
            with self.subTest(process_name=process_name):
                active = subprocess.Popen(
                    ["bash", "-c", f"exec -a {process_name} sleep 30"]
                )
                try:
                    result = self._wait_for_process_guard(script)
                    self.assertNotEqual(result.returncode, 0)
                    self.assertIn("still active", result.stderr)
                finally:
                    try:
                        active.terminate()
                        active.wait(timeout=2)
                    finally:
                        self._wait_for_process_guard_clear(script)

    def test_controller_access_retirement_fixtures_restore_exact_ssh_and_account_state(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/controller-access-retire.sh"
        for ssh_present in (False, True):
            with self.subTest(ssh_present=ssh_present), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory) / "root"
                backup = pathlib.Path(directory) / "backup"
                root.mkdir(); (root / ".controller-access-fixture").write_text("guard\n")
                (root / "home").write_text("/home/neo-controller\n")
                (root / "shell").write_text("/bin/bash\n")
                (root / "hash").write_text("$6$exact-hash\n")
                if ssh_present:
                    ssh = root / "home-dir/neo-controller/.ssh"
                    ssh.mkdir(parents=True)
                    (ssh / "authorized_keys").write_bytes(b"exact-key\x00\n")
                before = {str(path.relative_to(root)): path.read_bytes()
                          for path in root.rglob("*") if path.is_file()}
                subprocess.run([str(script), "fixture-retire", str(root), str(backup)],
                               check=True)
                self.assertFalse((root / "home-dir/neo-controller/.ssh").exists())
                self.assertEqual((root / "shell").read_text(), "/usr/sbin/nologin\n")
                self.assertTrue((root / "hash").read_text().startswith("!"))
                self.assertIn("retire:usermod-lock-nologin",
                              (backup / "account-operations").read_text())
                subprocess.run([str(script), "fixture-rollback", str(root), str(backup)],
                               check=True)
                after = {str(path.relative_to(root)): path.read_bytes()
                         for path in root.rglob("*") if path.is_file()}
                self.assertEqual(after, before)

    def test_controller_access_retirement_fails_closed_and_rolls_back(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/controller-access-retire.sh"
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "root"; backup = pathlib.Path(directory) / "backup"
            root.mkdir(); (root / ".controller-access-fixture").write_text("guard\n")
            (root / "home").write_text("/wrong/home\n"); (root / "shell").write_text("/bin/bash\n"); (root / "hash").write_text("hash\n")
            self.assertNotEqual(subprocess.run([str(script), "fixture-retire", str(root), str(backup)]).returncode, 0)
            (root / "home").write_text("/home/neo-controller\n")
            before = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            result = subprocess.run([str(script), "fixture-retire", str(root), str(backup)],
                                    env={**os.environ, "CONTROLLER_ACCESS_INJECT_FAILURE": "1"})
            self.assertNotEqual(result.returncode, 0)
            after = {str(p.relative_to(root)): p.read_bytes() for p in root.rglob("*") if p.is_file()}
            self.assertEqual(after, before)
            self.assertEqual((backup / "account-operations").read_text().splitlines(), [
                "retire:ssh-remove", "retire:usermod-lock-nologin", "rollback-after-failure"
            ])
            with (backup / "state.tar").open("ab") as stream: stream.write(b"tamper")
            self.assertNotEqual(subprocess.run([str(script), "fixture-rollback", str(root), str(backup)]).returncode, 0)

        guard_script = pathlib.Path(__file__).parents[1] / "deploy/controller-retire.sh"
        active = subprocess.Popen(["bash", "-c", "exec -a neo_dev_webhook.project_control sleep 30"])
        try:
            self._wait_for_process_guard(guard_script)
            with tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory); backup = root.parent / "access-backup"
                (root / ".controller-access-fixture").write_text("guard\n"); (root / "home").write_text("/home/neo-controller\n"); (root / "shell").write_text("/bin/bash\n"); (root / "hash").write_text("hash\n")
                self.assertNotEqual(subprocess.run(
                    [str(script), "fixture-retire", str(root), str(backup)],
                    env=self.REAL_PROCESS_GUARD_ENV,
                ).returncode, 0)
                self.assertFalse(backup.exists())
        finally:
            try:
                active.terminate(); active.wait(timeout=2)
            finally:
                self._wait_for_process_guard_clear(guard_script)

    def test_controller_access_retirement_signals_restore_exact_fixture_state(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/controller-access-retire.sh"
        for signal_name in ("TERM", "HUP"):
            for mutation_point in ("ssh-remove", "account-mutation"):
                with self.subTest(signal=signal_name, mutation_point=mutation_point), \
                        tempfile.TemporaryDirectory() as directory:
                    root = pathlib.Path(directory) / "root"
                    backup = pathlib.Path(directory) / "backup"
                    root.mkdir()
                    (root / ".controller-access-fixture").write_text("guard\n")
                    (root / "home").write_text("/home/neo-controller\n")
                    (root / "shell").write_text("/bin/bash\n")
                    (root / "hash").write_text("$6$exact-hash\n")
                    ssh = root / "home-dir/neo-controller/.ssh"
                    ssh.mkdir(parents=True)
                    (ssh / "authorized_keys").write_bytes(b"exact-key\x00\n")
                    before = {str(path.relative_to(root)): path.read_bytes()
                              for path in root.rglob("*") if path.is_file()}
                    result = subprocess.run(
                        [str(script), "fixture-retire", str(root), str(backup)],
                        env={**os.environ,
                             "CONTROLLER_ACCESS_INJECT_SIGNAL": signal_name,
                             "CONTROLLER_ACCESS_INJECT_SIGNAL_POINT": mutation_point},
                    )
                    self.assertNotEqual(result.returncode, 0)
                    after = {str(path.relative_to(root)): path.read_bytes()
                             for path in root.rglob("*") if path.is_file()}
                    self.assertEqual(after, before)
                    self.assertEqual(
                        (backup / "account-operations").read_text().splitlines(),
                        ["retire:ssh-remove", "retire:usermod-lock-nologin",
                         "rollback-after-failure"],
                    )

    def test_controller_retire_partial_failure_and_signal_restore_fixture(self):
        script = pathlib.Path(__file__).parents[1] / "deploy/controller-retire.sh"
        for variable in ("CONTROLLER_RETIRE_INJECT_FAILURE", "CONTROLLER_RETIRE_INJECT_SIGNAL"):
            with self.subTest(variable=variable), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory) / "root"; backup = pathlib.Path(directory) / "backup"
                root.mkdir(); (root / ".controller-retire-fixture").write_text("guard\n")
                target = root / "usr/local/lib/neo_dev_webhook/file"
                target.parent.mkdir(parents=True); target.write_bytes(b"exact\x00")
                result = subprocess.run([str(script), "fixture-retire", str(root), str(backup)],
                                        env={**os.environ, variable: "1"})
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(target.read_bytes(), b"exact\x00")

    def test_canonical_specs_record_current_bootstrap_and_no_controller_contract(self):
        repo = pathlib.Path(__file__).parents[3]
        workflow = (repo / "openspec/specs/governed-development-workflow/spec.md").read_text()
        handoff = (repo / "openspec/specs/github-webhook-handoff/spec.md").read_text()
        self.assertIn("2026-08-08 persistent Neo Dev self-bootstrap", workflow)
        self.assertNotIn("Issue 77 SHALL", workflow)
        self.assertIn("`--board private-dev`, `--assignee dev`, and `--max-runtime 2h`", handoff)
        for text in (workflow, handoff):
            self.assertNotIn("CapabilityBroker", text)
            self.assertNotIn("one active task", text.lower())

    def test_live_compose_commands_remain_bounded_to_receiver_and_consumer(self):
        fixture = pathlib.Path(__file__).with_name("fixtures") / "live-compose.yaml"
        text = fixture.read_text()
        verify(text)
        with self.assertRaisesRegex(ValueError, "consumer command drift"):
            verify(text.replace("/var/lib/neo-dev/neo-dev.sqlite", "/tmp/new.sqlite"))


if __name__ == "__main__":
    unittest.main()

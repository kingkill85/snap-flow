import json
import pathlib
import socket
import tempfile
import threading
import time
import unittest
from dataclasses import replace
from unittest import mock

from neo_dev_webhook import project_worker, runtime_supervisor
from neo_dev_webhook.project_control import (
    FileResolutionStore, ISSUE_77_TARGET, ProjectWorkerExecutor, Registry,
)

KEY = "12345678-1234-4abc-8def-123456789abc"
SESSION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


class LivePrivilegeTopologyTest(unittest.TestCase):
    def test_review_accept_timeout_cleans_owner_and_same_generation_can_restart(self):
        class TimeoutServer:
            def bind(self, path): pathlib.Path(path).touch()
            def listen(self, backlog): pass
            def settimeout(self, seconds): self.timeout = seconds
            def accept(self): raise socket.timeout("injected 30-second timeout")
            def close(self): pass

        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps({"version": 1, "projects": [],
                "project_templates": [], "targets": [ISSUE_77_TARGET.as_dict()]}))
            state_path = root / "state.json"
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, ISSUE_77_TARGET)
            review = {"review_phase": "reviewer_starting", "reviewer_run_id": SESSION,
                      "review_generation": 1, "implementation_session_id": "c" * 36}
            store.save(KEY, initial, replace(initial, phase="exited_resumable",
                lifecycle_state="independent_review", implementation_sha="a" * 40,
                spec_sha="b" * 40, codex_session_id=SESSION, review_state=review,
                lifecycle_updated_at="2026-08-08T00:00:00Z", base_sha="0" * 40,
                approval_at="2026-08-08T00:00:00Z"))
            socket_root = root / "run"
            servers = []
            def server_factory(*args):
                server = TimeoutServer(); servers.append(server); return server
            patches = (mock.patch.object(runtime_supervisor, "SOCKET_ROOT", socket_root),
                       mock.patch("neo_dev_webhook.runtime_supervisor.os.geteuid", return_value=0),
                       mock.patch("neo_dev_webhook.runtime_supervisor.os.chown"),
                       mock.patch("neo_dev_webhook.runtime_supervisor.pwd.getpwnam",
                                  return_value=mock.Mock(pw_uid=1000, pw_gid=1000)),
                       mock.patch("neo_dev_webhook.runtime_supervisor.socket.socket",
                                  side_effect=server_factory))
            with patches[0], patches[1], patches[2], patches[3], patches[4]:
                for _ in range(2):
                    with self.assertRaises(socket.timeout):
                        runtime_supervisor.supervise(
                            "review", KEY, None, SESSION, registry_path=registry_path,
                            state_path=state_path)
                    self.assertFalse(runtime_supervisor.ownership_path(KEY).exists())
            self.assertEqual([server.timeout for server in servers], [30, 30])

    def test_root_only_worker_boundary_drops_exact_argv_to_dev(self):
        with mock.patch("os.geteuid", return_value=0):
            self.assertEqual(project_worker.validated_worker_argv((
                "git", "-C", "/workspace/snap-flow", "rev-parse", "--show-toplevel",
            )), (
                "/usr/bin/setpriv", "--reuid=dev", "--regid=dev", "--init-groups",
                "--no-new-privs", "--", "git", "-C", "/workspace/snap-flow",
                "rev-parse", "--show-toplevel",
            ))
            with self.assertRaises(ValueError):
                project_worker.validated_worker_argv(("git", "-c", "safe.directory=*", "status"))
            with self.assertRaises(ValueError):
                project_worker.validated_worker_argv(("git", "-csafe.directory=*", "status"))
            with self.assertRaises(ValueError):
                project_worker.validated_worker_argv(("sh", "-c", "id"))
        with mock.patch("os.geteuid", return_value=1000):
            with self.assertRaises(PermissionError):
                project_worker.validated_worker_argv(("tmux", "list-sessions"))

    def test_controller_executor_never_runs_git_or_tmux_as_root_directly(self):
        completed = mock.Mock(stdout="/workspace/snap-flow\n")
        with mock.patch("subprocess.run", return_value=completed) as run:
            result = ProjectWorkerExecutor().run(
                ("git", "-C", "/workspace/snap-flow", "rev-parse", "--show-toplevel"),
                timeout=10,
            )
        self.assertEqual(result, "/workspace/snap-flow\n")
        self.assertEqual(run.call_args.args[0][0], "/usr/local/sbin/neo-dev-project-worker")
        self.assertFalse(run.call_args.kwargs["shell"])

    def test_one_shot_root_supervisor_owns_state_while_dev_runtime_reports(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps({
                "version": 1, "projects": [], "project_templates": [],
                "targets": [ISSUE_77_TARGET.as_dict()],
            }))
            state_path = root / "state/resolutions.json"
            state_path.parent.mkdir()
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, ISSUE_77_TARGET)
            store.save(KEY, initial, replace(initial, phase="starting"))
            socket_root = root / "run"
            errors = []

            def target():
                try:
                    runtime_supervisor.supervise(
                        "start", KEY, None, registry_path=registry_path,
                        state_path=state_path,
                    )
                except BaseException as error:
                    errors.append(error)

            with mock.patch.object(runtime_supervisor, "SOCKET_ROOT", socket_root), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.os.geteuid", return_value=0), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.os.chown"), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.pwd.getpwnam", \
                            return_value=mock.Mock(pw_uid=1000, pw_gid=1000)):
                thread = threading.Thread(target=target); thread.start()
                path = socket_root / f"{KEY}.sock"
                for _ in range(100):
                    if path.exists(): break
                    time.sleep(0.01)
                client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                client.connect(str(path)); stream = client.makefile("rwb", buffering=0)
                launch = json.loads(stream.readline())
                self.assertNotIn("github_evidence", launch)
                stream.write((json.dumps({"event": "session", "session_id": SESSION}) + "\n").encode())
                stream.write((json.dumps({"event": "terminal", "exit_code": 1,
                    "semantic_outcome": "correctable", "resumable": True}) + "\n").encode())
                stream.close(); client.close(); thread.join(3)
            self.assertFalse(errors)
            self.assertFalse(path.exists())
            final = store.load(KEY)
            self.assertEqual((final.codex_session_id, final.phase), (SESSION, "exited_resumable"))

    def test_supervisor_disconnect_reconciles_launch_intent_as_recoverable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps({
                "version": 1, "projects": [], "project_templates": [],
                "targets": [ISSUE_77_TARGET.as_dict()],
            }))
            state_path = root / "state/resolutions.json"; state_path.parent.mkdir()
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, ISSUE_77_TARGET)
            store.save(KEY, initial, replace(initial, phase="starting"))
            socket_root = root / "run"
            with mock.patch.object(runtime_supervisor, "SOCKET_ROOT", socket_root), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.os.geteuid", return_value=0), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.os.chown"), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.pwd.getpwnam", \
                            return_value=mock.Mock(pw_uid=1000, pw_gid=1000)):
                thread = threading.Thread(target=runtime_supervisor.supervise,
                    args=("start", KEY, None), kwargs={"registry_path": registry_path,
                    "state_path": state_path})
                thread.start(); path = socket_root / f"{KEY}.sock"
                for _ in range(100):
                    if path.exists(): break
                    time.sleep(0.01)
                client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                client.connect(str(path)); client.recv(4096); client.close(); thread.join(3)
            final = store.load(KEY)
            self.assertEqual((final.phase, final.terminal.resumable), ("crashed", True))

    def test_supervisor_resumes_initial_spec_session_without_approval_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            registry_path = root / "registry.json"
            registry_path.write_text(json.dumps({
                "version": 1, "projects": [], "project_templates": [],
                "targets": [ISSUE_77_TARGET.as_dict()],
            }))
            state_path = root / "state/resolutions.json"; state_path.parent.mkdir()
            store = FileResolutionStore(state_path)
            initial = store.bind(KEY, ISSUE_77_TARGET)
            store.save(KEY, initial, replace(
                initial, phase="resuming", codex_session_id=SESSION,
            ))
            socket_root = root / "run"
            errors = []

            def target():
                try:
                    runtime_supervisor.supervise(
                        "resume", KEY, SESSION, registry_path=registry_path,
                        state_path=state_path,
                    )
                except BaseException as error:
                    errors.append(error)

            with mock.patch.object(runtime_supervisor, "SOCKET_ROOT", socket_root), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.os.geteuid", return_value=0), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.os.chown"), \
                 mock.patch("neo_dev_webhook.runtime_supervisor.pwd.getpwnam", \
                            return_value=mock.Mock(pw_uid=1000, pw_gid=1000)):
                thread = threading.Thread(target=target); thread.start()
                path = socket_root / f"{KEY}.sock"
                for _ in range(100):
                    if path.exists(): break
                    time.sleep(0.01)
                client = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                client.connect(str(path)); stream = client.makefile("rwb", buffering=0)
                launch = json.loads(stream.readline())
                self.assertEqual(launch["lifecycle_state"], "label")
                self.assertEqual(launch["session_id"], SESSION)
                stream.write((json.dumps({"event": "session", "session_id": SESSION}) + "\n").encode())
                stream.write((json.dumps({"event": "terminal", "exit_code": 1,
                    "semantic_outcome": "correctable", "resumable": True}) + "\n").encode())
                stream.close(); client.close(); thread.join(3)
            self.assertFalse(errors)
            final = store.load(KEY)
            self.assertEqual((final.codex_session_id, final.phase), (SESSION, "exited_resumable"))

    def test_install_requires_public_key_only_sshd_and_never_grants_dev_sudo(self):
        deploy = pathlib.Path(__file__).parents[1] / "deploy/controller-install.sh"
        controller = pathlib.Path(__file__).parents[1] / "controller"
        script = deploy.read_text()
        sshd = (controller / "sshd-snapflow-neo-controller.conf").read_text()
        sudoers = (controller / "neo-dev-control.sudoers").read_text()
        self.assertIn("/usr/sbin/sshd -T -C user=neo-controller", script)
        self.assertIn("test -x /usr/sbin/sshd", script)
        self.assertIn("/usr/sbin/visudo -cf", script)
        self.assertIn("sudo -u dev tmux has-session -t snapflow-dev", script)
        self.assertIn("sudo -u dev git -C /workspace/snap-flow", script)
        self.assertIn("passwd -d neo-controller", script)
        self.assertNotIn("passwd -l neo-controller", script)
        self.assertIn("AuthenticationMethods publickey", sshd)
        self.assertIn("PasswordAuthentication no", sshd)
        self.assertIn("AllowUsers dev neo-controller", sshd)
        self.assertNotIn("dev ALL=", sudoers)
        self.assertNotIn("neo-dev-codex-runtime-privileged", sudoers)


if __name__ == "__main__":
    unittest.main()

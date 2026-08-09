import json
import os
import pathlib
import tempfile
import unittest
from contextlib import nullcontext
from datetime import datetime, timezone
from unittest import mock

from neo_dev_webhook.manual_preview import (
    PreviewError, _validate_checks, render_packet, resolve_image_digest,
)
from neo_dev_webhook.manual_preview_stack import (
    COMPOSE, MARKER, _provision_preview_admin, _rollback_failed_action,
    _slot_lock, assert_preview_scope, deploy, render_compose,
    reset_seed, verify,
)


SHA = "0123456789abcdef0123456789abcdef01234567"
DIGEST = "sha256:" + "a" * 64
BASE_SHA = "89abcdef0123456789abcdef0123456789abcdef"
REQUIRED = (
    "Backend Tests (Deno)", "Frontend Tests (Vitest)",
    "E2E (Cucumber + Playwright)", "Test Summary",
)


def completed_checks(completed_at="2026-08-09T10:30:00Z"):
    return [{"name": name, "status": "completed", "conclusion": "success",
             "completed_at": completed_at, "html_url": f"https://ci/{index}",
             "head_sha": SHA} for index, name in enumerate(REQUIRED)]


class NoFollowScopeTest(unittest.TestCase):
    @mock.patch("neo_dev_webhook.manual_preview_stack.FIXED_STACK")
    def test_rejects_symlinked_control_entries_and_backup_directory(self, fixed):
        for name in (".env", COMPOSE, MARKER, ".preview-backups"):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = pathlib.Path(directory) / "snapflow-test"
                outside = pathlib.Path(directory) / "outside"
                root.mkdir(); outside.mkdir()
                (root / "state").mkdir(); (root / "uploads").mkdir()
                for ordinary in (".env", COMPOSE, MARKER):
                    (root / ordinary).write_text("safe\n")
                (root / ".preview-backups").mkdir()
                target = root / name
                if target.is_dir(): target.rmdir()
                else: target.unlink()
                target.symlink_to(outside if name == ".preview-backups" else outside / "file",
                                  target_is_directory=name == ".preview-backups")
                fixed.resolve.return_value = root.resolve()
                with self.assertRaisesRegex(PreviewError, "symlink|ordinary"):
                    assert_preview_scope(root)


class DigestContractTest(unittest.TestCase):
    @mock.patch("neo_dev_webhook.manual_preview.subprocess.run")
    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_digest_comes_from_authenticated_successful_workflow_artifact(self, gh, run):
        gh.return_value = {"databaseId": 123, "name": "Build exact-SHA preview image",
                           "event": "workflow_dispatch", "conclusion": "success"}
        def download(arguments, **_kwargs):
            destination = pathlib.Path(arguments[arguments.index("--dir") + 1])
            (destination / "manual-preview-image-evidence.json").write_text(json.dumps({
                "repository": "kingkill85/snap-flow", "sha": SHA, "digest": DIGEST,
                "build_time": "2026-08-09T12:00:00Z", "run_id": 123,
            }))
            return mock.Mock()
        run.side_effect = download
        self.assertEqual(resolve_image_digest(123, SHA), DIGEST)

    def test_compose_requires_authenticated_digest_not_tag(self):
        text = render_compose(SHA, DIGEST)
        self.assertIn(f"ghcr.io/kingkill85/snap-flow@{DIGEST}", text)
        with self.assertRaises(PreviewError):
            render_compose(SHA, "sha-" + SHA)

    @mock.patch("neo_dev_webhook.manual_preview_stack._inspect_container")
    def test_running_repo_digest_must_match(self, inspect):
        inspect.return_value = {"repo_digests": [
            "ghcr.io/kingkill85/snap-flow@sha256:" + "b" * 64],
            "revision": SHA, "image": "ignored", "mounts": {}}
        with self.assertRaisesRegex(PreviewError, "digest"):
            verify(SHA, DIGEST, scope=pathlib.Path("/safe-fixture"),
                   run_external=False)


class LockAndTransactionTest(unittest.TestCase):
    @mock.patch("neo_dev_webhook.manual_preview_stack._resume_or_prove_absent")
    @mock.patch("neo_dev_webhook.manual_preview_stack._remove_container")
    @mock.patch("neo_dev_webhook.manual_preview_stack._quiesce")
    def test_teardown_failure_is_combined_and_never_restores_while_running(
            self, quiesce, remove, restore):
        quiesce.side_effect = RuntimeError("down failed")
        remove.side_effect = RuntimeError("remove failed")
        error = _rollback_failed_action(pathlib.Path("/fixed"), pathlib.Path("/backup"),
                                        RuntimeError("switch failed"), "deploy")
        self.assertIn("switch failed", str(error))
        self.assertIn("down failed", str(error))
        self.assertIn("remove failed", str(error))
        restore.assert_not_called()

    def test_slot_lock_fails_closed_on_contention(self):
        with tempfile.TemporaryDirectory() as directory:
            lock = pathlib.Path(directory) / "slot.lock"
            with _slot_lock(lock, timeout=0):
                with self.assertRaisesRegex(PreviewError, "lock"):
                    with _slot_lock(lock, timeout=0):
                        pass

    @mock.patch.dict(os.environ, {
        "SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED": "OWNER_AUTHORIZED_MANUAL_PREVIEW",
        "PREVIEW_ADMIN_EMAIL": "preview@example.test",
        "PREVIEW_ADMIN_PASSWORD": "correct-horse-battery-staple",
        "PREVIEW_JWT_SECRET": "0123456789abcdef0123456789abcdef",
    }, clear=False)
    @mock.patch("neo_dev_webhook.manual_preview_stack._remove_container")
    @mock.patch("neo_dev_webhook.manual_preview_stack._provision_preview_admin")
    @mock.patch("neo_dev_webhook.manual_preview_stack._run_compose")
    @mock.patch("neo_dev_webhook.manual_preview_stack.assert_preview_scope")
    @mock.patch("neo_dev_webhook.manual_preview_stack.preflight_fixed_route")
    def test_empty_deploy_order_down_snapshot_switch_health_provision_verify(
            self, preflight, scope, compose, provision, remove):
        with tempfile.TemporaryDirectory() as directory:
            stack = pathlib.Path(directory)
            (stack / MARKER).write_text("preview-only\n")
            (stack / "state").mkdir(); (stack / "uploads").mkdir()
            scope.return_value = stack
            events = []
            compose.side_effect = lambda _stack, *args: events.append(("compose",) + args)
            remove.side_effect = lambda: events.append(("remove",))
            provision.side_effect = lambda _stack: events.append(("provision",))
            with mock.patch("neo_dev_webhook.manual_preview_stack._backup",
                            side_effect=lambda _stack: events.append(("snapshot",)) or stack / "backup"), \
                 mock.patch("neo_dev_webhook.manual_preview_stack._write_compose",
                            side_effect=lambda *_: events.append(("switch",))), \
                 mock.patch("neo_dev_webhook.manual_preview_stack._wait_healthy",
                            side_effect=lambda *_: events.append(("healthy",))), \
                 mock.patch("neo_dev_webhook.manual_preview_stack.verify",
                            side_effect=lambda *_args, **_kw: events.append(("verify",)) or {}), \
                 mock.patch("neo_dev_webhook.manual_preview_stack._slot_lock",
                            side_effect=lambda *_a, **_k: nullcontext()):
                deploy(SHA, DIGEST)
            self.assertEqual(events[:7], [
                ("remove",), ("snapshot",), ("switch",),
                ("compose", "pull"), ("compose", "up", "-d", "--remove-orphans"),
                ("healthy",), ("provision",),
            ])
            self.assertEqual(events[-1], ("verify",))


class PersistenceEvidenceTest(unittest.TestCase):
    @mock.patch("neo_dev_webhook.manual_preview_stack._run_compose")
    def test_provisioning_uses_container_environment_without_password_argument(self, compose):
        _provision_preview_admin(pathlib.Path("/fixed"))
        arguments = compose.call_args.args
        joined = " ".join(str(value) for value in arguments)
        self.assertIn("Deno.env.get('ADMIN_PASSWORD')", joined)
        self.assertNotIn("correct-horse-battery-staple", joined)
        self.assertNotIn("console.log(password", joined)

    def test_startup_never_logs_generated_admin_password(self):
        root = pathlib.Path(__file__).parents[3]
        source = (root / "backend/src/scripts/seed-admin.ts").read_text()
        self.assertNotIn('console.log("Password: " + adminPassword)', source)
        compose = (root / "tools/neo_dev_webhook/deploy/manual-preview-compose.yaml").read_text()
        main = (root / "backend/src/main.ts").read_text()
        self.assertIn("SKIP_DEFAULT_ADMIN_SEED=true", compose)
        self.assertIn("SKIP_DEFAULT_ADMIN_SEED", main)

    def test_browser_smoke_has_create_reload_restart_cleanup_phases(self):
        root = pathlib.Path(__file__).parents[3]
        smoke = (root / "e2e/manual-preview-smoke.ts").read_text() + \
            (root / "e2e/support/manual-preview-contract.ts").read_text()
        for value in ("PREVIEW_SMOKE_PHASE", "PREVIEW_SMOKE_ID", "created_id",
                      "reload_proven", "restart_proven", "cleanup_proven"):
            self.assertIn(value, smoke)

    def test_packet_requires_structured_verified_persistence_and_mobile_evidence(self):
        scenario = {"title": "Preview project", "steps": ["Open Projects"],
                    "setup": "Preview account", "expected": "Project visible"}
        evidence = {"sha": SHA, "route": "https://snapflow-test.kingkill.org",
                    "created_id": "preview-smoke-123", "reload_proven": True,
                    "restart_proven": True, "reset_repeatable": True,
                    "mobile_viewport": {"width": 390, "height": 844}}
        packet = render_packet(scenario, SHA, "2026-08-09T12:00:00Z", evidence)
        self.assertIn("preview-smoke-123", packet)
        with self.assertRaises(PreviewError):
            render_packet(scenario, SHA, "2026-08-09T12:00:00Z",
                          {**evidence, "restart_proven": False})


class CheckPaginationAndOrderingTest(unittest.TestCase):
    def test_all_pages_and_total_count_are_required(self):
        runs = completed_checks() + [completed_checks()[0] for _ in range(98)]
        page1 = {"total_count": 102, "check_runs": runs[:100]}
        page2 = {"total_count": 102, "check_runs": runs[100:]}
        result = _validate_checks([page1, page2], SHA)
        self.assertEqual(result["latest_completed_at"], "2026-08-09T10:30:00Z")
        with self.assertRaisesRegex(PreviewError, "all check-run pages"):
            _validate_checks([page1], SHA)

    def test_required_completion_timestamp_is_strict_and_orders_review(self):
        for value in (None, "not-time"):
            runs = completed_checks(value)
            with self.subTest(value=value), self.assertRaises(PreviewError):
                _validate_checks({"total_count": len(runs), "check_runs": runs}, SHA)


class WorkflowMetadataTest(unittest.TestCase):
    def test_normal_workflow_binds_tags_revision_and_created_to_source(self):
        root = pathlib.Path(__file__).parents[3]
        workflow = (root / ".github/workflows/docker-build.yml").read_text()
        for value in ("org.opencontainers.image.revision=${{ env.SOURCE_SHA }}",
                      "org.opencontainers.image.created=${{ steps.source.outputs.build_time }}",
                      "sha-${{ env.SOURCE_SHA }}"):
            self.assertIn(value, workflow)

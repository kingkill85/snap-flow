import json
import os
import pathlib
import tempfile
import unittest
from contextlib import contextmanager, nullcontext
from unittest import mock

from neo_dev_webhook import manual_preview as gate
from neo_dev_webhook import manual_preview_stack as stack_ops
from neo_dev_webhook.manual_preview import PreviewError


SHA = "0123456789abcdef0123456789abcdef01234567"
DIGEST = "sha256:" + "a" * 64
AUTH = {
    "SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED": "OWNER_AUTHORIZED_MANUAL_PREVIEW",
    "PREVIEW_ADMIN_EMAIL": "preview@example.test",
    "PREVIEW_ADMIN_PASSWORD": "correct-horse-battery-staple",
    "PREVIEW_JWT_SECRET": "0123456789abcdef0123456789abcdef",
}


def fixture_stack(root: pathlib.Path, occupied: bool = True) -> pathlib.Path:
    (root / stack_ops.MARKER).write_text("preview-only\n")
    (root / "state").mkdir(); (root / "uploads").mkdir()
    if occupied:
        (root / stack_ops.COMPOSE).write_text(stack_ops.render_compose(SHA, DIGEST))
    return root


class SealedSnapshotTest(unittest.TestCase):
    def test_seal_rejects_truncation_symlink_and_manifest_mismatch(self):
        for fault in ("truncate", "symlink", "manifest"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as directory:
                root = fixture_stack(pathlib.Path(directory))
                backup = stack_ops._backup(root)
                if fault == "truncate":
                    (backup / stack_ops.COMPOSE).write_text("truncated")
                elif fault == "symlink":
                    (backup / "escape").symlink_to(pathlib.Path(directory) / "outside")
                else:
                    manifest = json.loads((backup / "SHA256.json").read_text())
                    manifest[stack_ops.COMPOSE] = "0" * 64
                    (backup / "SHA256.json").write_text(json.dumps(manifest))
                with self.assertRaisesRegex(PreviewError, "sealed backup"):
                    stack_ops._verify_backup(backup)

    def test_backup_verifies_before_atomic_publication_and_removes_failed_temporary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = fixture_stack(pathlib.Path(directory))
            with mock.patch.object(stack_ops, "_verify_backup",
                                   side_effect=PreviewError("injected seal mismatch")) as verify:
                with self.assertRaisesRegex(PreviewError, "seal mismatch"):
                    stack_ops._backup(root)
            verify.assert_called_once()
            published = list((root / stack_ops.BACKUPS).glob("[0-9]*"))
            self.assertEqual(published, [])
            self.assertEqual(list((root / stack_ops.BACKUPS).iterdir()), [])

    @mock.patch.dict(os.environ, AUTH, clear=False)
    def test_failed_seal_resumes_prior_slot_before_any_switch_or_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            root = fixture_stack(pathlib.Path(directory))
            events = []
            with mock.patch.object(stack_ops, "assert_preview_scope", return_value=root), \
                 mock.patch.object(stack_ops, "preflight_fixed_route"), \
                 mock.patch.object(stack_ops, "_slot_lock", return_value=nullcontext()), \
                 mock.patch.object(stack_ops, "_quiesce", side_effect=lambda *_: events.append("down")), \
                 mock.patch.object(stack_ops, "_backup", side_effect=PreviewError("truncated seal")), \
                 mock.patch.object(stack_ops, "_resume_prior", side_effect=lambda *_: events.append("resume")), \
                 mock.patch.object(stack_ops, "_write_compose", side_effect=lambda *_: events.append("switch")):
                with self.assertRaisesRegex(PreviewError, "truncated seal"):
                    stack_ops.deploy(SHA, DIGEST)
            self.assertEqual(events, ["down", "resume"])


class SnapshotResumeTest(unittest.TestCase):
    def test_reset_and_rollback_snapshot_failure_resume_occupied_or_prove_empty(self):
        for action in ("reset", "rollback"):
            for occupied in (True, False):
                with self.subTest(action=action, occupied=occupied), tempfile.TemporaryDirectory() as directory:
                    root = fixture_stack(pathlib.Path(directory), occupied)
                    prior = stack_ops._capture_prior(root)
                    events = []
                    with mock.patch.object(stack_ops, "assert_preview_scope", return_value=root), \
                         mock.patch.object(stack_ops, "_slot_lock", return_value=nullcontext()), \
                         mock.patch.object(stack_ops, "_quiesce"), \
                         mock.patch.object(stack_ops, "_backup", side_effect=PreviewError("snapshot failed")), \
                         mock.patch.object(stack_ops, "_resume_prior",
                                           side_effect=lambda *_: events.append("resume")):
                        with mock.patch.dict(os.environ, AUTH, clear=False), self.assertRaises(PreviewError):
                            if action == "reset": stack_ops.reset_seed(SHA, DIGEST)
                            else: stack_ops.rollback("20260809T120000Z-1234567890123456789")
                    self.assertEqual(events, ["resume"])
                    self.assertEqual(prior["presence"][stack_ops.COMPOSE], occupied)


class ResetRepeatabilityTest(unittest.TestCase):
    @mock.patch.dict(os.environ, AUTH, clear=False)
    def test_second_reset_cycle_failure_uses_transaction_backup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = fixture_stack(pathlib.Path(directory))
            backup = root / "backup"
            with mock.patch.object(stack_ops, "assert_preview_scope", return_value=root), \
                 mock.patch.object(stack_ops, "_slot_lock", return_value=nullcontext()), \
                 mock.patch.object(stack_ops, "_quiesce"), \
                 mock.patch.object(stack_ops, "_snapshot_or_resume", return_value=backup), \
                 mock.patch.object(stack_ops, "_reset_once",
                                   side_effect=[{"clean": True}, RuntimeError("second cycle failed")]), \
                 mock.patch.object(stack_ops, "_rollback_failed_action",
                                   return_value=PreviewError("prior restored")) as rollback:
                with self.assertRaisesRegex(PreviewError, "prior restored"):
                    stack_ops.reset_seed(SHA, DIGEST)
            rollback.assert_called_once()

    def test_one_reset_cycle_has_exact_clear_start_readiness_provision_baseline_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root = fixture_stack(pathlib.Path(directory))
            events = []
            with mock.patch.object(stack_ops, "_quiesce", side_effect=lambda *_: events.append("down")), \
                 mock.patch.object(stack_ops, "_run_compose",
                                   side_effect=lambda _s, *a: events.append("compose:" + " ".join(a))), \
                 mock.patch.object(stack_ops, "_wait_healthy", side_effect=lambda *_: events.append("healthy")), \
                 mock.patch.object(stack_ops, "_provision_preview_admin",
                                   side_effect=lambda *_: events.append("provision")), \
                 mock.patch.object(stack_ops, "_baseline_fingerprint",
                                   side_effect=lambda *_: events.append("baseline") or {"clean": True}):
                stack_ops._reset_once(root)
            self.assertEqual(events, ["down", "compose:up -d", "healthy", "provision", "baseline"])

    @mock.patch.dict(os.environ, AUTH, clear=False)
    def test_reset_executes_two_complete_independent_cycles_under_one_lock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = fixture_stack(pathlib.Path(directory))
            events = []
            with mock.patch.object(stack_ops, "assert_preview_scope", return_value=root), \
                 mock.patch.object(stack_ops, "_slot_lock", return_value=nullcontext()), \
                 mock.patch.object(stack_ops, "_quiesce"), \
                 mock.patch.object(stack_ops, "_backup", return_value=root / "backup"), \
                 mock.patch.object(stack_ops, "_reset_once",
                                   side_effect=[{"baseline": 1}, {"baseline": 1}]) as reset_once, \
                 mock.patch.object(stack_ops, "_exercise_persistence",
                                   return_value={"verifier_evidence": {}}), \
                 mock.patch.object(stack_ops, "_baseline_fingerprint",
                                   return_value={"baseline": 1}), \
                 mock.patch.object(stack_ops, "verify", return_value={"health": "healthy"}):
                result = stack_ops.reset_seed(SHA, DIGEST)
            self.assertEqual(reset_once.call_count, 2)
            self.assertEqual(result["seed"], "repeatable")


class ReadOnlyVerifyTest(unittest.TestCase):
    @mock.patch.dict(os.environ, AUTH, clear=False)
    def test_authorized_deploy_holds_slot_lock_through_persistence_exercise(self):
        with tempfile.TemporaryDirectory() as directory:
            root = fixture_stack(pathlib.Path(directory), occupied=False)
            held = {"value": False}
            @contextmanager
            def lock(*_args, **_kwargs):
                held["value"] = True
                try: yield
                finally: held["value"] = False
            def exercise(*_args, **_kwargs):
                self.assertTrue(held["value"])
                return {"verifier_evidence": {}}
            with mock.patch.object(stack_ops, "assert_preview_scope", return_value=root), \
                 mock.patch.object(stack_ops, "preflight_fixed_route"), \
                 mock.patch.object(stack_ops, "_slot_lock", side_effect=lock), \
                 mock.patch.object(stack_ops, "_quiesce"), \
                 mock.patch.object(stack_ops, "_snapshot_or_resume", return_value=root / "backup"), \
                 mock.patch.object(stack_ops, "_write_compose"), \
                 mock.patch.object(stack_ops, "_run_compose"), \
                 mock.patch.object(stack_ops, "_wait_healthy"), \
                 mock.patch.object(stack_ops, "_provision_preview_admin"), \
                 mock.patch.object(stack_ops, "verify", return_value={}), \
                 mock.patch.object(stack_ops, "_exercise_persistence", side_effect=exercise):
                stack_ops.deploy(SHA, DIGEST)
            self.assertFalse(held["value"])

    @mock.patch.object(stack_ops, "preflight_fixed_route")
    @mock.patch.object(stack_ops, "_wait_healthy")
    @mock.patch.object(stack_ops, "_inspect_container")
    @mock.patch.object(stack_ops.subprocess, "run")
    def test_public_verify_never_restarts_or_runs_mutating_smoke(self, run, inspect, healthy, route):
        with tempfile.TemporaryDirectory() as directory:
            root = fixture_stack(pathlib.Path(directory))
            inspect.return_value = {
                "repo_digests": [f"{stack_ops.IMAGE}@{DIGEST}"], "revision": SHA,
                "image": f"{stack_ops.IMAGE}@{DIGEST}",
                "mounts": {"/app/backend/data": str((root / "state").resolve()),
                           "/app/backend/uploads": str((root / "uploads").resolve())},
            }
            run.return_value = mock.Mock(stdout=json.dumps({"sha": SHA}))
            with mock.patch.object(stack_ops, "assert_preview_scope", return_value=root), \
                 mock.patch.object(stack_ops, "_verify_route_auth_boundary"), \
                 mock.patch.object(stack_ops, "_run_smoke") as smoke, \
                 mock.patch.object(stack_ops, "_run_compose") as compose:
                result = stack_ops.verify(SHA, DIGEST)
            smoke.assert_not_called(); compose.assert_not_called()
            self.assertNotIn("verifier_evidence", result)

    def test_persistence_failure_preserves_original_and_cleanup_failure(self):
        with mock.patch.object(stack_ops, "_run_smoke",
                               side_effect=[{
                                   "phase": "create", "sha": SHA,
                                   "route": stack_ops.FIXED_ROUTE,
                                   "created_id": "12", "reload_proven": True,
                                   "mobile_viewport": {"width": 390, "height": 844},
                               },
                                            RuntimeError("second GET failed")]), \
             mock.patch.object(stack_ops, "_run_compose"), \
             mock.patch.object(stack_ops, "_wait_healthy"), \
             mock.patch.object(stack_ops, "_cleanup_smoke_project",
                               side_effect=RuntimeError("DELETE failed")):
            with self.assertRaisesRegex(PreviewError, "second GET failed.*DELETE failed"):
                stack_ops._exercise_persistence(pathlib.Path("/fixed"), SHA)


class ExhaustivePrDiscoveryTest(unittest.TestCase):
    @mock.patch.object(gate, "_gh_json")
    def test_page_two_duplicate_is_found_and_ambiguous(self, gh):
        gh.side_effect = [
            {"data": {"repository": {"pullRequests": {
                "nodes": [{"number": 1, "body": "Closes #91"}],
                "pageInfo": {"hasNextPage": True, "endCursor": "next"}}}}},
            {"data": {"repository": {"pullRequests": {
                "nodes": [{"number": 2, "body": "Refs #91"}],
                "pageInfo": {"hasNextPage": False, "endCursor": "done"}}}}},
        ]
        with self.assertRaisesRegex(PreviewError, "exactly one"):
            gate._discover_managed_pr(91)

    @mock.patch.object(gate, "_gh_json")
    def test_truncated_or_invalid_page_shape_fails_closed(self, gh):
        gh.return_value = {"data": {"repository": {"pullRequests": {
            "nodes": [], "pageInfo": {"hasNextPage": True, "endCursor": None}}}}}
        with self.assertRaises(PreviewError):
            gate._discover_managed_pr(91)

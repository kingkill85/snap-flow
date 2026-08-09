import pathlib
import unittest
from unittest import mock

from neo_dev_webhook import manual_preview_stack as stack_ops
from neo_dev_webhook.manual_preview import PreviewError


SHA = "0123456789abcdef0123456789abcdef01234567"
OTHER_SHA = "1123456789abcdef0123456789abcdef01234567"
ROUTE = "https://snapflow-test.kingkill.org"
VIEWPORT = {"width": 390, "height": 844}


def create_output(**changes):
    output = {
        "phase": "create", "sha": SHA, "route": ROUTE,
        "created_id": "12", "project_group_id": "34", "reload_proven": True,
        "mobile_viewport": VIEWPORT.copy(),
    }
    output.update(changes)
    return output


def persisted_output(**changes):
    output = {
        "phase": "verify-cleanup", "sha": SHA, "route": ROUTE,
        "created_id": "12", "project_group_id": "34", "restart_proven": True,
        "cleanup_proven": True, "mobile_viewport": VIEWPORT.copy(),
    }
    output.update(changes)
    return output


class ObservedSmokeEvidenceTest(unittest.TestCase):
    def assert_exercise_rejected(self, created, persisted):
        with mock.patch.object(stack_ops, "_run_smoke", side_effect=[created, persisted]), \
             mock.patch.object(stack_ops, "_run_compose"), \
             mock.patch.object(stack_ops, "_wait_healthy"), \
             mock.patch.object(stack_ops, "_cleanup_smoke_project") as cleanup:
            with self.assertRaises(PreviewError):
                stack_ops._exercise_persistence(pathlib.Path("/fixed"), SHA)
        cleanup.assert_called_once_with(SHA, "12", "34")

    def test_rejects_missing_malformed_wrong_type_or_changed_group_id(self):
        missing = create_output(); del missing["project_group_id"]
        missing_later = persisted_output(); del missing_later["project_group_id"]
        cases = [
            (missing, persisted_output()),
            (create_output(project_group_id="bad"), persisted_output()),
            (create_output(project_group_id=34), persisted_output()),
            (create_output(), persisted_output(project_group_id="35")),
            (create_output(), missing_later),
        ]
        for created, persisted in cases:
            with self.subTest(created=created, persisted=persisted), \
                 mock.patch.object(stack_ops, "_run_smoke", side_effect=[created, persisted]), \
                 mock.patch.object(stack_ops, "_run_compose"), \
                 mock.patch.object(stack_ops, "_wait_healthy"), \
                 mock.patch.object(stack_ops, "_cleanup_smoke_project"):
                with self.assertRaises(PreviewError):
                    stack_ops._exercise_persistence(pathlib.Path("/fixed"), SHA)

    def test_rejects_wrong_sha_from_each_smoke_phase(self):
        self.assert_exercise_rejected(create_output(sha=OTHER_SHA), persisted_output())
        self.assert_exercise_rejected(create_output(), persisted_output(sha=OTHER_SHA))

    def test_rejects_wrong_route_from_each_smoke_phase(self):
        wrong = "https://other.example.test"
        self.assert_exercise_rejected(create_output(route=wrong), persisted_output())
        self.assert_exercise_rejected(create_output(), persisted_output(route=wrong))

    def test_rejects_wrong_viewport_from_each_smoke_phase(self):
        tiny = {"width": 1, "height": 1}
        self.assert_exercise_rejected(create_output(mobile_viewport=tiny), persisted_output())
        self.assert_exercise_rejected(create_output(), persisted_output(mobile_viewport=tiny))

    def test_rejects_missing_malformed_or_discontinuous_created_id(self):
        missing_create = create_output(); del missing_create["created_id"]
        missing_persisted = persisted_output(); del missing_persisted["created_id"]
        cases = [
            (missing_create, persisted_output()),
            (create_output(created_id="not-an-id"), persisted_output()),
            (create_output(), missing_persisted),
            (create_output(), persisted_output(created_id="13")),
        ]
        for created, persisted in cases:
            with self.subTest(created=created, persisted=persisted), \
                 mock.patch.object(stack_ops, "_run_smoke", side_effect=[created, persisted]), \
                 mock.patch.object(stack_ops, "_run_compose"), \
                 mock.patch.object(stack_ops, "_wait_healthy"), \
                 mock.patch.object(stack_ops, "_cleanup_smoke_project"):
                with self.assertRaises(PreviewError):
                    stack_ops._exercise_persistence(pathlib.Path("/fixed"), SHA)

    def test_rejects_wrong_types_and_extra_or_ambiguous_phase_shape(self):
        cases = [
            create_output(route=123),
            create_output(reload_proven=1),
            create_output(extra="ambiguous"),
            create_output(phase="verify-cleanup"),
        ]
        for created in cases:
            with self.subTest(created=created):
                self.assert_exercise_rejected(created, persisted_output())

    def test_packet_evidence_is_copied_from_validated_observations(self):
        with mock.patch.object(stack_ops, "_run_smoke",
                               side_effect=[create_output(), persisted_output()]), \
             mock.patch.object(stack_ops, "_run_compose"), \
             mock.patch.object(stack_ops, "_wait_healthy"):
            result = stack_ops._exercise_persistence(pathlib.Path("/fixed"), SHA)
        self.assertEqual(result["verifier_evidence"], {
            "sha": SHA, "route": ROUTE, "created_id": "12",
            "reload_proven": True, "restart_proven": True,
            "reset_repeatable": False, "mobile_viewport": VIEWPORT,
        })


class CleanupSmokeEvidenceTest(unittest.TestCase):
    def test_cleanup_output_is_strictly_validated(self):
        malformed = {
            "phase": "cleanup", "sha": SHA, "route": ROUTE,
            "created_id": "12", "project_group_id": "34", "cleanup_proven": True,
            "mobile_viewport": VIEWPORT, "extra": "ambiguous",
        }
        with mock.patch.object(stack_ops, "_run_smoke", return_value=malformed):
            with self.assertRaises(PreviewError):
                stack_ops._cleanup_smoke_project(SHA, "12", "34")

    def test_recovery_cleanup_carries_both_ids(self):
        evidence = {
            "phase": "cleanup", "sha": SHA, "route": ROUTE,
            "created_id": "12", "project_group_id": "34", "cleanup_proven": True,
            "mobile_viewport": VIEWPORT,
        }
        with mock.patch.object(stack_ops, "_run_smoke", return_value=evidence) as smoke:
            stack_ops._cleanup_smoke_project(SHA, "12", "34")
        smoke.assert_called_once_with(SHA, "cleanup", "12", "34")


class BaselineGroupEvidenceTest(unittest.TestCase):
    def test_baseline_rejects_matching_or_orphan_smoke_groups(self):
        clean = {"preview_admin_count": 1, "smoke_projects": 0,
                 "smoke_groups": 0, "orphan_smoke_groups": 0}
        with mock.patch.object(stack_ops, "_run_compose",
                               return_value=mock.Mock(stdout=__import__("json").dumps(clean))):
            self.assertEqual(stack_ops._baseline_fingerprint(pathlib.Path("/fixed")), clean)
        for field in ("smoke_projects", "smoke_groups", "orphan_smoke_groups"):
            with self.subTest(field=field), mock.patch.object(
                    stack_ops, "_run_compose",
                    return_value=mock.Mock(stdout=__import__("json").dumps(
                        {**clean, field: 1}))):
                with self.assertRaises(PreviewError):
                    stack_ops._baseline_fingerprint(pathlib.Path("/fixed"))


if __name__ == "__main__":
    unittest.main()

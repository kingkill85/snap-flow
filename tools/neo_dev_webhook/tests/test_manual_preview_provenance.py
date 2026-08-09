import json
import pathlib
import tempfile
import unittest
from unittest import mock

from neo_dev_webhook import manual_preview as gate
from neo_dev_webhook import manual_preview_stack as stack_ops
from neo_dev_webhook.manual_preview import PreviewError


SHA = "0123456789abcdef0123456789abcdef01234567"
DIGEST = "sha256:" + "a" * 64
PROVENANCE = {
    "repository": "kingkill85/snap-flow",
    "sha": SHA,
    "digest": DIGEST,
    "build_time": "2026-08-09T12:00:00Z",
    "run_id": 123,
}
OBSERVATIONS = {
    "sha": SHA, "digest": DIGEST, "run_id": 123,
    "route": gate.FIXED_ROUTE, "created_id": "12", "project_group_id": "34",
    "reload_proven": True, "restart_proven": True, "reset_repeatable": True,
    "mobile_viewport": {"width": 390, "height": 844},
}
SCENARIO = {
    "title": "Preview project", "steps": ["Open Projects"],
    "setup": "Preview account", "expected": "Project visible",
}


class AuthenticatedProvenanceTest(unittest.TestCase):
    @mock.patch.object(gate.subprocess, "run")
    @mock.patch.object(gate, "_gh_json")
    def test_resolution_returns_complete_authenticated_provenance(self, gh, run):
        gh.return_value = {"databaseId": 123, "name": "Build exact-SHA preview image",
                           "event": "workflow_dispatch", "conclusion": "success"}
        def download(arguments, **_kwargs):
            destination = pathlib.Path(arguments[arguments.index("--dir") + 1])
            (destination / "manual-preview-image-evidence.json").write_text(
                json.dumps(PROVENANCE))
            return mock.Mock()
        run.side_effect = download
        self.assertEqual(gate.resolve_image_provenance(123, SHA), PROVENANCE)

    @mock.patch.object(gate.subprocess, "run")
    @mock.patch.object(gate, "_gh_json")
    def test_resolution_rejects_malformed_or_mismatched_artifact(self, gh, run):
        gh.return_value = {"databaseId": 123, "name": "Build exact-SHA preview image",
                           "event": "workflow_dispatch", "conclusion": "success"}
        cases = [
            {**PROVENANCE, "build_time": "stale-or-arbitrary"},
            {**PROVENANCE, "sha": "1" * 40},
            {**PROVENANCE, "run_id": 124},
            {**PROVENANCE, "digest": "not-a-digest"},
            {**PROVENANCE, "extra": "ambiguous"},
        ]
        for artifact in cases:
            with self.subTest(artifact=artifact):
                def download(arguments, **_kwargs):
                    destination = pathlib.Path(arguments[arguments.index("--dir") + 1])
                    (destination / "manual-preview-image-evidence.json").write_text(
                        json.dumps(artifact))
                    return mock.Mock()
                run.side_effect = download
                with self.assertRaises(PreviewError):
                    gate.resolve_image_provenance(123, SHA)


class ProvenanceBindingTest(unittest.TestCase):
    def test_preview_workflow_binds_running_image_to_authenticated_run(self):
        workflow = (pathlib.Path(__file__).parents[3] /
                    ".github/workflows/manual-preview-image.yml").read_text()
        self.assertIn("org.snapflow.preview.run-id=${{ github.run_id }}", workflow)

    def test_running_readback_rejects_sha_digest_and_run_mismatch(self):
        for key, value in (("sha", "1" * 40),
                           ("digest", "sha256:" + "b" * 64), ("run_id", 124)):
            with self.subTest(key=key), self.assertRaises(PreviewError):
                stack_ops._validate_deployment_evidence(
                    PROVENANCE, {**OBSERVATIONS, key: value})
        with self.assertRaises(PreviewError):
            stack_ops._validate_deployment_evidence(
                PROVENANCE, {"sha": SHA, "digest": DIGEST, "run_id": 123,
                             "extra": "ambiguous"})

    def test_packet_uses_only_provenance_and_verified_observations(self):
        packet = gate.render_packet(SCENARIO, PROVENANCE, OBSERVATIONS)
        self.assertIn(PROVENANCE["build_time"], packet)
        self.assertIn(SHA, packet)
        parser = gate.build_parser()
        with self.assertRaises(SystemExit):
            parser.parse_args(["packet", "--scenario", "scenario.json",
                               "--sha", SHA, "--build-time", "arbitrary"])
        for key, value in (("sha", "1" * 40),
                           ("digest", "sha256:" + "b" * 64), ("run_id", 124)):
            with self.subTest(key=key), self.assertRaises(PreviewError):
                gate.render_packet(SCENARIO, PROVENANCE, {**OBSERVATIONS, key: value})
        for key in ("created_id", "project_group_id"):
            with self.subTest(key=key), self.assertRaises(PreviewError):
                gate.render_packet(SCENARIO, PROVENANCE,
                                   {**OBSERVATIONS, key: "not-an-id"})


if __name__ == "__main__":
    unittest.main()

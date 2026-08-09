import pathlib
import json
import tempfile
import unittest
from unittest import mock

from neo_dev_webhook.manual_preview import (
    FIXED_ROUTE,
    FIXED_STACK,
    PreviewError,
    classify_product_diff,
    preflight_fixed_route,
    validate_preview_command,
    validate_gate,
    render_packet,
    validate_compose,
)
from neo_dev_webhook.manual_preview_stack import build_parser, assert_preview_scope


SHA = "0123456789abcdef0123456789abcdef01234567"


class ProductDiffEligibilityTest(unittest.TestCase):
    def test_accepts_real_runnable_application_changes(self):
        for path in ("backend/src/routes/items.ts", "frontend/src/pages/Home.tsx"):
            with self.subTest(path=path):
                self.assertTrue(classify_product_diff([path]).eligible)

    def test_rejects_non_product_and_identity_only_changes(self):
        cases = (
            ["openspec/changes/example/proposal.md"],
            ["docs/deployment.md", "README.md"],
            ["tools/neo_dev_webhook/manual_preview.py"],
            [".github/workflows/preview-image.yml"],
            ["backend/tests/routes/server_test.ts"],
            ["backend/src/build-info.ts", "frontend/src/components/layout/BuildVersion.tsx"],
            ["backend/src/main.ts", "frontend/src/components/layout/Layout.tsx",
             "frontend/src/components/layout/BuildVersion.tsx"],
        )
        for paths in cases:
            with self.subTest(paths=paths):
                result = classify_product_diff(paths)
                self.assertFalse(result.eligible)
                self.assertTrue(result.reason)


class FixedSlotContractTest(unittest.TestCase):
    def test_contract_has_exactly_one_non_configurable_slot_and_route(self):
        self.assertEqual(FIXED_STACK, pathlib.Path(
            "/mnt/marder/docker/dockge/stacks/snapflow-test"))
        self.assertEqual(FIXED_ROUTE, "https://snapflow-test.kingkill.org")

    @mock.patch("neo_dev_webhook.manual_preview.socket.getaddrinfo")
    def test_route_preflight_fails_closed_when_fixed_route_does_not_resolve(self, resolve):
        resolve.side_effect = OSError("NXDOMAIN")
        with self.assertRaisesRegex(PreviewError, "fixed authorized route does not resolve"):
            preflight_fixed_route()

    def test_preview_command_requires_only_preview_and_a_full_sha(self):
        self.assertEqual(validate_preview_command(f"/preview {SHA}"), SHA)
        for command in (
            "/preview 0123456", f"/accept {SHA}", f"/merge {SHA}",
            f"/preview {SHA} https://other.example", "/preview snapflow-other " + SHA,
        ):
            with self.subTest(command=command), self.assertRaises(PreviewError):
                validate_preview_command(command)

    def test_fixed_compose_has_no_host_port_and_uses_preview_only_mounts(self):
        fixture = pathlib.Path(__file__).parent / "fixtures/manual-preview-compose.yaml"
        result = validate_compose(fixture.read_text(), SHA)
        self.assertEqual(result["route"], FIXED_ROUTE)
        self.assertEqual(result["sha"], SHA)

    def test_repository_workflow_builds_exact_sha_without_runtime_secret(self):
        root = pathlib.Path(__file__).parents[3]
        workflow = (root / ".github/workflows/manual-preview-image.yml").read_text()
        dockerfile = (root / "Dockerfile").read_text()
        for value in ("workflow_dispatch", "requested_sha", "github.event.inputs.requested_sha",
                      "github.event.repository.default_branch", "BUILD_SHA", "BUILD_TIME",
                      "org.opencontainers.image.revision", "push-by-digest=true"):
            self.assertIn(value, workflow)
        self.assertNotIn("JWT_SECRET", dockerfile)
        self.assertIn("ARG BUILD_SHA", dockerfile)
        self.assertIn("ENV BUILD_SHA=$BUILD_SHA", dockerfile)

    def test_cli_has_separate_read_only_and_explicit_mutation_actions(self):
        parser = build_parser()
        self.assertEqual(parser.parse_args(["verify", SHA]).action, "verify")
        self.assertEqual(parser.parse_args(["deploy", SHA]).action, "deploy")
        for args in (["verify", SHA, "--route", "https://other"],
                     ["deploy", SHA, "--stack", "other"]):
            with self.subTest(args=args), self.assertRaises(SystemExit):
                parser.parse_args(args)

    def test_reset_scope_requires_fixed_canonical_path_and_marker(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            with self.assertRaises(PreviewError):
                assert_preview_scope(root)


class PacketTest(unittest.TestCase):
    def test_phone_packet_contains_verified_identity_and_only_legal_commands(self):
        packet = render_packet({
            "title": "Create a project",
            "steps": ["Sign in", "Create the project"],
            "setup": "Use preview account",
            "expected": "Project appears",
            "persistence": "Reload and confirm",
            "mobile": "Check at phone width",
        }, SHA, "2026-08-09T12:00:00Z")
        for value in (FIXED_ROUTE, SHA, "2026-08-09T12:00:00Z", "Sign in",
                      "Project appears", "Reload and confirm", "phone width",
                      "/fix <bounded feedback>", f"/accept {SHA}", "screenshot"):
            self.assertIn(value, packet)
        self.assertNotIn("/merge", packet)


class GateEvidenceTest(unittest.TestCase):
    def _evidence(self, values):
        temporary = tempfile.NamedTemporaryFile(mode="w", delete=False)
        json.dump(values, temporary)
        temporary.close()
        self.addCleanup(pathlib.Path(temporary.name).unlink)
        return pathlib.Path(temporary.name)

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_accepts_exact_head_successful_checks_and_fresh_clean_review(self, gh):
        gh.side_effect = [[{
            "number": 91, "isDraft": True, "headRefOid": SHA,
            "mergeable": "MERGEABLE", "updatedAt": "2026-08-09T10:00:00Z",
            "files": [{"path": "backend/src/routes/items.ts"}],
        }], [{"name": "Test Summary", "state": "SUCCESS", "link": "https://ci"}]]
        evidence = self._evidence({
            "sha": SHA, "verdict": "CLEAN", "reviewed_at": "2026-08-09T11:00:00Z",
            "reviewer_task_id": "review-123",
        })
        self.assertEqual(validate_gate(91, f"/preview {SHA}", evidence)["sha"], SHA)

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_rejects_stale_review_and_incomplete_checks(self, gh):
        pr = [{
            "number": 91, "isDraft": True, "headRefOid": SHA,
            "mergeable": "MERGEABLE", "updatedAt": "2026-08-09T10:00:00Z",
            "files": [{"path": "frontend/src/pages/Home.tsx"}],
        }]
        evidence = self._evidence({
            "sha": SHA, "verdict": "CLEAN", "reviewed_at": "2026-08-09T09:00:00Z",
            "reviewer_task_id": "review-123",
        })
        gh.side_effect = [pr, [{"name": "Test Summary", "state": "PENDING", "link": "https://ci"}]]
        with self.assertRaisesRegex(PreviewError, "complete and successful"):
            validate_gate(91, f"/preview {SHA}", evidence)
        gh.side_effect = [pr, [{"name": "Test Summary", "state": "SUCCESS", "link": "https://ci"}]]
        with self.assertRaisesRegex(PreviewError, "predates"):
            validate_gate(91, f"/preview {SHA}", evidence)

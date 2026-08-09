import pathlib
import json
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
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
from neo_dev_webhook.manual_preview_stack import (
    build_parser, assert_preview_scope, reset_seed, _backup, _verify_backup,
    _restore_backup,
)


SHA = "0123456789abcdef0123456789abcdef01234567"
BASE_SHA = "89abcdef0123456789abcdef0123456789abcdef"
REQUIRED_CHECKS = (
    "Backend Tests (Deno)", "Frontend Tests (Vitest)",
    "E2E (Cucumber + Playwright)", "Test Summary",
)


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

    @mock.patch("neo_dev_webhook.manual_preview.urllib.request.urlopen")
    @mock.patch("neo_dev_webhook.manual_preview.socket.getaddrinfo")
    def test_route_preflight_accepts_existing_tls_boundary_without_running_app(
            self, resolve, open_url):
        resolve.return_value = [(None, None, None, None, None)]
        open_url.side_effect = __import__("urllib.error").error.HTTPError(
            FIXED_ROUTE, 502, "upstream not deployed", {}, None)
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

    def test_production_image_workflow_checks_out_and_verifies_exact_source_sha(self):
        root = pathlib.Path(__file__).parents[3]
        workflow = (root / ".github/workflows/docker-build.yml").read_text()
        for value in ("SOURCE_SHA", "ref: ${{ env.SOURCE_SHA }}", "fetch-depth: 1",
                      "git rev-parse HEAD", 'test "$ACTUAL_SHA" = "$SOURCE_SHA"',
                      "git show -s --format=%cI", "steps.source.outputs.build_time"):
            self.assertIn(value, workflow)

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

    @mock.patch("neo_dev_webhook.manual_preview_stack.FIXED_STACK")
    def test_preview_scope_rejects_nested_symlinks(self, fixed_stack):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "snapflow-test"
            outside = pathlib.Path(directory) / "outside"
            root.mkdir(); outside.mkdir()
            (root / ".snapflow-preview-only").write_text("preview-only\n")
            (root / "state").mkdir(); (root / "uploads").mkdir()
            (root / "state" / "escape").symlink_to(outside, target_is_directory=True)
            fixed_stack.resolve.return_value = root.resolve()
            with self.assertRaisesRegex(PreviewError, "symlink"):
                assert_preview_scope(root)

    def test_empty_first_slot_backup_is_sealed_and_extra_files_break_seal(self):
        with tempfile.TemporaryDirectory() as directory:
            stack = pathlib.Path(directory)
            backup = _backup(stack)
            _verify_backup(backup)
            (backup / "unsealed").write_text("tamper\n")
            with self.assertRaisesRegex(PreviewError, "seal"):
                _verify_backup(backup)

    def test_empty_first_slot_restore_returns_paths_to_absent(self):
        with tempfile.TemporaryDirectory() as directory:
            stack = pathlib.Path(directory)
            backup = _backup(stack)
            (stack / "compose.yaml").write_text("new\n")
            (stack / ".env").write_text("new\n")
            (stack / "state").mkdir(); (stack / "uploads").mkdir()
            _restore_backup(stack, backup)
            for name in ("compose.yaml", ".env", "state", "uploads"):
                self.assertFalse((stack / name).exists())

    def test_backup_manifest_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as directory:
            stack = pathlib.Path(directory) / "stack"
            stack.mkdir()
            outside = pathlib.Path(directory) / "outside"
            outside.write_text("outside\n")
            backup = _backup(stack)
            manifest_path = backup / "SHA256.json"
            manifest = json.loads(manifest_path.read_text())
            manifest["../../outside"] = __import__("hashlib").sha256(
                outside.read_bytes()).hexdigest()
            manifest_path.write_text(json.dumps(manifest))
            with self.assertRaisesRegex(PreviewError, "seal"):
                _verify_backup(backup)

    @mock.patch.dict("os.environ", {
        "SNAPFLOW_PREVIEW_MUTATION_AUTHORIZED": "OWNER_AUTHORIZED_MANUAL_PREVIEW",
        "PREVIEW_ADMIN_PASSWORD": "correct-horse-battery-staple",
        "PREVIEW_JWT_SECRET": "0123456789abcdef0123456789abcdef",
    }, clear=False)
    @mock.patch("neo_dev_webhook.manual_preview_stack.verify")
    @mock.patch("neo_dev_webhook.manual_preview_stack._run_compose")
    @mock.patch("neo_dev_webhook.manual_preview_stack.assert_preview_scope")
    def test_reset_failure_restores_exact_preview_files_and_previous_stack(
            self, scope, compose, verify):
        with tempfile.TemporaryDirectory() as directory:
            stack = pathlib.Path(directory)
            (stack / ".snapflow-preview-only").write_text("preview-only\n")
            (stack / "compose.yaml").write_bytes(b"old-compose\x00")
            (stack / ".env").write_bytes(b"old-env\x00")
            for name, value in (("state", b"old-db\x00"), ("uploads", b"old-upload\x00")):
                (stack / name).mkdir()
                (stack / name / "content.bin").write_bytes(value)
            before = {str(path.relative_to(stack)): path.read_bytes()
                      for path in stack.rglob("*") if path.is_file()
                      and ".preview-backups" not in path.parts}
            scope.return_value = stack
            compose.side_effect = [mock.Mock(), RuntimeError("injected up failure"), mock.Mock()]
            with self.assertRaisesRegex(PreviewError, "reset failed; previous stack restored"):
                reset_seed(SHA)
            after = {str(path.relative_to(stack)): path.read_bytes()
                     for path in stack.rglob("*") if path.is_file()
                     and ".preview-backups" not in path.parts}
            self.assertEqual(after, before)
            self.assertEqual(compose.call_args_list[-1].args[1:],
                             ("up", "-d", "--remove-orphans"))
            verify.assert_not_called()

    def test_preview_smoke_is_fixed_route_authenticated_and_exact_sha_bound(self):
        root = pathlib.Path(__file__).parents[3]
        smoke = (root / "e2e/manual-preview-smoke.ts").read_text()
        contract = (root / "e2e/support/manual-preview-contract.ts").read_text()
        package = json.loads((root / "package.json").read_text())
        for value in (FIXED_ROUTE, "PREVIEW_ADMIN_EMAIL", "PREVIEW_ADMIN_PASSWORD",
                      "EXPECTED_SHA", "/login", "/projects", "BuildVersion"):
            self.assertIn(value, smoke + contract)
        self.assertNotIn("BASE_URL", smoke + contract)
        self.assertIn("manual-preview-smoke.ts", package["scripts"]["e2e:preview-smoke"])


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

    @staticmethod
    def _issue():
        return {"number": 91, "state": "OPEN", "labels": [{"name": "neo-dev"}]}

    @staticmethod
    def _pr(body="Closes #91"):
        return {
            "number": 92, "body": body, "isDraft": True, "headRefOid": SHA,
            "baseRefOid": BASE_SHA, "mergeable": "MERGEABLE",
            "updatedAt": "2026-08-09T10:00:00Z", "author": {"login": "writer"},
            "files": [{"path": "backend/src/routes/items.ts"}],
        }

    @staticmethod
    def _checks(overrides=None):
        states = {name: ("completed", "success") for name in REQUIRED_CHECKS}
        states.update(overrides or {})
        return {"check_runs": [
            {"name": name, "status": status, "conclusion": conclusion,
             "html_url": f"https://ci/{index}", "head_sha": SHA}
            for index, (name, (status, conclusion)) in enumerate(states.items())
        ]}

    def _clean_evidence(self, **overrides):
        report = tempfile.NamedTemporaryFile(mode="wb", delete=False)
        report.write(b"independent clean review report\n")
        report.close()
        self.addCleanup(pathlib.Path(report.name).unlink)
        values = {
            "pr_number": 92, "base_sha": BASE_SHA, "head_sha": SHA,
            "verdict": "CLEAN", "reviewed_at": "2026-08-09T11:00:00Z",
            "reviewer_session_id": str(uuid.uuid4()), "reviewer_login": "reviewer",
            "implementation_session_id": str(uuid.uuid4()),
            "writer_login": "writer", "detached_checkout_sha": SHA,
            "report_path": report.name,
            "report_sha256": __import__("hashlib").sha256(
                pathlib.Path(report.name).read_bytes()).hexdigest(),
        }
        values.update(overrides)
        return self._evidence(values)

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_accepts_exact_head_successful_checks_and_fresh_clean_review(self, gh):
        checks = self._checks()
        checks["check_runs"].extend([
            {**checks["check_runs"][0], "html_url": "https://ci/pr-duplicate"},
            {"name": "Unrelated", "status": "completed", "conclusion": "failure",
             "html_url": "https://ci/unrelated", "head_sha": SHA},
        ])
        gh.side_effect = [self._issue(), [self._pr()], checks]
        result = validate_gate(
            91, f"/preview {SHA}", self._clean_evidence(),
            now=datetime(2026, 8, 9, 12, tzinfo=timezone.utc))
        self.assertEqual(result["sha"], SHA)
        self.assertEqual(set(result["checks"]), set(REQUIRED_CHECKS))

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_rejects_missing_pending_and_failed_required_checks(self, gh):
        cases = ({"Test Summary": None},
                 {"Backend Tests (Deno)": ("in_progress", None)},
                 {"Frontend Tests (Vitest)": ("completed", "failure")})
        for changes in cases:
            checks = self._checks()
            name, value = next(iter(changes.items()))
            checks["check_runs"] = [run for run in checks["check_runs"] if run["name"] != name]
            if value:
                checks["check_runs"].append({"name": name, "status": value[0],
                    "conclusion": value[1], "html_url": "https://ci/bad", "head_sha": SHA})
            gh.side_effect = [self._issue(), [self._pr()], checks]
            with self.subTest(changes=changes), self.assertRaisesRegex(
                    PreviewError, "required exact-SHA checks"):
                validate_gate(91, f"/preview {SHA}", self._clean_evidence())

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_rejects_failed_duplicate_of_otherwise_successful_required_run(self, gh):
        checks = self._checks()
        checks["check_runs"].append({
            "name": "Test Summary", "status": "completed", "conclusion": "failure",
            "html_url": "https://ci/failed-duplicate", "head_sha": SHA,
        })
        gh.side_effect = [self._issue(), [self._pr()], checks]
        with self.assertRaisesRegex(PreviewError, "required exact-SHA checks"):
            validate_gate(91, f"/preview {SHA}", self._clean_evidence())

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_rejects_ineligible_issue_and_non_exact_pr_linkage(self, gh):
        for issue_data, prs in (({"number": 91, "state": "CLOSED",
                                  "labels": [{"name": "neo-dev"}]}, [self._pr()]),
                                 (self._issue(), [self._pr("Closes #191")]),
                                 (self._issue(), [self._pr(), self._pr("Refs #91")])):
            gh.side_effect = [issue_data, prs]
            with self.assertRaises(PreviewError):
                validate_gate(91, f"/preview {SHA}", self._clean_evidence())

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_review_evidence_schema_identity_and_time_are_fail_closed(self, gh):
        cases = (
            {"reviewed_at": "not-a-time"},
            {"reviewed_at": "2026-08-09T13:00:00Z"},
            {"reviewed_at": "2026-08-09T09:00:00Z"},
            {"pr_number": 93}, {"base_sha": SHA}, {"head_sha": BASE_SHA},
            {"reviewer_login": "writer"}, {"writer_login": "someone-else"},
            {"detached_checkout_sha": BASE_SHA}, {"report_sha256": "bad"},
            {"verdict": "APPROVED"}, {"reviewer_session_id": "not-a-uuid"},
            {"extra": "field"},
        )
        for changes in cases:
            gh.side_effect = [self._issue(), [self._pr()], self._checks()]
            with self.subTest(changes=changes), self.assertRaises(PreviewError):
                validate_gate(91, f"/preview {SHA}", self._clean_evidence(**changes),
                              now=datetime(2026, 8, 9, 12, tzinfo=timezone.utc))

    @mock.patch("neo_dev_webhook.manual_preview._gh_json")
    def test_review_evidence_rejects_every_missing_field(self, gh):
        evidence_path = self._clean_evidence()
        complete = json.loads(evidence_path.read_text())
        for missing in tuple(complete):
            incomplete = dict(complete)
            incomplete.pop(missing)
            path = self._evidence(incomplete)
            gh.side_effect = [self._issue(), [self._pr()], self._checks()]
            with self.subTest(missing=missing), self.assertRaisesRegex(
                    PreviewError, "fields are missing"):
                validate_gate(91, f"/preview {SHA}", path)

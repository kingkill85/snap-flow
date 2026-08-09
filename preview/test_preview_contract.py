import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREVIEW = ROOT / "preview"


class PreviewContractTest(unittest.TestCase):
    def test_one_persistent_stack_without_reset_or_delete(self):
        compose_path = PREVIEW / "compose.yaml"
        deploy_path = PREVIEW / "deploy.py"
        self.assertTrue(compose_path.exists(), "preview/compose.yaml is missing")
        self.assertTrue(deploy_path.exists(), "preview/deploy.py is missing")

        compose = compose_path.read_text()
        deploy = deploy_path.read_text()
        self.assertIn("container_name: snapflow-test", compose)
        self.assertIn("SNAPFLOW_IMAGE", compose)
        self.assertIn("snapflow-test.kingkill.org", compose)
        self.assertNotIn("ports:", compose)
        self.assertIn("/app/backend/data", compose)
        self.assertIn("/app/backend/uploads", compose)
        for forbidden in ("down", "--volumes", "reset", "seed", "/api/projects", "project-groups"):
            self.assertNotIn(forbidden, deploy)

    def test_only_full_sha_is_accepted_and_mapped_to_exact_image(self):
        deploy_path = PREVIEW / "deploy.py"
        self.assertTrue(deploy_path.exists(), "preview/deploy.py is missing")
        spec = importlib.util.spec_from_file_location("preview_deploy", deploy_path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        sha = "0123456789abcdef0123456789abcdef01234567"
        self.assertEqual(module.image_for_sha(sha), f"ghcr.io/kingkill85/snap-flow:sha-{sha}")
        for invalid in ("main", "abc123", sha.upper(), sha + "0"):
            with self.assertRaises(ValueError):
                module.image_for_sha(invalid)

    def test_deploy_updates_same_stack_and_verifies_running_sha(self):
        deploy_path = PREVIEW / "deploy.py"
        self.assertTrue(deploy_path.exists(), "preview/deploy.py is missing")
        deploy = deploy_path.read_text()
        self.assertIn('"pull"', deploy)
        self.assertIn('"up", "-d"', deploy)
        self.assertIn("/version", deploy)
        self.assertIn("running_sha", deploy)

    def test_requested_sha_is_built_and_exposed_by_the_application(self):
        workflow_path = ROOT / ".github/workflows/manual-preview-image.yml"
        self.assertTrue(workflow_path.exists(), "manual preview image workflow is missing")
        workflow = workflow_path.read_text()
        dockerfile = (ROOT / "Dockerfile").read_text()
        backend = (ROOT / "backend/src/main.ts").read_text()
        self.assertIn("workflow_dispatch", workflow)
        self.assertIn("requested_sha", workflow)
        self.assertIn("sha-${{ inputs.requested_sha }}", workflow)
        self.assertIn("ARG BUILD_SHA", dockerfile)
        self.assertIn("SNAPFLOW_BUILD_SHA", dockerfile)
        self.assertIn("app.get('/version'", backend)
        self.assertIn("SNAPFLOW_BUILD_SHA", backend)


if __name__ == "__main__":
    unittest.main()

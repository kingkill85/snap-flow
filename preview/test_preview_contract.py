import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREVIEW = ROOT / "preview"


class PreviewContractTest(unittest.TestCase):
    def test_one_persistent_stack_without_reset_or_delete(self):
        compose_path = PREVIEW / "compose.yaml"
        self.assertTrue(compose_path.exists(), "preview/compose.yaml is missing")
        compose = compose_path.read_text()
        self.assertIn("container_name: snapflow-test", compose)
        self.assertIn("SNAPFLOW_IMAGE", compose)
        self.assertIn("snapflow-test.kingkill.org", compose)
        self.assertNotIn("ports:", compose)
        self.assertIn("/app/backend/data", compose)
        self.assertIn("/app/backend/uploads", compose)
        for forbidden in ("down", "--volumes", "reset", "seed", "/api/projects", "project-groups"):
            self.assertNotIn(forbidden, compose)

    def test_requested_sha_is_built_and_exposed_by_the_application(self):
        workflow_path = ROOT / ".github/workflows/manual-preview-image.yml"
        self.assertTrue(workflow_path.exists(), "manual preview image workflow is missing")
        workflow = workflow_path.read_text()
        dockerfile = (ROOT / "Dockerfile").read_text()
        backend = (ROOT / "backend/src/main.ts").read_text()
        self.assertIn("workflow_dispatch", workflow)
        self.assertIn("pull_request", workflow)
        self.assertIn("requested_sha", workflow)
        self.assertIn("sha-${{ env.REQUESTED_SHA }}", workflow)
        self.assertIn("ARG BUILD_SHA", dockerfile)
        self.assertIn("SNAPFLOW_BUILD_SHA", dockerfile)
        self.assertIn("app.get('/version'", backend)
        self.assertIn("SNAPFLOW_BUILD_SHA", backend)


if __name__ == "__main__":
    unittest.main()

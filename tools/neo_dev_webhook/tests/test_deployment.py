import base64
import pathlib
import tempfile
import unittest

from neo_dev_webhook.deployment import validate_pinned_host


class DeploymentTest(unittest.TestCase):
    def test_exact_operator_pin_is_required_and_mismatch_rejected(self):
        key = base64.b64encode(b"operator-verified-key").decode()
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "known_hosts"
            path.write_text(f"[192.168.178.4]:2222 ssh-ed25519 {key}\n")
            self.assertIn("192.168.178.4", validate_pinned_host(path, "192.168.178.4", 2222))
            path.write_text(f"192.168.178.4 ssh-ed25519 {key}\n")
            with self.assertRaisesRegex(ValueError, "exactly one"):
                validate_pinned_host(path, "192.168.178.4", 2222)
            path.write_text(f"[192.168.178.4]:2222 ssh-ed25519 {key}\n" * 2)
            with self.assertRaisesRegex(ValueError, "exactly one"):
                validate_pinned_host(path, "192.168.178.4", 2222)


if __name__ == "__main__":
    unittest.main()

# Dockge deployment checklist

This bundle updates the existing `snapflow-neo-dev-webhook` Dockge/Compose stack; it does not create parallel systemd services or deploy automatically.

1. Confirm `/opt/data/services/snapflow-neo-dev-webhook`, `/opt/data/stacks/snapflow-neo-dev-webhook/compose.yaml`, `/var/lib/neo-dev`, the existing `snapflow-dev` container, client identity, public key, and pinned known-hosts file.
2. Run `sudo tools/neo_dev_webhook/deploy/install.sh install`. Record the emitted backup directory under `/var/lib/neo-dev/backups`.
3. Review `docker compose ... config`, file ownership/modes, forced authorized-key entry, sudoers validation, root-only state, and the managed block appended to the existing profile.
4. With separate deployment authorization, run `sudo tools/neo_dev_webhook/deploy/install.sh activate` and inspect only receiver/consumer logs and health in the existing stack.
5. Do not trigger Issue #13 until the later explicit E2E authorization.

Rollback uses `sudo tools/neo_dev_webhook/deploy/install.sh rollback /var/lib/neo-dev/backups/<stamp>`, restores source/Compose/profile backups, and requires restoring container controller files from the preceding approved image snapshot before activation.

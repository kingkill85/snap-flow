# Dockge deployment checklist

This bundle updates the existing `snapflow-neo-dev-webhook` Dockge/Compose stack; it does not create parallel systemd services or deploy automatically.

1. Confirm `/opt/data/services/snapflow-neo-dev-webhook`, `/opt/data/build/snapflow-neo-dev-webhook/compose.yaml`, durable `/var/lib/neo-dev/neo-dev.sqlite`, the existing `snapflow-dev` container, client identity/public key, and pinned known-hosts file. The pin must contain exactly one already operator-verified `[192.168.178.4]:2222` key obtained from an authenticated operator inventory or console; never establish trust with an unverified `ssh-keyscan` result.
2. Run `sudo tools/neo_dev_webhook/deploy/install.sh install`. Record the emitted backup directory under `/var/lib/neo-dev/backups`.
3. Review `docker compose ... config`, effective Python entrypoints/argv, manifest hashes/ownership/modes, forced-command allow/reject checks, dedicated `neo-controller` identity, worker denial, durable database checksum, prerequisites, and the managed profile block.
4. With separate deployment authorization, run `sudo tools/neo_dev_webhook/deploy/install.sh activate` and inspect only receiver/consumer logs and health in the existing stack.
5. Do not trigger Issue #13 until the later explicit E2E authorization.

Rollback uses `sudo tools/neo_dev_webhook/deploy/install.sh rollback /var/lib/neo-dev/backups/<stamp>`. The checksummed backup restores source, base/override Compose, profile, host adapter/library, controller files, sudoers, authorized keys, and state while removing paths that were absent before installation.

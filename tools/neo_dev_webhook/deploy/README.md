# Split-scope live deployment checklist

No process can see all live paths. These phases are separate transactions with separate backups and rollbacks; no script claims cross-scope atomicity. Nothing here runs automatically.

## 1. Hermes scope

From the Hermes container as `hermes`, run `hermes-stage.sh install`. It backs up under `/opt/data/backups/snapflow-neo-dev-webhook`, stages Python into `/opt/data/services/snapflow-neo-dev-webhook/src`, installs the host adapter/library and one-use transition tool, and patches only the managed profile block. `verify` requires the dedicated controller key to be a non-symlink owned `hermes:hermes` mode `0600`, validates the exclusive trusted endpoint pin, hashes installed source/adapter, and checks the exact profile block. Roll back only this scope with its returned backup.

The workflow identity is `/opt/data/credentials/snapflow-controller-client`; it is distinct from Michael/Neo's maintenance key. The maintenance key is used only by the explicit controller installation wrapper, never by the consumer adapter or Codex.

## 2. Controller scope

From Hermes, `hermes-controller-install.sh install` creates a fixed bundle and transfers it over the already pinned maintenance SSH path to `dev@192.168.178.4:2222`. The fixed remote script uses `sudo` to install the locked `neo-controller` account, its forced-command public key, root-owned code/policy/schema, narrow sudoers, and controller-owned state. Runtime workflow traffic subsequently uses only `snapflow-controller-client` as `neo-controller`; `dev` has no lifecycle sudo permission or controller private key. Controller verification requires Git, tmux, Codex, Python and sudo, but never `gh` or GitHub credentials. Rollback uses only the returned remote controller backup.

## 3. Dockge scope

No Compose patch is required. The authoritative source copy is `/opt/data/build/snapflow-neo-dev-webhook/compose.yaml`; the active Dockge control path is `/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook/compose.yaml`. An operator must separately compare/copy those through the environments that can see them.

In the Dockge control console, `dockge-activate.sh verify` checks the exact existing receiver/consumer command strings, `/srv/webhook`, `/opt/data`, and `/var/lib/neo-dev` mounts, and observes the non-empty queue at `/var/lib/neo-dev/neo-dev.sqlite` inside the running consumer. With separate deployment authorization, `activate` backs up only the active Compose and container observations, then recreates only existing `receiver` and `consumer`. It does not mutate source or controller files. Its rollback restores only that Dockge scope.

Never use `/var/lib/neo-dev` in Hermes as a host-data assumption. Docker-host durable data is `/mnt/marder/docker/snapflow-neo-dev-webhook/data`; receiver/consumer see it as `/var/lib/neo-dev`.

## Tool boundary

Hermes staging installs `neo-dev-task-tools.json`. Dispatcher tasks are admitted only when the effective task policy exposes the one-use `snapflow-neo-dev-transition` tool and denies terminal, code execution, shell, SSH, Git and filesystem writes. The consumer performs GitHub reads with fixed `/opt/data/bin/gh` and `GH_CONFIG_DIR=/opt/data/home/.config/gh`, performs mechanical controller dispatch, and processes the bounded decision. If the installed Hermes runtime cannot demonstrate that effective tool policy, staging verification must fail and activation must not proceed.

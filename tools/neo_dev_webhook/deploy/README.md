# Split-scope live deployment checklist

No process can see all live paths. These phases are separate transactions with separate backups and rollbacks; no script claims cross-scope atomicity. Nothing here runs automatically.

## 1. Hermes scope

From the Hermes container as `hermes`, run `hermes-stage.sh install`. It backs up under `/opt/data/backups/snapflow-neo-dev-webhook`, stages Python into `/opt/data/services/snapflow-neo-dev-webhook/src`, installs the host adapter/library and the profile-local plugin at `/opt/data/profiles/dev/plugins/snapflow_neo_dev_transition`, and patches only the managed profile block. The standard loader requires `plugin.yaml` and `__init__.py` with `register(ctx)` in the active profile's `plugins` directory. Roll back only this scope with its returned backup.

Run `hermes-stage.sh configure-tools`. It uses only supported operations: `hermes -p dev plugins enable snapflow-neo-dev-transition` and `hermes -p dev config set platform_toolsets.cli '["snapflow_neo_dev"]'`; it never edits `config.yaml`. The prior value is saved in the staging backup and rollback restores it. Restart the dev profile gateway with `hermes -p dev gateway restart` (or its s6-managed equivalent in the image), then run `hermes-stage.sh verify`. Verification exercises the installed plugin loader and `_resolve_worker_cli_toolsets` path. It requires exactly the `snapflow_neo_dev` toolset and the `snapflow_neo_dev_transition` tool. Only successful live verification creates `.snapflow-neo-dev-tools.enforced`; install/configuration removes it and no manual attestation operation exists.

The workflow identity is `/opt/data/credentials/snapflow-controller-client`; it is distinct from Michael/Neo's maintenance key. The maintenance key is used only by the explicit controller installation wrapper, never by the consumer adapter or Codex.

## 2. Controller scope

From Hermes, `hermes-controller-install.sh install` creates a fixed bundle and transfers it over the already pinned maintenance SSH path to `dev@192.168.178.4:2222`. The fixed remote script uses `sudo` to install the locked `neo-controller` account, its forced-command public key, root-owned code/policy/schema, narrow sudoers, and controller-owned state. Runtime workflow traffic subsequently uses only `snapflow-controller-client` as `neo-controller`; `dev` has no lifecycle sudo permission or controller private key. Controller verification requires Git, tmux, Codex, Python and sudo, but never `gh` or GitHub credentials. Rollback uses only the returned remote controller backup.

## 3. Dockge scope

No Compose patch is required. The authoritative source copy is `/opt/data/build/snapflow-neo-dev-webhook/compose.yaml`; the active Dockge control path is `/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook/compose.yaml`. An operator must separately compare/copy those through the environments that can see them.

In the Dockge control console, `dockge-activate.sh verify` uses only shell and Docker/Compose (not Python), checks the exact existing receiver/consumer command strings, `/srv/webhook`, `/opt/data`, and `/var/lib/neo-dev` mounts, and observes the non-empty queue at `/var/lib/neo-dev/neo-dev.sqlite` inside the running consumer. With separate deployment authorization, `activate` backs up only the active Compose and container observations, then recreates only existing `receiver` and `consumer`. It does not mutate source or controller files. Its rollback restores only that Dockge scope.

Never use `/var/lib/neo-dev` in Hermes as a host-data assumption. Docker-host durable data is `/mnt/marder/docker/snapflow-neo-dev-webhook/data`; receiver/consumer see it as `/var/lib/neo-dev`.

## Tool boundary

The dispatcher resolves `platform_toolsets.cli` from the assignee profile in `_resolve_worker_cli_toolsets` and pins it with `--toolsets`; Kanban is auto-added only for dispatcher workers. There is no per-card toolset field. The dev profile is therefore restricted to the one native plugin toolset. Its handler requires `HERMES_KANBAN_TASK` and calls `CapabilityBroker.submit` directly without shell. Terminal, `code_execution`, file, shell, SSH and Git are excluded. The current broad live profile must be restricted, its plugin loaded, and its gateway restarted and verified before activation.

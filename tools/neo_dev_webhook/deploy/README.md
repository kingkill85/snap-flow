# Split-scope live deployment checklist

No process can see all live paths. These phases are separate transactions with separate backups and rollbacks; no script claims cross-scope atomicity. Nothing here runs automatically.

## 1. Hermes scope

From the Hermes container as `hermes`, run `hermes-stage.sh install`. It backs up under `/opt/data/backups/snapflow-neo-dev-webhook`, stages Python into `/opt/data/services/snapflow-neo-dev-webhook/src`, installs the host adapter/library and the profile-local plugin at `/opt/data/profiles/dev/plugins/snapflow_neo_dev_transition`, and patches only the managed profile block. The standard loader requires `plugin.yaml` and `__init__.py` with `register(ctx)` in the active profile's `plugins` directory. Roll back only this scope with its returned backup.

Run `hermes-stage.sh configure-tools`. It enables the plugin and uses only `hermes -p dev tools disable/enable <toolset> --platform cli`; it does not pass JSON-looking strings through `config set` and never edits `config.yaml`. The resolver must return exactly `browser, kanban, memory, session_search, skills, snapflow_neo_dev, web`. The staging backup records the resolver result and plugin enablement as JSON; rollback reconstructs the prior surface through the same native tools operations. Restart the dev profile gateway with `hermes -p dev gateway restart` (or its s6-managed equivalent in the image), then run `hermes-stage.sh verify`. Verification runs with the Python interpreter from the installed `hermes` shebang, `HERMES_HOME=/opt/data/profiles/dev`, the supported `discover_plugins`/`get_plugin_manager` API, `_resolve_worker_cli_toolsets`, expanded model definitions and registry dispatch. Only successful live verification creates `.snapflow-neo-dev-tools.enforced`; install/configuration removes it and no manual attestation operation exists.

The workflow identity is `/opt/data/credentials/snapflow-controller-client`; it is distinct from Michael/Neo's maintenance key. The maintenance key is used only by the explicit controller installation wrapper, never by the consumer adapter or Codex.

## 2. Controller scope

From Hermes, `hermes-controller-install.sh install` creates a fixed bundle and transfers it over the already pinned maintenance SSH path to `dev@192.168.178.4:2222`. Before installation, the externally managed persistent sshd configuration must produce `AllowUsers dev neo-controller` and, for `neo-controller`, `AuthenticationMethods publickey`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, no forwarding and no TTY. The installer refuses to continue unless `sshd -T -C user=neo-controller,...` proves those settings. It leaves the account unlocked for public-key viability but with an empty password field that cannot authenticate under that fail-closed sshd policy; it never sets a known password. Do not restore broad `dev` sudo: only `neo-controller` may sudo the fixed privileged controller.

The privileged controller and one-shot supervisor own protected state. Their root-only project worker adapter executes a tiny Git/tmux/process argv grammar as `dev` with `setpriv --no-new-privs`, so Git sees the dev-owned repository and tmux reaches the existing dev-owned `snapflow-dev` server without `safe.directory=*`. The tmux Codex wrapper runs directly as `dev` and talks over a one-shot Unix socket to the root supervisor; it has neither lifecycle sudo nor state access. Controller verification requires Git, tmux, Codex, Python, sudo, `setpriv`, and sshd, but never `gh` or GitHub credentials. Rollback uses only the returned remote controller backup.

## 3. Dockge scope

No Compose patch is required. The authoritative source copy is `/opt/data/build/snapflow-neo-dev-webhook/compose.yaml`; the active Dockge control path is `/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook/compose.yaml`. An operator must separately compare/copy those through the environments that can see them.

In the Dockge control console, `dockge-activate.sh verify` uses only shell and Docker/Compose (not Python), checks the exact existing receiver/consumer command strings, `/srv/webhook`, `/opt/data`, and `/var/lib/neo-dev` mounts, and observes the non-empty queue at `/var/lib/neo-dev/neo-dev.sqlite` inside the running consumer. With separate deployment authorization, `activate` backs up only the active Compose and container observations, then recreates only existing `receiver` and `consumer`. It does not mutate source or controller files. Its rollback restores only that Dockge scope.

Never use `/var/lib/neo-dev` in Hermes as a host-data assumption. Docker-host durable data is `/mnt/marder/docker/snapflow-neo-dev-webhook/data`; receiver/consumer see it as `/var/lib/neo-dev`.

## Tool boundary

The dispatcher resolves `platform_toolsets.cli` from the assignee profile in `_resolve_worker_cli_toolsets` and pins it with `--toolsets`; Kanban is auto-added only for dispatcher workers. There is no per-card toolset field. The safe profile surface preserves `web`, `browser`, `memory`, `session_search` and `skills`, plus the native transition tool and dispatcher Kanban lifecycle tools. Its `handler(args: dict, **kw)` requires `HERMES_KANBAN_TASK`, validates exactly four fields, and calls `CapabilityBroker.submit` directly without shell. Terminal, `code_execution`, file, delegation, cron, shell, SSH and Git are excluded. Verification expands concrete model tool definitions and rejects execution/mutation tools before writing the marker.

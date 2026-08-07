# Generic Neo Dev orchestrator repair evidence

## Scope and authorization

The operator authorized an emergency repository-only repair of the mechanism that creates normal governed Issue workflows. The authorization permits code, documentation, tests, commit, and push on `fix/generic-neo-dev-orchestrator`. It does not permit deployment, secrets/access changes, release, merge, or triggering Issue #13.

## Implemented boundaries

- Generic positive Issue numbers derive validated issue branch/worktree/tmux coordinates; Issue #77 remains an explicit closed-bootstrap override.
- Start verifies the root-owned repository path, common Git directory and normalized origin before fetching `origin/main`, then creates or verifies the issue worktree/branch and sole Codex window.
- Every webhook delivery gets a deterministic Kanban execution ID while retaining one controller lifecycle and Codex session. Successful handoffs reset failure retries; project concurrency remains one until independently verified finalization.
- The host adapter is fixed to dedicated `neo-controller@192.168.178.4:2222`, `/opt/data/credentials/snapflow-controller-client`, and `/opt/data/tailscale_known_hosts`. It accepts the actual non-symlink `hermes:hermes 0600` private-key boundary, ignores uncontrolled SSH configuration, and uses `shell=False`.
- Only the public-key-only `neo-controller` has lifecycle sudo rights. The installer fail-closes unless the external sshd policy permits that account and disables password/interactive authentication. Controller code is root-owned, trusted state is `neo-controller:neo-controller 0700`, and Codex remains `dev` without lifecycle sudo or state access.
- Root-owned controller verification crosses a fixed root-only adapter that drops only bounded Git/tmux/process argv to `dev` with `no_new_privs`. This reaches the dev-owned repository and `snapflow-dev` tmux server without trusting the repository as root or configuring `safe.directory=*`. A one-shot root supervisor owns lifecycle verification/state while the tmux Codex runtime remains an unprivileged `dev` client; disconnects reconcile to bounded recoverable state.
- The controller owns the legal lifecycle chain and immutable SHA/timestamp evidence. Worker-selected phases, early commands, spec commits containing runtime paths, and gate-order bypasses are rejected.
- Cards resolve the dev profile's real Hermes CLI toolsets to a bounded lookup/reasoning surface (`web`, `browser`, `memory`, `session_search`, `skills`), one profile-local transition tool, and dispatcher-added Kanban lifecycle tools. Execution, filesystem, delegation and cron surfaces are denied.
- Closure synchronization uses durable backoff without consuming the failure budget and automatically finalizes after verified `merged_closed` state.
- No Compose mutation is required. Dockge verification uses shell and Docker inspection only, preserves both exact live commands and mounts, and observes `/var/lib/neo-dev/neo-dev.sqlite` in the consumer.
- Initial Codex work is specification-only. Later approval/review/accept/merge commands resume the same session with separate gates.
- Semantic success and closure require controller-side repository/GitHub verification. Worker claims, heartbeats and manual closure do not establish progress or release concurrency.
- Launch intent is recoverable once and then fails closed with an auditable state instead of wedging indefinitely.

## Verification

- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -p 'test_*.py'`: **124 passed, 1 environment-gated actual-Hermes integration skipped**.
- `python3 -m py_compile $(find tools/neo_dev_webhook -name '*.py' -type f -print)`: **passed**, including the profile plugin and runtime verifier.
- `bash -n tools/neo_dev_webhook/deploy/*.sh`: **passed**.
- `python3 -m json.tool` over controller JSON and the JSON-compatible `plugin.yaml`: **passed**.
- No-Python Dockge fixture `fixture-verify` plus `fixture-activate`: **passed** as part of the focused suite.
- The focused Hermes fixtures exercise the current supported `discover_plugins`/`get_plugin_manager` API and reject the removed `get_plugin_tool_names` dependency. The installed verifier selects the Python interpreter from the real `hermes` shebang and supplies the active dev `HERMES_HOME`. A local actual-Hermes source checkout was present, but its integration test remained environment-gated because this Codex image lacks the checkout's PyYAML runtime dependency; no new live-Hermes execution is claimed in this correction pass.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --specs --strict`: **2 passed, 0 failed**.
- `backend/deno lint`: **passed**.
- `backend/deno task test`: **327 passed, 1 baseline failure**. The unchanged failure is `ExcelSyncService - import only deactivates missing items from the selected product type`; this repair does not modify the Excel-sync subsystem and the repository's Issue #77 evidence records the same clean-main baseline.
- `frontend/npm run lint`: **passed**.
- `frontend/npm run test:run`: **37 files, 264 tests passed**.
- `git diff --check`: **passed**.

No UI behavior changed, so Playwright review is not applicable. The real `/opt/data/scripts/neo-dev/task.py` and live `/opt/data/services/snapflow-neo-dev-webhook` mount are not available in this worktree container. The integration fixture reproduces the verified terminal-card idempotency semantics, but no live-helper or production E2E claim is made. No deployment, live Issue trigger, merge, or secret change was performed.

## Operational prerequisites not performed

- Before controller installation, update the externally managed persistent SnapFlow-dev sshd configuration to yield `AllowUsers dev neo-controller` and the documented public-key-only `Match User neo-controller` restrictions. Then provision the dedicated `/opt/data/credentials/snapflow-controller-client` identity and forced authorization through a separately authorized deployment. The maintenance `dev` key remains outside the workflow boundary; do not restore broad dev sudo.
- Stage the profile plugin, run `hermes-stage.sh configure-tools` (native `hermes tools disable/enable --platform cli` operations), restart the dev gateway, and run `hermes-stage.sh verify` inside the actual Hermes venv/source/profile. Deployment must stop unless the resolver is exactly `browser, kanban, memory, session_search, skills, snapflow_neo_dev, web` and the expanded tool check creates the enforcement marker.
- From Dockge control, compare the source Compose copy with the active stack and run its scope-local verification before any authorized recreation. No Compose override is needed.

## Deployment artifacts (not applied)

- `tools/neo_dev_webhook/deploy/hermes-stage.sh`
- `tools/neo_dev_webhook/deploy/hermes-controller-install.sh`
- `tools/neo_dev_webhook/deploy/controller-install.sh`
- `tools/neo_dev_webhook/deploy/dockge-activate.sh`
- `tools/neo_dev_webhook/deploy/verify_live_compose.py` (repository-side fixture validator; Dockge does not invoke Python)
- `tools/neo_dev_webhook/deploy/verify_hermes_runtime.py`
- `tools/neo_dev_webhook/deploy/hermes-plugin/snapflow_neo_dev_transition/plugin.yaml`
- `tools/neo_dev_webhook/deploy/hermes-plugin/snapflow_neo_dev_transition/__init__.py`
- `tools/neo_dev_webhook/hermes_transition.py`
- `tools/neo_dev_webhook/deploy/profile.managed-block.md`
- `tools/neo_dev_webhook/deploy/README.md`
- `tools/neo_dev_webhook/deployment.py`
- `tools/neo_dev_webhook/controller/install-manifest.v1.json`
- `tools/neo_dev_webhook/controller/registry.v1.json`
- `tools/neo_dev_webhook/controller/card-capability-policy.v1.json`
- `tools/neo_dev_webhook/controller/state-schema.v1.json`
- `tools/neo_dev_webhook/controller/neo-dev-remote-project-control`
- `tools/neo_dev_webhook/controller/neo-dev-project-control`
- `tools/neo_dev_webhook/controller/neo-dev-codex-runtime`
- `tools/neo_dev_webhook/controller/neo-dev-project-worker`
- `tools/neo_dev_webhook/controller/neo-dev-runtime-supervisor`
- `tools/neo_dev_webhook/controller/neo-dev-forced-command`
- `tools/neo_dev_webhook/controller/neo-dev-project-control-privileged`
- `tools/neo_dev_webhook/controller/sshd-snapflow-neo-controller.conf` (declarative requirements for the externally managed persistent sshd configuration)
- `tools/neo_dev_webhook/controller/authorized_keys.options`
- `tools/neo_dev_webhook/controller/neo-dev-control.sudoers`

The split installer requires the existing non-empty `/opt/data/profiles/dev/projects/snapflow.md`, appends only a delimited managed block, stages the supported profile plugin, and keeps Dockge activation separate. It does not create a Compose override. Its README contains scope-local verification and rollback steps. No live deployment, gateway restart, access change, or E2E was performed.

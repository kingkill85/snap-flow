# Generic Neo Dev orchestrator repair evidence

## Scope and authorization

The operator authorized an emergency repository-only repair of the mechanism that creates normal governed Issue workflows. The authorization permits code, documentation, tests, commit, and push on `fix/generic-neo-dev-orchestrator`. It does not permit deployment, secrets/access changes, release, merge, or triggering Issue #13.

## Implemented boundaries

- Generic positive Issue numbers derive validated issue branch/worktree/tmux coordinates; Issue #77 remains an explicit closed-bootstrap override.
- Start verifies the root-owned repository path, common Git directory and normalized origin before fetching `origin/main`, then creates or verifies the issue worktree/branch and sole Codex window.
- Every webhook delivery gets a deterministic Kanban execution ID while retaining one controller lifecycle and Codex session. Successful handoffs reset failure retries; project concurrency remains one until independently verified finalization.
- The host adapter is fixed to dedicated `neo-controller@192.168.178.4:2222`, `/opt/data/credentials/snapflow-controller-client`, and `/opt/data/tailscale_known_hosts`. It accepts the actual non-symlink `hermes:hermes 0600` private-key boundary, ignores uncontrolled SSH configuration, and uses `shell=False`.
- Only locked `neo-controller` has lifecycle sudo rights. Controller code is root-owned, trusted state is `neo-controller:neo-controller 0700`, and Codex remains `dev` without lifecycle sudo or state access.
- The controller owns the legal lifecycle chain and immutable SHA/timestamp evidence. Worker-selected phases, early commands, spec commits containing runtime paths, and gate-order bypasses are rejected.
- Cards have no project-command capability; the consumer performs narrow lifecycle dispatch before creating each deterministic reasoning card.
- Closure synchronization uses durable backoff without consuming the failure budget and automatically finalizes after verified `merged_closed` state.
- Compose explicitly replaces the live shell entrypoint, retains `/var/lib/neo-dev/neo-dev.sqlite`, and targets `/opt/data/build/snapflow-neo-dev-webhook/compose.yaml`.
- Initial Codex work is specification-only. Later approval/review/accept/merge commands resume the same session with separate gates.
- Semantic success and closure require controller-side repository/GitHub verification. Worker claims, heartbeats and manual closure do not establish progress or release concurrency.
- Launch intent is recoverable once and then fails closed with an auditable state instead of wedging indefinitely.

## Verification

- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -p 'test_*.py'`: **115 passed**.
- `python3 -m py_compile tools/neo_dev_webhook/*.py tools/neo_dev_webhook/tests/*.py tools/neo_dev_webhook/tests/fixtures/*.py`: **passed**.
- `bash -n tools/neo_dev_webhook/deploy/*.sh`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --specs --strict`: **2 passed, 0 failed**.
- `backend/deno lint`: **passed**.
- `backend/deno task test`: **327 passed, 1 baseline failure**. The unchanged failure is `ExcelSyncService - import only deactivates missing items from the selected product type`; this repair does not modify the Excel-sync subsystem and the repository's Issue #77 evidence records the same clean-main baseline.
- `frontend/npm run lint`: **passed**.
- `frontend/npm run test:run`: **37 files, 264 tests passed**.
- `git diff --check`: **passed**.

No UI behavior changed, so Playwright review is not applicable. The real `/opt/data/scripts/neo-dev/task.py` and live `/opt/data/services/snapflow-neo-dev-webhook` mount are not available in this worktree container. The integration fixture reproduces the verified terminal-card idempotency semantics, but no live-helper or production E2E claim is made. No deployment, live Issue trigger, merge, or secret change was performed.

## Operational prerequisites not performed

- Provision the dedicated `/opt/data/credentials/snapflow-controller-client` identity and forced `neo-controller` public-key authorization through the separately authorized split installer. The existing maintenance `dev` identity is not a workflow fallback.
- Configure Hermes' effective dispatcher task toolset to the staged policy and create the matching `.enforced` attestation only after verifying that terminal, code execution, shell, SSH, Git and filesystem writes are absent. Task creation fails closed without that attestation.
- From Dockge control, compare the source Compose copy with the active stack and run its scope-local verification before any authorized recreation. No Compose override is needed.

## Deployment artifacts (not applied)

- `tools/neo_dev_webhook/deploy/hermes-stage.sh`
- `tools/neo_dev_webhook/deploy/hermes-controller-install.sh`
- `tools/neo_dev_webhook/deploy/controller-install.sh`
- `tools/neo_dev_webhook/deploy/dockge-activate.sh`
- `tools/neo_dev_webhook/deploy/verify_live_compose.py`
- `tools/neo_dev_webhook/deploy/hermes-task-tools.json`
- `tools/neo_dev_webhook/hermes_transition.py`
- `tools/neo_dev_webhook/controller/snapflow-neo-dev-transition`
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
- `tools/neo_dev_webhook/controller/neo-dev-forced-command`
- `tools/neo_dev_webhook/controller/neo-dev-project-control-privileged`
- `tools/neo_dev_webhook/controller/neo-dev-codex-runtime-privileged`
- `tools/neo_dev_webhook/controller/authorized_keys.options`
- `tools/neo_dev_webhook/controller/neo-dev-control.sudoers`

The installer requires the existing non-empty `/opt/data/profiles/dev/projects/snapflow.md`, appends only a delimited managed block, stages a Compose override for the existing receiver/consumer services, and keeps activation as a separate explicit operator step. Its README contains verification and rollback steps.

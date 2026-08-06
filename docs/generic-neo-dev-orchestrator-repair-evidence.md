# Generic Neo Dev orchestrator repair evidence

## Scope and authorization

The operator authorized an emergency repository-only repair of the mechanism that creates normal governed Issue workflows. The authorization permits code, documentation, tests, commit, and push on `fix/generic-neo-dev-orchestrator`. It does not permit deployment, secrets/access changes, release, merge, or triggering Issue #13.

## Implemented boundaries

- Generic positive Issue numbers derive validated issue branch/worktree/tmux coordinates; Issue #77 remains an explicit closed-bootstrap override.
- Start fetches `origin/main`, creates or verifies the issue worktree/branch, and creates one Codex window.
- The host adapter uses fixed SSH endpoint/user/identity/known-hosts values, strict host checking, `shell=False`, strict argv validation, and only the installed remote controller.
- Durable wakeups retain one task/idempotency/session lifecycle. Project concurrency is one until trusted Issue closure finalizes the workflow.
- Initial Codex work is specification-only. Later approval/review/accept/merge commands resume the same session with separate gates.
- Semantic success requires structured repository and GitHub artifact verification and rejects heartbeat-only results.

## Verification

- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests`: **91 passed**.
- `python3 -m py_compile tools/neo_dev_webhook/*.py`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --specs --strict`: **2 passed, 0 failed**.
- `backend/deno lint`: **passed**.
- `backend/deno task test`: **327 passed, 1 baseline failure**. The unchanged failure is `ExcelSyncService - import only deactivates missing items from the selected product type`; this repair does not modify the Excel-sync subsystem and the repository's Issue #77 evidence records the same clean-main baseline.
- `frontend/npm run lint`: **passed**.
- `frontend/npm run test:run`: **37 files, 264 tests passed**.
- `git diff --check`: **passed**.

No UI behavior changed, so Playwright review is not applicable. No deployment or live Issue trigger was performed.

## Deployment artifacts (not applied)

- `tools/neo_dev_webhook/deploy/install-manifest.v1.json`
- `tools/neo_dev_webhook/deploy/neo-dev-webhook-receiver.service`
- `tools/neo_dev_webhook/deploy/neo-dev-webhook-consumer.service`
- `tools/neo_dev_webhook/deploy/snapflow.profile.md`
- `tools/neo_dev_webhook/controller/install-manifest.v1.json`
- `tools/neo_dev_webhook/controller/registry.v1.json`
- `tools/neo_dev_webhook/controller/card-capability-policy.v1.json`
- `tools/neo_dev_webhook/controller/state-schema.v1.json`
- `tools/neo_dev_webhook/controller/neo-dev-remote-project-control`
- `tools/neo_dev_webhook/controller/neo-dev-project-control`
- `tools/neo_dev_webhook/controller/neo-dev-codex-runtime`

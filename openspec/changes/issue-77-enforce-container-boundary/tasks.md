## 1. Emergency authorization and failure reproduction

- [x] 1.1 Record the operator's explicit circular-bootstrap repair authorization and its no-deploy/no-merge/no-secret/no-Issue-13-trigger boundaries
- [x] 1.2 Confirm the production failure surfaces: generic task body/workspace, Issue-77-only registry/controller, missing host adapter, pre-existing worktree assumption, generic prompt, and absent live deployment artifacts

## 2. Generic secure lifecycle implementation

- [x] 2.1 RED/GREEN: cover Issue 13 and another integer, safe deterministic coordinates, collision rejection, and explicit closed Issue 77 compatibility
- [x] 2.2 RED/GREEN: fetch `origin/main`, idempotently create or verify the issue branch/worktree, never modify main, and create one issue tmux window without duplicate Codex work
- [x] 2.3 RED/GREEN: add the fixed host-side SSH adapter with fixed host/user/identity/known-hosts, strict host checking, `shell=False`, strict argv, and sole remote-controller execution
- [x] 2.4 RED/GREEN: make task bodies self-contained, fixed to `dir:/opt/data/profiles/dev`, phase-specific, fail-fast, heartbeat-independent, and persistent across command wakeups
- [x] 2.5 RED/GREEN: make the initial Codex prompt Issue-specific and spec-only and require structured repository/GitHub verification for completion
- [x] 2.6 Preserve one durable workflow identity/task/session with project concurrency one so later Issues remain queued and isolated

## 3. Installation, documentation, and verification

- [x] 3.1 Supply declarative receiver/consumer systemd units, host adapter/profile installation manifest, and container registry/controller artifacts without secrets or privilege expansion
- [x] 3.2 Update the runbook to cover the exact deployment procedure and reviewed external profile source without directly editing the live external profile
- [x] 3.3 Run the complete focused suite, strict OpenSpec validation, required backend/frontend lint/tests, and review the diff for security/correctness; record the unchanged backend Excel-sync baseline failure accurately
- [x] 3.4 Commit conventionally and push `fix/generic-neo-dev-orchestrator`; leave Draft PR creation to authenticated host-side Neo

## 4. Separately gated live lifecycle

- [ ] 4.1 Deploy/restart receiver and consumer and install the adapters/profile only after separate deployment authorization
- [ ] 4.2 Run the Issue #13 lifecycle only after separate trigger authorization
- [ ] 4.3 Require `/accept`, sync/archive, and separate `/merge` before merge, closure, or cleanup

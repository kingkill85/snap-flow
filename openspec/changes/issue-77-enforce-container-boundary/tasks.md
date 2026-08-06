## 1. Approval gate and runner contract

- [x] 1.1 Record the authorized human approver's exact `/approve-spec <full-sha>` for this active change before editing runtime behavior
- [x] 1.2 Before declaring this packet approval-ready, inspect the repository's concrete runner/process interface and record the result: `TaskRunner` invokes `task.py` with only title/body/max-runtime/workspace/idempotency arguments, so it cannot enforce project/tmux/worktree/branch/worker coordinates; define the separate controller adapter API, registry, persistence, injected process boundary, and enforcement point in this packet without probing SSH or deferring an assumed interface until apply

## 2. Strict test-first execution boundary

- [x] 2.1 RED: add focused tests proving controller card `dir:/opt/data/profiles/dev` alone does not establish the exact implementation target and that unsupported `ssh:snapflow-dev` is never selected
- [x] 2.2 RED: add focused tests for `neo-dev-project-control <preflight|start|resume> --repository --issue-number --idempotency-key`, injected registry/persistence/process boundaries, exact Issue 77 tmux/Codex argv, and fail-closed rejection before subprocess of unknown/missing/conflicting/mismatched records, coordinate overrides/derivation, `snapflow-dev:0`, alternate targets, and any `devsnapflow-worker`
- [x] 2.3 GREEN: retain `dir:/opt/data/profiles/dev` only for the controller orchestrator card; implement the controller-owned repo+issue allowlist, immutable persisted resolution keyed with the canonical idempotency key, and argv-only adapter preflight/start/resume that launches/controls the sole Codex worker in the resolved tmux window with bounded timeouts and no shell interpolation
- [x] 2.4 REFACTOR: remove unsupported SSH-workspace/advisory routing, prohibit in-container SSH probes, and keep task prose only as defense-in-depth guidance for the controller GitHub integration split
- [ ] 2.5 Install the pinned non-secret adapter and Issue 77 registry/policy on the controller, make it the Neo Dev card's sole project-command capability, and verify version/ownership/mode; do not alter existing SSH registration, host key, client identity, secrets, ingress, dispatcher, or container provisioning

## 3. Documentation and verification

- [x] 3.1 Update `docs/github-webhook-handoff.md` with the controller-card command, adapter API, controller-owned governed registry semantics, exact non-sensitive Issue 77 record, fail-closed behavior, sole-capability policy, and controller GitHub exception without private endpoint, port, host-key, or identity-path disclosure
- [x] 3.2 Run strict OpenSpec validation and the focused webhook/archive suite; record exact commands and outcomes in the Issue #77 evidence document
- [x] 3.3 Run backend/frontend lint and tests required by repository policy, classify no new failures, and update evidence without describing a baseline failure as green
- [ ] 3.4 Obtain independent code and test reviews, resolve every finding, and repeat affected checks; record that Playwright review is not applicable because no UI behavior changes
- [ ] 3.5 Publish immutable full-SHA implementation/review evidence and request `/accept` separately from `/merge`

## 4. Post-acceptance specification lifecycle

- [ ] 4.1 After `/accept`, sync both active delta specs into canonical specs using the OpenSpec sync workflow and verify exact synchronization with the archive guard
- [ ] 4.2 Strictly validate and archive `issue-77-enforce-container-boundary` without editing the prior archived change
- [ ] 4.3 Publish final full-SHA sync/archive evidence and request the separately authorized `/merge` decision; do not merge, release, deploy, change secrets/access, or perform destructive operations without that authorization

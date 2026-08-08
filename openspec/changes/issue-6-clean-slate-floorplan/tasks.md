## 1. Approval and RED backend contract

- [ ] 1.1 Verify the authorized human's `/approve-spec <full-commit-sha>` was relayed through Neo for the exact current proposal, design, delta spec, and tasks commit; stop and restore `needs-approval` if artifacts materially change.
- [ ] 1.2 RED: add backend route tests that fail for the missing authenticated cleanup operation, covering malformed IDs, missing/cross-tenant targets, read-only versions, populated and empty floorplans, exact `deleted_count`, and route ordering.
- [ ] 1.3 RED: add repository/service tests that fail for the missing atomic cleanup behavior, covering rollback, item-only floorplan scope, retained floorplan/image/areas, retained neighboring data and BOM-only rows, and cleanup of only newly orphaned BOM roots/add-ons.

## 2. GREEN backend cleanup

- [ ] 2.1 GREEN: implement a tenant-scoped floorplan lookup and server-owned editability check that fail closed before mutation without exposing cross-tenant existence.
- [ ] 2.2 GREEN: implement transactional item-placement deletion and orphan-only BOM tree/image cleanup with idempotent zero-count behavior.
- [ ] 2.3 GREEN: add the specific authenticated floorplan cleanup route before conflicting parameter routes and return the standard success/error envelope with `deleted_count`; run the focused backend tests to green.
- [ ] 2.4 Refactor the backend implementation while keeping the focused authorization, transaction, cleanup, idempotency, and preservation tests green.

## 3. RED frontend behavior

- [ ] 3.1 RED: add placement service/hook tests that fail for the missing bulk cleanup call, no optimistic clearing, single version increment, placement/add-on clearing, dependent refresh callbacks, and failure-state preservation.
- [ ] 3.2 RED: add reusable dialog and project configurator tests that fail for missing editable/populated visibility, empty disabled state, floorplan-specific permanent-deletion warning, Cancel behavior, Delete submission lock, success synchronization, and actionable retryable errors; mock `authService` in every affected frontend test.

## 4. GREEN frontend experience

- [ ] 4.1 GREEN: add the typed placement cleanup service and hook operation, updating local placement/add-on/version state only after server success and invoking existing BOM, area, and summary refresh paths.
- [ ] 4.2 GREEN: create the reusable Clean Slate confirmation dialog with repository-standard title, Cancel/Delete labels, X/Trash icons, destructive styling, accessible warning text, pending state, and error presentation.
- [ ] 4.3 GREEN: add the Clean Slate control to active-floorplan configurator controls with read-only hiding and empty-layout disabling, wire it to the dialog/hook, and run focused frontend tests to green.
- [ ] 4.4 Refactor the frontend implementation while keeping all focused service, hook, dialog, dashboard, accessibility, and state-synchronization tests green.

## 5. Verification and independent review

- [ ] 5.1 Run `OPENSPEC_TELEMETRY=0 npm exec -- openspec verify issue-6-clean-slate-floorplan` and strict validation; resolve every finding without materially changing approved artifacts, or return to `needs-approval` with a new full-SHA artifact set when a material change is necessary.
- [ ] 5.2 Run `cd backend && deno lint` and `cd backend && deno task test`, recording exact command output and failures.
- [ ] 5.3 Run `cd frontend && npm run lint`, `cd frontend && npm run test:run`, and `cd frontend && npm run build`, recording exact command output and failures.
- [ ] 5.4 For any unrelated mandatory-gate failure, reproduce the identical command in a fresh detached worktree at `origin/main`; record the clean-main comparison and CI result in the Draft PR, and leave verification open until the authorized human explicitly accepts any baseline exception.
- [ ] 5.5 Obtain an independent code review and an independent test review against the approved artifacts; resolve findings and rerun every affected focused and mandatory gate.
- [ ] 5.6 Obtain an independent Playwright UI review at representative viewport sizes covering control visibility/disabled state, warning and cancellation, duplicate-submit prevention, successful canvas/BOM/summary refresh with retained floorplan/areas, and retryable failure behavior; resolve findings and rerun affected gates.
- [ ] 5.7 Publish final full-SHA evidence to the linked Issue and Draft PR, request `/accept` separately, and do not merge, release, deploy, change secrets/access, perform destructive production operations, sync/archive, or request `/merge` during apply.

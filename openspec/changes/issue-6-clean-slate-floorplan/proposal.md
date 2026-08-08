## Why

Issue [#6](https://github.com/kingkill85/snap-flow/issues/6) asks for a fast way to restart an unsatisfactory floorplan layout. Today, users must delete product placements one at a time, which is slow and error-prone for a populated floorplan.

## What Changes

- Add a destructive “Clean Slate” action for the active floorplan when its project version is editable.
- Require an explicit warning dialog before deletion, with Cancel and Delete actions and protection against duplicate submission.
- Delete every product placement on that floorplan as one server-side operation while retaining the floorplan, its image, and its defined areas.
- Remove BOM rows that become unreferenced as a result, then refresh placement, BOM, area-assignment, and summary state after success.
- Keep the current layout intact and show an error when the operation fails; an already-empty floorplan remains safe and yields an empty result.
- Cover the API, cleanup semantics, UI confirmation, state refresh, permissions, and failure behavior with automated tests and an independent Playwright UI review.

## Capabilities

### New Capabilities

- `floorplan-clean-slate`: Defines confirmation, authorization, atomic floorplan-scoped placement removal, dependent BOM cleanup, and UI synchronization behavior.

### Modified Capabilities

None. No existing product capability specification covers floorplan placement editing.

## Impact

- Scope identity is one-to-one: GitHub Issue #6, OpenSpec change `issue-6-clean-slate-floorplan`, branch `feature/issue-6`, this issue-scoped worktree, and its Draft PR.
- Expected implementation areas are the placement/floorplan API and repository/service transaction boundary, frontend placement service and state hook, the project configurator UI, a reusable confirmation dialog, and focused backend/frontend/Playwright tests.
- No dependency, migration, public-ingress, Hermes, or Traefik change is intended.
- Planning approval is mandatory: implementation may begin only after the authorized human approver sends `/approve-spec <full-commit-sha>` through Neo. Any material artifact revision invalidates that approval and requires a new immutable SHA approval.
- Merge, release, deployment, secret/access changes, destructive production operations, and every other privileged operation remain out of scope. Acceptance would not authorize merge.

## Why

SnapFlow users currently must delete placements one at a time to restart a floorplan design. GitHub Issue #6 requests a deliberate, floorplan-scoped reset that removes the placed products after an explicit warning while preserving the floorplan itself.

## What Changes

- Add an edit-only **Clean Slate** action for the active floorplan in the Floorplan view.
- Require an explicit destructive confirmation naming the active floorplan and explaining that all placed products and their floorplan BOM data will be permanently removed.
- Add one authenticated, authorized, floorplan-scoped backend operation that atomically deletes all item placements and associated BOM rows for that floorplan only.
- Make an already-empty floorplan a safe, successful no-op and return an authoritative removed-placement count.
- Refresh the active floorplan's placement, BOM, area-containment, selection, and related client state only after confirmed server success; preserve/refetch authoritative state and show an actionable error on failure.
- Cover API, repository/service, UI-state, Cucumber/Gherkin, and real-runtime Playwright behavior, including authorization, isolation, empty-state, failure, and concurrent-request cases.
- Preserve floorplan images/metadata, areas, other floorplans, project/catalog data, user placement preferences, and unrelated exports or proposal behavior.

## Capabilities

### New Capabilities

- `floorplan-clean-slate`: Defines the authorized, confirmed, transactional reset of item placements and associated floorplan BOM data for exactly one floorplan.

### Modified Capabilities

None.

## Impact

- Linked scope: `kingkill85/snap-flow` GitHub Issue #6, OpenSpec change `issue-6-clean-slate-reset`, branch `feature/issue-6-clean-slate-reset`, this existing issue worktree, and one future Draft PR. No PR creation is authorized in this planning run.
- Expected implementation surfaces: placement/floorplan routes and repositories/services, the frontend placement service/hook and Project Dashboard Floorplan view, a reusable confirmation dialog, and focused backend/frontend/E2E tests.
- The API adds a destructive floorplan-scoped endpoint; it does not alter existing single-placement or floorplan-deletion contracts and requires no new dependency or schema migration.
- Implementation remains gated on an authorized human `/approve-spec <full-40-character-artifact-commit-sha>` relayed through Neo. Any material artifact change invalidates that approval and requires a new immutable full-SHA review link and approval.
- Merge, release, deployment, secret/access changes, production-data operations, labels, GitHub comments, and all other privileged operations remain out of scope. `/accept` will not authorize `/merge`.

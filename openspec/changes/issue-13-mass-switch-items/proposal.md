## Why

Projects with many repeated floorplan placements are slow and error-prone to revise one placement at a time when a customer changes product preferences. Issue [#13](https://github.com/kingkill85/snap-flow/issues/13) needs a governed mass-switch workflow that previews the scope and pricing effect of replacing one exact configured product selection across the current floorplan.

## What Changes

- Add a dedicated Mass Switch mode in the configurator that starts from a placement selected on the current floorplan.
- Treat the selected placement's product, style/variant, and add-on selection as the exact source configuration and show how many matching placements will be affected.
- Let the user choose a replacement product, style/variant, and compatible add-ons, then compare the source and replacement configurations side by side, including their aggregate price difference.
- Require explicit confirmation before replacing every matching placement on that floorplan while preserving each placement's spatial properties and leaving nonmatching placements unchanged.
- Validate the requested source set and replacement configuration against current project/catalog state and fail atomically if the operation is stale or invalid.
- Add automated behavior coverage and an independent Playwright UI review for the changed configurator workflow.
- Keep this effort one-to-one with Issue #13, OpenSpec change `issue-13-mass-switch-items`, branch `feature/issue-13`, this worktree, and its Draft PR.
- Require the authorized human approver's `/approve-spec <full-commit-sha>` through Neo before implementation. Material artifact changes invalidate approval and require a new full-SHA approval; checkbox-only evidence updates do not.
- Keep merge, release, deployment, secret/access changes, destructive production operations, public ingress, and Hermes/Traefik changes out of scope. `/accept` will not authorize `/merge`.

## Capabilities

### New Capabilities

- `floorplan-mass-switch`: Defines source matching, replacement selection and preview, confirmation, atomic validation, and placement-preserving mass replacement on one floorplan.

### Modified Capabilities

- None.

## Impact

- Frontend configurator mode, extracted modal UI, catalog selection, price preview, client state, and service calls.
- Backend floorplan/placement route and service behavior needed to validate and apply a floorplan-scoped batch replacement atomically.
- Existing placement, item, variant/style, add-on, project authorization, and proposal-pricing data paths; no new external dependency or privileged infrastructure operation is planned.

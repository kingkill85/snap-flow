## Why

Editing floorplan placements one by one makes product substitutions slow and error-prone, especially when a design contains many identically configured panels, motors, tracks, or tubes. Issue #13 needs a governed way to preview and apply one replacement to an explicitly identified set while immediately reflecting the resulting BOM and price difference.

## What Changes

- Add an edit-only “Mass Switch” mode for the active floorplan. The user selects an existing source placement and sees the exact matching source configuration, affected quantity, replacement configuration, and price impact side by side before confirmation.
- Define the affected set as item placements on the active floorplan whose item, variant, and selected add-ons match the chosen source placement. Areas, placements on other floorplans, and non-matching configurations are excluded.
- Allow selection of an active replacement item, variant, and valid add-ons, including required add-ons, with a confirmation step and no mutation on cancel.
- Apply the replacement atomically through a backend operation that revalidates the previewed set and target configuration. Preserve placement identity, floorplan, position, dimensions, rotation, and area assignment while rebuilding BOM relationships safely.
- Refresh placements, floorplan BOM, and project pricing after success; reject stale or invalid requests without partial replacement and require the user to review a fresh preview.
- Add backend, frontend, Cucumber, and Playwright coverage for selection, preview, cancellation, successful replacement, price/BOM refresh, unchanged out-of-set placements, authorization, validation, stale previews, and atomic failure.
- Keep implementation, acceptance, archive, and merge behind the normal exact-SHA gates. Deployment, release, secrets/access changes, production-data operations, and merge are out of scope.

## Capabilities

### New Capabilities

- `floorplan-mass-switch`: Preview and atomically replace an exact configuration set on one editable floorplan while preserving layout and refreshing BOM/pricing.

### Modified Capabilities

- None.

## Impact

- Frontend configurator controls, selection state, modal/preview UI, placement services/hooks, and project/BOM refresh behavior.
- Backend placement routes, request validation, transactional placement/BOM service and repository behavior, and authorization checks.
- Automated backend/frontend tests plus user-visible Cucumber scenarios and Playwright evidence.
- One-to-one workflow scope: GitHub Issue #13, OpenSpec change `issue-13-mass-switch-items-v2`, branch `feature/issue-13-mass-switch-items-v2`, worktree `/workspace/snap-flow-issue-13-v2`, and a new Draft PR based on `main` commit `efcc2c2074b8bd766b4e92a30e7a515fa12b916f`.

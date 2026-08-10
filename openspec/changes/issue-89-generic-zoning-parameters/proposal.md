## Why

SnapFlow cannot currently describe reusable zoning quantities for an Area, so installers must keep relay, dimming, fan, HVAC, and similar zone counts outside the project. Issue #89 adds this data at the Product Type and Area boundaries already used by the catalog and project configurator, while leaving automatic module and BOQ selection for later work.

## What Changes

- Let administrators define, rename, order, deactivate, and safely delete reusable non-negative-integer zoning parameters owned by a Product Type.
- Expose only definitions belonging to Product Types that are both active globally and selected on the current project.
- Extend Area reads and atomic Area-property updates with values keyed by stable parameter-definition identity, including validation, authorization, stale-write handling, and preservation rules when configuration changes.
- Preserve every copied Area's zoning values when the existing Create Version flow creates a project version, remapping source Area identities to the newly copied Areas while reusing the stable Product-Type-owned parameter identities.
- Widen the existing Edit Area dialog when applicable parameters exist and present a compact, dense zoning pane with accessible ordered Product Type sections, narrow native number inputs, and direct numeric entry; do not add redundant custom increment/decrement controls.
- Render unobtrusive, high-contrast zoning annotations directly on each interactive floorplan Area, grouped by Product Type and limited to positive values; omit empty groups and avoid covering product placements.
- Include the same zoning annotations in PNG floorplan exports through a shared deterministic presentation model so interactive and raster output retain semantic and visual parity at supported scales.
- Add backward-compatible SQLite migrations plus backend, frontend, and real-runtime Cucumber/Playwright coverage with scenario traceability.
- Treat the names in the original request as configuration examples, not hard-coded BusPro/KNX fields. No default definitions are seeded in this change; administrators can add those names to the appropriate Product Type without a future data migration.
- Keep automatic module selection, BOQ calculation, data imports/exports other than the existing PNG floorplan image export, templates, and cross-project parameter presets out of scope.

## Capabilities

### New Capabilities

- `product-type-zoning-parameters`: Product-Type-owned parameter definition lifecycle, stable identity, ordering, validation, and safe rename/deactivation/deletion behavior.
- `area-zoning-values`: Project-applicable Area value persistence, compact Area editor behavior, and shared grouped positive-value annotations for interactive and PNG floorplans.

### Modified Capabilities

None. Existing specifications cover only the governed development workflow and GitHub webhook handoff, not SnapFlow product behavior.

## Impact

- Backend: additive SQLite tables/indexes/migration; Product Type, Area, and project-version-copy repositories and Hono routes; tenant/project authorization and transactional validation across floorplan, project, Product Type, definition, and Area relationships.
- Frontend: Product Type management subtable/modal controls, Area service/types/state, a responsive compact `AreaEditModal`, a shared deterministic zoning-annotation model/layout, SVG Area annotation rendering, and annotation drawing in the existing PNG export service; no new endpoint, export control, or Create Version interaction.
- Tests: Deno repository/route tests, deterministic Vitest component/service/export tests, and Issue #89-tagged Cucumber scenarios executed by Playwright against the real frontend/backend, including the existing Create Version flow, copied-value isolation, responsive editor presentation, and PNG annotation evidence.
- Compatibility: existing Product Types, projects, Areas, and API consumers continue to work with empty definition/value collections; no existing rows are reinterpreted and no default vendor-specific data is introduced.
- Workflow: this is the sole OpenSpec change for GitHub Issue #89 on branch `feature/issue-89-generic-zoning-parameters` in this worktree and Draft PR #90. The Issue, change, branch, worktree, and Draft PR remain linked one-to-one and use immutable full-SHA artifact links. This material revision invalidates prior acceptance eligibility; implementation requires a new authorized-human `/approve-spec <full-commit-sha>` relayed through Neo. Merge, release, deployment, secret/access changes, destructive production operations, GitHub mutations, and public-ingress changes remain out of scope and require their separate gates.

The only bounded product question is whether the example parameter names should later be provided as optional seed data. The safest reversible decision for Issue #89 is no seed data: it avoids imposing a vendor vocabulary while preserving exact administrator-configured names.

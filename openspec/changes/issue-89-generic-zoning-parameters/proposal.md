## Why

SnapFlow cannot currently describe reusable zoning quantities for an Area, so installers must keep relay, dimming, fan, HVAC, and similar zone counts outside the project. Issue #89 adds this data at the Product Type and Area boundaries already used by the catalog and project configurator, while leaving automatic module and BOQ selection for later work.

## What Changes

- Let administrators define, rename, order, deactivate, and safely delete reusable non-negative-integer zoning parameters owned by a Product Type.
- Expose only definitions belonging to Product Types that are both active globally and selected on the current project.
- Extend Area reads and atomic Area-property updates with values keyed by stable parameter-definition identity, including validation, authorization, stale-write handling, and preservation rules when configuration changes.
- Widen the existing Edit Area dialog when applicable parameters exist and present accessible, ordered Product Type sections with integer steppers and direct numeric entry.
- Render compact, readable zoning summaries on each floorplan Area, grouped by Product Type and limited to positive values; omit empty groups.
- Add backward-compatible SQLite migrations plus backend, frontend, and real-runtime Cucumber/Playwright coverage with scenario traceability.
- Treat the names in the original request as configuration examples, not hard-coded BusPro/KNX fields. No default definitions are seeded in this change; administrators can add those names to the appropriate Product Type without a future data migration.
- Keep automatic module selection, BOQ calculation, imports/exports, templates, and cross-project parameter presets out of scope.

## Capabilities

### New Capabilities

- `product-type-zoning-parameters`: Product-Type-owned parameter definition lifecycle, stable identity, ordering, validation, and safe rename/deactivation/deletion behavior.
- `area-zoning-values`: Project-applicable Area value persistence, Area editor behavior, and grouped positive-value floorplan summaries.

### Modified Capabilities

None. Existing specifications cover only the governed development workflow and GitHub webhook handoff, not SnapFlow product behavior.

## Impact

- Backend: additive SQLite tables/indexes/migration; Product Type and Area models, repositories, and Hono routes; tenant/project authorization and transactional validation across floorplan, project, Product Type, definition, and Area relationships.
- Frontend: Product Type management subtable/modal controls, Area service/types/state, a responsive wider `AreaEditModal`, and SVG Area summary rendering.
- Tests: Deno repository/route tests, Vitest component/service tests, and Issue #89-tagged Cucumber scenarios executed by Playwright against the real frontend/backend.
- Compatibility: existing Product Types, projects, Areas, and API consumers continue to work with empty definition/value collections; no existing rows are reinterpreted and no default vendor-specific data is introduced.
- Workflow: this is the sole OpenSpec change for GitHub Issue #89 on branch `feature/issue-89-generic-zoning-parameters` in this worktree. A future Draft PR must remain linked one-to-one and use immutable full-SHA artifact links. Implementation requires authorized-human `/approve-spec <full-commit-sha>` relayed through Neo; material artifact changes invalidate that approval. Merge, release, deployment, secret/access changes, destructive production operations, GitHub mutations, and public-ingress changes remain out of scope and require their separate gates.

The only bounded product question is whether the example parameter names should later be provided as optional seed data. The safest reversible decision for Issue #89 is no seed data: it avoids imposing a vendor vocabulary while preserving exact administrator-configured names.

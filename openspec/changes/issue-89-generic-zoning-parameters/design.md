## Context

See `proposal.md` for motivation and the two delta specs for observable behavior. The existing domain calls the owner-configured concept a Product Type in the UI and `item_types` in storage/API code. Projects select Product Types through `project_item_types`; categories are a separate catalog grouping and are not a project activation mechanism.

Areas are `placements` rows with `type = 'area'`, one `area_properties` row, and ordered `area_vertices`. `GET /api/areas?floorplan_id=...`, `GET /api/areas/:id`, and `PUT /api/areas/:id` currently return or update name/color/opacity without tenant-scoping the floorplan/project chain. The React `AreaEditModal` is one 400px dialog; `AreaPolygon` draws an SVG pill along the longest edge. Product Type management already has admin-only Hono routes, repository ordering, and a management page. Projects already expose `item_type_ids`.

SQLite migrations run sequentially from `backend/src/scripts/migrate.ts`. Repository operations are synchronous over one connection and use explicit transactions. The repository has Deno route/repository tests, Vitest component/service tests, and a root Cucumber/Playwright harness that starts and probes the real runtime. No extra runtime dependency is needed.

## Goals / Non-Goals

**Goals:**

- Model definitions and Area values as normalized, stable-identity records aligned with current Product Type, project, and Area relationships.
- Keep configuration administration separate from ordinary project editing while returning an Area-shaped aggregate that the configurator can render directly.
- Make a zoning-aware Area save all-or-nothing and detect both concurrent Area edits and configuration drift.
- Bound UI size and query work so many Areas or definitions do not create unbounded overlays or per-Area database query loops.
- Close the existing authorization gap for Area routes touched by this capability by resolving access through the owning project.

**Non-Goals:**

- Automatic module choice, BOM/BOQ generation, pricing, or electrical compatibility rules.
- Vendor-specific schemas, parameter data types other than bounded non-negative integers, parameter units, formulas, dependencies, or per-project definition overrides.
- Excel import/export, proposal/invoice output, floorplan image export, project-version copying semantics beyond preserving normal database relationships, or historical display-name snapshots.
- A new permission system, public API version, real-time collaboration channel, or bulk Area editor.

## Decisions

### 1. Add two normalized tables and an Area revision

Add `item_type_zoning_parameters` with `id`, `item_type_id`, `name`, normalized comparison key, `sort_order`, `is_active`, and timestamps. Add `area_zoning_values` with `area_placement_id`, `parameter_id`, `value`, and timestamps; its composite primary/unique key enforces one value per pair, foreign keys cascade values when an Area is deleted, and parameter deletion remains restricted. Add `revision INTEGER NOT NULL DEFAULT 0` to `area_properties`.

Checks enforce non-empty names, integer ordering/value bounds, and `value > 0`; the API treats zero/blank as deletion so zero rows are not normally stored. An index on `(item_type_id, is_active, sort_order, id)` supports definition reads and one on `(area_placement_id, parameter_id)` supports Area aggregation. Case-insensitive uniqueness is enforced through a normalized name key within the Product Type, with API validation providing readable errors.

Stable numeric identities match current repository conventions and prevent rename/reorder from changing value ownership. Alternatives considered were JSON on `area_properties` (weak referential integrity and unsafe rename/delete), fixed columns (vendor-specific and migration-heavy), and name-keyed values (rename breaks identity).

### 2. Extend Product Type routes with a nested parameter resource

Place specific routes before `/:id` catch-alls:

- `GET /api/item-types/:id/zoning-parameters` (authenticated; active only by default, `include_inactive=true` honored only for administrators)
- `POST /api/item-types/:id/zoning-parameters` (administrator)
- `PUT /api/item-types/:id/zoning-parameters/:parameterId` (administrator)
- `DELETE /api/item-types/:id/zoning-parameters/:parameterId` (administrator)
- `PATCH /api/item-types/:id/zoning-parameters/reorder` (administrator)
- `PATCH .../:parameterId/activate` and `/deactivate` (administrator)

All schemas use strict object validation, positive integer identifiers, trimmed names, integer sort orders, and complete-set reorder validation inside a transaction. A parameter ID must belong to the path Product Type. Referenced deletes return 409; the UI offers deactivation as the safe action. Product Type responses need not always embed parameters, avoiding payload changes across catalog consumers; the management subtable loads the nested resource on expansion.

An alternative was top-level parameter routes. Nesting makes ownership explicit, supports fail-closed parent/child checks, and fits the requested Product Type subtable.

### 3. Return grouped zoning data as part of Area aggregates

Area list and detail responses add:

```text
revision: number
zoning_groups: [
  {
    item_type: { id, name, abbreviation, color, sort_order },
    parameters: [{ id, name, sort_order, value }]
  }
]
```

`zoning_groups` contains active definitions for active Product Types selected by the Area's project, including value `0` when no row exists, because the same shape drives both editor and summary. Repository queries fetch all Areas, vertices, applicable definitions, and stored values in bounded batches and assemble maps in memory; they do not query once per Area/definition. The frontend filters positives for display.

This reuses existing Area fetching so opening the editor needs no race-prone secondary request and floorplan summaries render from the same authoritative state. A separate applicability endpoint was considered but would duplicate loading/error states and make list rendering harder to keep consistent.

### 4. Make zoning-aware Area updates an atomic replacement of the applicable set

Extend `PUT /api/areas/:id` with optional `revision`, `applicable_parameter_ids`, and `zoning_values: [{ parameter_id, value }]`. If `zoning_values` is present, the other two fields are required. Within one transaction the server:

1. resolves authorized Area/project access;
2. compares the submitted revision;
3. derives the current ordered applicable definition IDs and compares their set to `applicable_parameter_ids`;
4. validates every value and identity;
5. updates name/color/opacity, upserts positive values, deletes submitted zero/blank values, and increments revision exactly once;
6. commits and reloads the aggregate.

The editor sends one entry for every displayed applicable definition, so this is a full replacement for the currently applicable set; retained values for inactive/unselected definitions are untouched. A 409 leaves the dialog open, shows a reload-required message, and offers a reload action rather than silently overwriting. Validation/server errors also leave drafts intact for correction/retry. Property-only legacy requests remain accepted; when they mutate properties they also increment revision so a concurrently open zoning editor detects the change.

An alternative was independent value endpoints. That would allow partial saves and complicate Cancel/Update semantics. Timestamp comparison was rejected because SQLite timestamp precision is not a reliable monotonic concurrency token.

### 5. Enforce Area authorization at the owning project boundary

Area list/detail/create/update/vertices/delete paths touched during implementation resolve floorplan → project and apply the same tenant context rules used by project lookup. Global administrators retain existing global access; tenant roles are limited to their tenant. Inaccessible IDs return the same 404 as missing IDs to avoid cross-tenant disclosure. Definition configuration remains administrator-only. Externally supplied floorplan, Area, Product Type, parameter, revision, and reorder inputs are validated before mutation, then relationship checks repeat inside the transaction where atomicity matters.

This scopes the security correction to the Area capability rather than redesigning all floorplan routes. Merely trusting authenticated IDs was rejected because it permits cross-tenant reads and writes.

### 6. Use responsive stacked sections, not tabs, in one Area dialog

When `zoning_groups` is non-empty, increase the dialog to a bounded desktop width (approximately 800–900px), use two columns at the existing responsive breakpoint, and place zoning below Area properties on smaller screens. The right/bottom pane is titled “Zoning Parameters” and uses an accessible accordion-like stack in Product Type order. Sections begin expanded; users may collapse them, but every group heading stays visible with text plus the existing Product Type color/badge. One shared footer retains Cancel and Update.

Tabs were considered because the owner suggested them. Sections are chosen because they keep multiple Product Types simultaneously discoverable, allow comparison and keyboard traversal without hidden tab panels, and adapt naturally to a vertical mobile layout. Each row uses a labelled `input type="number"` with min/max/step plus explicitly named minus/plus buttons. Client-side constraints improve feedback but the server remains authoritative.

The Product Type management view gains an expandable parameters subtable using the existing extracted modal and action-button patterns. Create/edit uses one reusable form modal; delete confirmation is extracted and explains the deactivate alternative when referenced.

### 7. Render one bounded SVG summary block per Area

Derive summary rows from positive values only, grouped and ordered exactly as returned. Anchor a non-pointer-interactive SVG group just inward from the existing longest-edge name pill, choosing the inward direction and clamping to the Area bounding box where practical. Use inverse-scale dimensions like the existing label, fixed maximum width/row count, per-row ellipsis/clip paths plus `<title>` text, and a final `+N more` row that counts all omitted positive parameter rows. Product Type headings use text and color; meaning never relies on color alone.

One block avoids scattered labels and keeps dragging behavior unchanged. Rendering every value or allowing an unbounded foreign-object panel was rejected because small Areas and zoomed floorplans would become unreadable.

### 8. Verification is scenario-driven and includes independent UI review

Create a traceability table during implementation mapping every delta-spec scenario to Deno, Vitest, Cucumber/Playwright, or a justified independent review assertion. Tag the new feature/scenarios with Issue #89 metadata accepted by the repository traceability checker. Cucumber steps configure definitions through real authenticated API/admin UI seams, edit through the real browser UI, reload, and assert both API persistence and SVG output. Focused accessibility assertions cover names, keyboard controls, focus, dialog responsiveness, clipped-title exposure, and conflict/error recovery.

Because Area editing and floorplan rendering visibly change, independent Playwright UI review applies at desktop and narrow viewports after automated suites pass. Independent code and test review also apply under the governed workflow.

## Risks / Trade-offs

- [Large Area list payload when many definitions exist] → Batch-query and assemble once, include only project-applicable active definitions, test representative scale, and keep summaries row-bounded.
- [A definition/project selection changes while an editor is open] → Compare the exact applicability set transactionally and return 409 with reload recovery.
- [Renames alter historical wording] → Deliberately display the current reusable definition name while stable identity preserves numeric values; historical snapshots are a non-goal.
- [Deactivated/unselected values become invisible but still occupy storage] → Preserve them for reversible configuration and expose them again only when applicable; administrators can see definition usage before attempting deletion.
- [Current Area authorization is broader than intended] → Add tenant-scoped joins and regression tests for every Area route in the touched surface, returning non-disclosing 404s.
- [SVG summaries can crowd very small polygons] → Clamp dimensions, cap rows, ellipsize, and use `+N more`; accept that the compact summary conveys a subset while the editor provides all values.
- [SQLite schema rollback cannot safely drop an added column in all deployed versions] → Treat rollback as application rollback with additive tables/column left dormant; do not destructively down-migrate production data.

## Migration Plan

1. Add the new migration after the current latest migration, creating both tables, constraints, and indexes and adding `area_properties.revision DEFAULT 0`; do not seed definitions or values.
2. Run migration tests against a pre-change fixture and a fresh in-memory database, including repeated startup/idempotency through the existing migration ledger.
3. Deploy backend support before or together with the frontend. Additive response fields are ignored by old clients, and old property-only updates remain valid.
4. Roll back application code if needed while leaving additive schema dormant. Existing clients do not reference it. A later explicitly authorized cleanup migration may remove unused schema; rollback MUST NOT delete configured values.

## Open Questions

- Whether a future change should ship optional vendor-specific definition presets remains intentionally deferred. Issue #89 provides administrator configuration and seeds none, so answering this later does not alter this change's contract or implementation shape.

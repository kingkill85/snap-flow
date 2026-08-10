## Context

See `proposal.md` for motivation and the two delta specs for observable behavior. The existing domain calls the owner-configured concept a Product Type in the UI and `item_types` in storage/API code. Projects select Product Types through `project_item_types`; categories are a separate catalog grouping and are not a project activation mechanism.

Areas are `placements` rows with `type = 'area'`, one `area_properties` row, and ordered `area_vertices`. `GET /api/areas?floorplan_id=...`, `GET /api/areas/:id`, and `PUT /api/areas/:id` return and update their aggregates. `AreaEditModal` currently expands to an 850px two-column dialog when zoning groups exist and uses a local `Input` with `type="number"` and a browser-native spinner. The local shadcn/Radix-style layer already supplies `Button`, `Input`, and `Label`, and the application already uses lucide icons; it has no reusable InputNumber package.

`ConfiguratorCanvas`, `AreaPolygon`, and `floorplan-export.ts` now have a shared annotation descriptor in isolated coverage, but the real existing-project path exposes an unresolved integration defect: for project 4, Product Type 1, and Area 11, persisted positive values `test: 1` and `test2: 2` load in Edit Area while the interactive page creates zero `area-zoning-annotation` elements and PNG export records no zoning paint. The production Area data and geometry adapters feeding the shared model are therefore part of this revision's implementation and verification boundary. Product Type management and backend contracts otherwise remain unchanged.

SQLite migrations run sequentially from `backend/src/scripts/migrate.ts`. Repository operations are synchronous over one connection and use explicit transactions. The repository has Deno route/repository tests, Vitest component/service tests, and a root Cucumber/Playwright harness that starts and probes the real runtime. No extra runtime dependency is needed.

## Goals / Non-Goals

**Goals:**

- Model definitions and Area values as normalized, stable-identity records aligned with current Product Type, project, and Area relationships.
- Keep configuration administration separate from ordinary project editing while returning an Area-shaped aggregate that the configurator can render directly.
- Make a zoning-aware Area save all-or-nothing and detect both concurrent Area edits and configuration drift.
- Bound UI size and query work so many Areas or definitions do not create unbounded overlays or per-Area database query loops.
- Close the existing authorization gap for Area routes touched by this capability by resolving access through the owning project.
- Make project-version creation carry copied Areas' zoning values to their remapped Area identities without cloning Product Type definitions or weakening the existing transaction and authorization boundary.
- Use one deterministic annotation model and layout for unobtrusive interactive SVG annotations and natural-resolution PNG export, including product-placement collision avoidance.
- Align the Area editor with the approved compact visual direction while retaining generic Product Type grouping and an accessible application-framework up/down number control.

**Non-Goals:**

- Automatic module choice, BOM/BOQ generation, pricing, or electrical compatibility rules.
- Vendor-specific schemas, parameter data types other than bounded non-negative integers, parameter units, formulas, dependencies, or per-project definition overrides.
- Excel import/export, proposal/invoice output, new export formats or controls, or historical display-name snapshots; only annotation parity in the existing PNG floorplan export changes.
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

### 6. Build a compact compound number control from existing application primitives

When `zoning_groups` is non-empty, keep the bounded 800–900px desktop dialog and two-column layout, placing zoning below Area properties on smaller screens. The right/bottom pane has a prominent generic zoning heading followed by ordered lightweight Product Type headings and dense parameter rows, not tabs, collapsible cards, or a card per parameter. Each row uses one reusable compound control assembled from the local `Button`, `Input`, and `Label` primitives plus existing lucide minus/plus icons; no external InputNumber dependency is needed. Its visual order follows the supplied mockup's useful hierarchy: decrement action, compact value field, increment action, then the persistent parameter label. The application primitives, rectangular control language, focus rings, and spacing govern presentation rather than copying the mockup's circular controls.

The value field uses a non-spinner text-entry mode with `inputMode="numeric"`, so browsers do not expose a second native spinner beside the explicit application controls. It keeps a draft string so direct entry can represent a temporary blank without coercing malformed content. Decimal digits in the inclusive `0..9999` domain are valid; blank commits as zero. Non-digit, fractional, negative, non-finite, or out-of-range manual drafts show a programmatically associated error, remain available for correction, and block Update without issuing a request. Leading zeroes may normalize on commit without changing the numeric value. Decrement/increment buttons and `ArrowDown`/`ArrowUp` from the value field apply step 1 to the last valid value, clamp at 0 and 9999, and are disabled at the corresponding boundary. When the editor is submitting, all three parts are disabled.

Use a persistent `Label` association for the value field, a shared description of the bounds and validation state, and parameter-specific accessible names such as “Decrease Relay 16A” and “Increase Relay 16A”. Decrement, value, and increment remain in ordinary sequential keyboard order; every operable part has a visible focus state, and the explicit buttons provide at least a 32-by-32 CSS-pixel target without enlarging the row into a card. Icon shape is accompanied by the accessible name, and Product Type color may supplement text but never carry meaning alone. Multiple groups share aligned control columns; narrow viewports may wrap a row's persistent label below the control cluster but must not cause page-level horizontal overflow. One bottom-right footer retains Cancel and Update.

The supplied mockup's compact white pane, explicit minus/value/plus sequence, persistent labels, tight rhythm, and footer alignment are visual evidence for hierarchy. A fixed `BusPro / KNX` heading is rejected because definitions stay generic and multiple Product Types may be active. Bounded internal scrolling keeps the header and footer reachable on narrow or content-heavy layouts. Client-side constraints improve feedback but the server remains authoritative.

The Product Type management view gains an expandable parameters subtable using the existing extracted modal and action-button patterns. Create/edit uses one reusable form modal; delete confirmation is extracted and explains the deactivate alternative when referenced.

### 7. Share a pure deterministic annotation model across SVG and PNG

Add a pure frontend annotation module consumed by `ConfiguratorCanvas`/`AreaPolygon` and `floorplan-export.ts`. Its inputs are ordered Area zoning groups, Area polygon/name-label bounds, visible product-placement rectangles in natural floorplan coordinates, earlier annotation bounds in stable Area-ID order, image bounds, and a scale descriptor. Its immutable output contains positive-only grouped lines, full and displayed text, omitted-row count, a normalized anchor/collision rectangle, and style tokens; it performs no DOM or canvas work.

Normalize each API-loaded Area once at the configurator boundary so its persisted `zoning_groups`, stored vertex/placement geometry, visibility state, and stable identity enter the descriptor model together. The interactive SVG and PNG export must receive that same normalized Area collection and the same computed descriptors. The implementation must trace and correct the demonstrated existing-project failure through `useAreas`/dashboard state, `ConfiguratorCanvas`, Area polygon geometry, descriptor construction, and the export handoff; creating a descriptor directly from a synthetic Area is not evidence that this adapter path works.

Use a fixed candidate order derived from Area edges and centroid. Reject candidates intersecting visible placements; prefer the first candidate not intersecting an earlier annotation or Area-name label; clamp only when collision constraints survive. Reduce rows in stable group/parameter order with `+N more` when a complete annotation cannot fit. If no minimum safe candidate exists, omit it rather than cover a product. Stable Area-ID processing, fixed metrics, and explicit padding make the result repeatable.

Render text directly with no summary rectangle or large opaque panel. SVG and canvas share font family, weight, line-height ratio, alignment, and dual-contrast foreground plus opposite outline/halo tokens. This edge separation remains readable on varied imagery without nondeterministic pixel sampling or color-only meaning. SVG adds accessible full text/title and `pointer-events: none`.

“Match” is semantic and proportional, not pixel-identical: both surfaces use identical descriptor lines, order, omitted count, normalized anchor, collision decision, and style constants. `AreaPolygon` maps natural coordinates through its SVG viewBox/zoom behavior; the exporter maps them once to the natural-resolution canvas and scales font, line height, outline, and padding proportionally. Raster antialiasing may differ. Layout/drawing exceptions abort before image encoding or link activation so export cannot silently omit requested annotations.

Alternatives rejected were the opaque panel (obstructive), separate SVG/canvas algorithms (drift), background-pixel sampling (rendering and cross-origin variability), layout without placement geometry (covers products), and DOM capture (changes the established export sizing/pipeline).

### 8. Verification is scenario-driven and includes independent UI review

Create a traceability table during implementation mapping every delta-spec scenario to Deno, Vitest, Cucumber/Playwright, or a justified independent review assertion. Tag the new feature/scenarios with Issue #89 metadata accepted by the repository traceability checker. Cucumber steps use the real authenticated runtime, edit and reload values, assert SVG output, trigger the existing PNG export, decode the downloaded raster, and assert representative text/style/collision evidence rather than merely a download event. At least one scenario must start from an existing API-loaded project Area with persisted positive rows and real stored geometry, then prove those exact values appear in direct interactive DOM/SVG paint and in PNG paint/pixels from the same export action. Synthetic descriptor fixtures remain useful for layout boundaries but cannot satisfy this production-flow scenario.

Focused tests cover deterministic ordering, anchors, collision and scaling; production Area adapter handoff; SVG/canvas parity; fail-closed export; compound-control direct entry and step semantics; invalid drafts and disabled boundaries; parameter-specific accessible names; sequential keyboard operation; focus; target geometry; responsiveness; full-text exposure; and error recovery. Accessibility covers persistent label association, descriptions/errors, visible focus, keyboard/manual entry, distinct button names, contrast, non-color group identity, accessible full annotation text, and pointer pass-through. Responsive review covers desktop, phone-width stacking, dense alignment, internal overflow, and action reachability. Performance fixtures use many Areas and placements; the pure layout sorts once, checks bounded candidates, avoids DOM measurement/image sampling, and adds no backend queries. Because Area editing, floorplan rendering, and exported presentation change visibly, independent Playwright UI review applies at desktop and narrow viewports after automated suites pass. Independent code and test review also apply under the governed workflow.

### 9. Copy Area zoning values through the existing project-version identity maps

The existing Create Version repository operation already runs project, floorplan, BOM, placement, Area properties/vertices, and project Product Type copying inside one database transaction and builds a `placementIdMap` from every copied source placement ID to its new placement ID. After copied Areas exist, load zoning rows by joining `area_zoning_values` to source Area placements on the source version's copied floorplans. For every row, require a mapped destination Area and insert the same positive integer value with `area_placement_id` set to the mapped placement ID and `parameter_id` unchanged.

The copy query is source-version-scoped and Area-scoped, so it cannot select values for Areas that were not copied. Treat a selected zoning row without a mapped destination Area as an invariant failure instead of skipping it. The destination table's Area/parameter uniqueness and foreign keys remain the final duplicate/orphan guard. Product-Type-owned definitions are shared configuration and MUST NOT be cloned; copying `project_item_types` preserves applicability while the unchanged parameter identity preserves meaning.

Any query, mapping, constraint, or insert failure propagates through the existing transaction so the new project and all related database rows roll back together. The existing version route remains the authorization boundary: it resolves the project group under tenant context and verifies that the supplied source version belongs to that accessible group before invoking the repository. No new endpoint or frontend control is required because the current Create Version modal already triggers this operation.

Alternatives considered were copying values with the source Area IDs (creates cross-version links), cloning definitions per version (breaks Product-Type ownership and stable identity), and a post-commit copy job (permits partially created versions). Remapping only the Area foreign key within the existing transaction preserves both identity models and atomicity.

## Risks / Trade-offs

- [Large Area list payload when many definitions exist] → Batch-query and assemble once, include only project-applicable active definitions, test representative scale, and keep summaries row-bounded.
- [A definition/project selection changes while an editor is open] → Compare the exact applicability set transactionally and return 409 with reload recovery.
- [Renames alter historical wording] → Deliberately display the current reusable definition name while stable identity preserves numeric values; historical snapshots are a non-goal.
- [Deactivated/unselected values become invisible but still occupy storage] → Preserve them for reversible configuration and expose them again only when applicable; administrators can see definition usage before attempting deletion.
- [Current Area authorization is broader than intended] → Add tenant-scoped joins and regression tests for every Area route in the touched surface, returning non-disclosing 404s.
- [Annotations can crowd small Areas or dense placement layouts] → Use bounded candidates, placement/name/annotation collision geometry, stable row reduction with `+N more`, and omit when no safe minimum exists; the editor remains complete.
- [SVG and canvas text metrics can differ] → Use conservative fixed metrics and shared proportional style constants, assert semantic/normalized-anchor parity, and allow only raster antialiasing differences.
- [PNG annotation failure could yield misleading output] → Complete layout/drawing before encoding or activating a download and fail the existing export operation as a whole.
- [A helper-level annotation fixture can pass while real persisted Areas are dropped by production adapters] → Exercise an existing API-loaded project with real stored geometry, require the same persisted values in direct SVG DOM and PNG paint/pixels, and keep one normalized Area/descriptor handoff for both consumers.
- [Compound control draft state can diverge from the integer API contract] → Centralize parsing and step behavior in the reusable control, keep invalid drafts visible, block submission, and cover boundaries plus repeated keyboard/button/manual transitions.
- [SQLite schema rollback cannot safely drop an added column in all deployed versions] → Treat rollback as application rollback with additive tables/column left dormant; do not destructively down-migrate production data.
- [An incomplete Area ID map could silently omit zoning values] → Select only source-version Area rows, require every selected source Area to have a destination mapping, and roll back the complete version creation on any mismatch or insert failure.
- [Copied values could accidentally remain coupled to the source version] → Insert independent destination rows keyed by new Area IDs, retain only the shared stable parameter identity, and test edits in both directions after copying.

## Migration Plan

1. Add the new migration after the current latest migration, creating both tables, constraints, and indexes and adding `area_properties.revision DEFAULT 0`; do not seed definitions or values.
2. Run migration tests against a pre-change fixture and a fresh in-memory database, including repeated startup/idempotency through the existing migration ledger.
3. Deploy backend support before or together with the frontend. Additive response fields are ignored by old clients, and old property-only updates remain valid.
4. Roll back application code if needed while leaving additive schema dormant. Existing clients do not reference it. A later explicitly authorized cleanup migration may remove unused schema; rollback MUST NOT delete configured values.

## Open Questions

- Whether a future change should ship optional vendor-specific definition presets remains intentionally deferred. Issue #89 provides administrator configuration and seeds none, so answering this later does not alter this change's contract or implementation shape.

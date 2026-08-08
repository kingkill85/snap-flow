## Context

See `proposal.md` for motivation. SnapFlow currently edits one placement at a time. Each item placement references a placement-specific main `project_bom` entry; selected add-ons are represented by related BOM entries, and price summaries are derived from those persisted relationships. The React configurator owns active-floorplan state and refreshes placements and BOM separately. The Deno/Hono/SQLite backend already has single-placement BOM replacement behavior, but a bulk operation must preserve layout, reject stale previews, and avoid partial BOM mutation.

## Goals / Non-Goals

**Goals:**

- Establish one server-authoritative definition of an exact source configuration and affected set.
- Make preview and confirmation deterministic, authorization-aware, stale-safe, and transactionally atomic.
- Reuse catalog, BOM pricing, add-on validation, and containment semantics rather than duplicating them in the client.
- Keep the UI explicit: mode entry, source click, side-by-side preview, confirmation, recoverable errors, and authoritative refresh.
- Produce direct unit/integration coverage plus Cucumber and Playwright evidence for the visible workflow.

**Non-Goals:**

- Selecting arbitrary individual placements, ranges, areas, multiple floorplans, or an entire project in one operation.
- Changing placement geometry, rotation, floorplan, or area assignment.
- Editing catalog products, variants, add-ons, or prices.
- Adding background jobs, schema migrations, external dependencies, public ingress, deployment, or production-data operations.

## Decisions

### 1. Match an exact persisted configuration on the active floorplan

The backend will derive a canonical source signature from the selected placement’s persisted main BOM entry: item identifier, variant identifier, and a sorted normalized set of selected add-on variant identifiers. It will find all item placements on the same floorplan with the same canonical signature. It will not use only `item_id`, because that would silently replace placements with intentionally different variants or add-ons.

Alternative considered: let the browser submit arbitrary placement IDs. Rejected because it weakens the Issue’s “all of this type/configuration” behavior, makes scope tampering easier, and cannot detect newly matching placements without extra server logic.

### 2. Use server-authoritative preview and an opaque snapshot token

Add an authenticated preview operation under the placements API that accepts `floorplan_id` and `source_placement_id`. After normal project-version edit authorization, it returns source details, sorted affected placement IDs, quantity, configured unit/total pricing, and an opaque snapshot token. The token will be a server-produced digest over the floorplan, source signature, sorted set, and relevant persisted catalog/BOM values; clients treat it as opaque.

Confirmation accepts the same floorplan/source identity, snapshot token, target variant, and normalized add-on IDs. The server recomputes and compares the token before mutation. A mismatch returns HTTP 409 with a stable stale-preview error code. Authentication and project edit authorization are rechecked independently at preview and confirmation.

Alternative considered: trust the preview count or use only the source placement ID at confirmation. Rejected because concurrent edits could change the affected set after the human reviewed it.

### 3. Validate and price target configuration on the server

The preview UI may filter active project-available items and guide required add-on selection, but confirmation will resolve the target variant’s item and project item-type eligibility and validate all selected add-ons, required relationships, uniqueness, activity, and compatibility. Source and target pricing use the existing BOM/catalog pricing semantics and are returned by the server; the client only formats values.

Alternative considered: client-only validation and arithmetic. Rejected because direct API clients could bypass it and browser catalog data may be stale.

### 4. Execute a dedicated bulk domain operation in one SQLite transaction

Introduce a mass-switch service/repository boundary rather than looping over the existing HTTP endpoint. Under one `BEGIN IMMEDIATE` transaction it will:

1. re-authorize and re-resolve the current source set and snapshot;
2. validate and normalize the target configuration;
3. create a separate target BOM configuration for each affected placement, preserving the existing placement-specific BOM invariant;
4. repoint each existing placement’s `bom_id` without changing identity or geometry fields;
5. remove only superseded BOM trees that have no remaining placement references; and
6. compute the committed affected count and pricing response before commit.

All helpers used inside this boundary must share the same transaction rather than starting nested transactions. Any exception rolls back the whole operation. Existing containment/area fields remain untouched because no geometry changes.

Alternative considered: sequential calls to the existing single-placement `update-bom` endpoint. Rejected because a mid-loop failure would expose partial replacement and multiple independent refreshes.

### 5. Add explicit frontend mode and a focused modal

Place a Mass Switch button in the editable configurator controls. Mode state lives at the project dashboard/configurator boundary so canvas clicks can be intercepted without changing normal drag/edit selection. A source click calls preview and opens a dedicated modal. The modal presents source and target cards, quantity, unit/configured totals, delta, target item/variant/add-on controls, validation status, Cancel, and a clearly labeled confirmation action.

While preview or confirmation is pending, duplicate requests are disabled. Cancel clears mode and modal state. Success clears mode and performs a coordinated refresh of placements, active-floorplan BOM, and project data/totals before showing completion. If post-commit refresh fails, the UI reports that a reload is required instead of presenting stale totals as current.

Alternative considered: overload the existing single-placement edit modal. Rejected because its save action affects one placement and does not communicate set scope or price impact clearly.

### 6. Use stable error contracts and no optimistic bulk persistence

The API will distinguish invalid input (400), missing source/target (404), unauthorized/forbidden edit (401/403 according to existing middleware), stale preview (409), and unexpected transactional failure (500). Responses expose stable machine-readable codes without leaking SQL or internal paths. The client will not optimistically rewrite all placements; it waits for commit and authoritative refresh.

### 7. Test at domain, API, component, and real-browser levels

Backend tests will cover signature normalization, exact floorplan scoping, authorization, required/incompatible add-ons, snapshot conflicts, transaction rollback, BOM cleanup/reference safety, preserved geometry/area, and prices. Frontend tests will cover mode, preview rendering, control validation, cancel, duplicate-submit prevention, errors, and refresh orchestration. Cucumber features will carry OpenSpec scenario references. Playwright will exercise the real editable project flow and inspect persisted API/UI state for success, cancellation, unchanged out-of-set placements, stale conflict, and injected atomic failure where the test harness can create a bounded deterministic failure.

Playwright UI review applies because this change adds an editor-facing button, selection mode, modal, pricing preview, confirmation, and error states.

## Risks / Trade-offs

- [Large source sets hold a write transaction while BOM trees are rebuilt] → Resolve and validate before opening the transaction where safe, revalidate inside it, use batched queries, and cover a representative large set with a bounded performance test.
- [Canonical add-on signatures can diverge from BOM semantics] → Centralize normalization beside existing BOM domain logic and test ordering, duplicates, required children, and unrelated BOM children explicitly.
- [A committed operation followed by a failed client refresh can look uncertain] → Return a committed operation result, invalidate cached state, show a reload-required message, and never retry confirmation automatically.
- [Concurrent catalog or floorplan edits race preview] → Include relevant source-set/catalog values in the snapshot, acquire the SQLite write transaction before final comparison, and fail with 409.
- [Per-placement BOM entries increase write volume] → Preserve the current invariant for compatibility; do not introduce shared mutable BOM entries in this Issue.

## Migration Plan

1. Add backend domain/API behavior and tests without changing existing single-placement routes.
2. Add the frontend service, mode, modal, coordinated refresh, and component tests.
3. Add scenario traceability and real-runtime Cucumber/Playwright coverage.
4. Run strict OpenSpec validation, backend/frontend suites, E2E traceability, Cucumber/Playwright, exact-SHA CI, and independent code/test/UI review before acceptance.
5. Roll back by reverting the implementation commit(s); no data migration is required because the operation uses existing placement and BOM tables. Existing successful mass-switch results remain valid normal placement/BOM data.

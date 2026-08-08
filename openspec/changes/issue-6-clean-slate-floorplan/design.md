## Context

See `proposal.md` for motivation and `specs/floorplan-clean-slate/spec.md` for observable behavior. Placements are currently deleted one at a time through authenticated placement routes; each item placement references a BOM entry, and single deletion removes that BOM entry only when it becomes unreferenced. The configurator keeps active-floorplan placements locally and uses a version counter to refresh BOM/summary data. Floorplans and areas are separate records and must survive this operation.

The change crosses the API, database cleanup boundary, frontend service/state, and configurator UI. Existing numeric identifiers are externally supplied, and tenant/project edit authorization must be enforced server-side rather than inferred from client visibility.

## Goals / Non-Goals

**Goals:**

- Provide one idempotent, atomic server operation for an active floorplan's item placements and newly orphaned BOM rows.
- Preserve non-placement floorplan structure and all neighboring floorplan data.
- Keep client state consistent with the committed server result and make destructive intent unmistakable.
- Fail closed on malformed IDs, missing authentication, cross-tenant lookup, or non-editable project versions.

**Non-Goals:**

- Deleting the floorplan, its uploaded image, its areas, catalog products, manually retained BOM rows that were not made orphaned by this operation, or another floorplan's data.
- Providing undo, recycle-bin recovery, multi-floorplan cleanup, or a general bulk-delete API.
- Changing version lifecycle rules, tenant roles, schema, dependencies, deployment, ingress, or orchestration behavior.

## Decisions

### 1. Use one floorplan-scoped backend command

Add a specific authenticated API operation for clearing item placements from one floorplan and return `{ data: { deleted_count } }`. Place the specific route before any parameter route that could capture it, following Hono ordering rules. A single command is chosen over issuing N existing placement deletes because it gives one authorization decision, one transaction, bounded client traffic, deterministic idempotency for an empty floorplan, and no partial success surface.

Alternative considered: call the existing delete-placement endpoint once per placement. Rejected because requests can partially fail, race with local state, and repeatedly perform BOM cleanup.

### 2. Authorize through the floorplan's project before mutation

Parse and validate the external floorplan identifier, resolve the floorplan by joining through its project under the authenticated tenant context, and apply the same server-owned editability rule used for active project versions. Missing and cross-tenant targets share a not-found response; a known but non-editable target is rejected. Mutation receives only the already-authorized floorplan ID and runs inside a database transaction.

Alternative considered: trust the frontend's `canEdit` flag or use an unscoped floorplan lookup. Rejected because UI state is not an authorization boundary and an unscoped lookup risks cross-tenant destructive access.

### 3. Delete placements first, then only newly orphaned BOM trees, in one transaction

Within the transaction, capture the distinct BOM IDs referenced by item placements on the target floorplan, delete those item placement rows, and remove captured BOM roots (including dependent add-on rows and associated managed images through the established BOM cleanup path) only when no placement still references them. The query is constrained by both placement type and floorplan ID. Areas, area placements if represented separately, floorplan metadata/image, unrelated BOM rows, and all records for other floorplans are outside the delete set. Any error rolls back every database mutation.

Alternative considered: reuse whole-floorplan deletion and omit the final floorplan delete. Rejected because that path intentionally removes broader BOM data and has different invariants. Deleting all floorplan BOM rows is also rejected because BOM-only entries are not necessarily placed items.

### 4. Put confirmation in a reusable dialog and synchronize after success

Add a dedicated confirmation dialog component following repository modal conventions: floorplan name in the warning, `Cancel` with an X icon, destructive `Delete` with a Trash icon, and a pending state that disables dismissal/re-submission. Surface the Clean Slate control alongside active-floorplan/canvas controls only for editable versions, disabled when placements are empty.

The placement hook/service invokes the bulk endpoint. It does not optimistically clear placements. After success it clears active placement/add-on state, increments the placement version once, and refreshes placements, floorplan BOM, area containment/assignment state, and summary dependencies through existing callbacks. On failure it retains local placements and presents an error with retry available.

Alternative considered: embed an inline dialog in `ProjectDashboard`. Rejected because repository guidance requires reusable modal components and isolation makes dialog behavior testable.

### 5. Verify UI behavior independently with Playwright

Playwright UI review applies because the change adds an interactive destructive control and changes canvas/BOM/summary behavior. Review must independently exercise visibility/disabled state, warning text, cancellation, single submission, successful clearing with retained areas/floorplan, and failure recovery at representative viewport sizes.

## Risks / Trade-offs

- **[Shared or hierarchical BOM references are deleted too broadly]** → Capture candidates before placement deletion, delete only candidates proven unreferenced afterward, handle child rows through the established BOM cleanup invariant, and test shared/unrelated rows explicitly.
- **[Concurrent placement creation races with cleanup]** → Perform authorization-adjacent cleanup and orphan checks in one SQLite transaction; re-fetch server state after success.
- **[Client shows stale derived totals]** → Route success through the existing placement-version/BOM refresh mechanism and add assertions for canvas, BOM, area, and summary updates.
- **[Retry after an uncertain network result]** → Make an empty-floorplan cleanup a successful zero-count operation so retry converges safely.
- **[Authorization conventions are currently inconsistent across legacy routes]** → Add the narrow tenant/editability lookup required for this endpoint and tests for cross-tenant and read-only access without broad unrelated refactoring.

## Migration Plan

No data migration or dependency change is required. Deploy the backward-compatible backend endpoint and frontend control together. Rollback removes the UI/service call and endpoint; already completed cleanups are intentionally irreversible and cannot be restored by code rollback. No release or deployment is authorized by this planning change.

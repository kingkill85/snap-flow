## Context

See `proposal.md` for motivation and `specs/floorplan-clean-slate/spec.md` for the behavior contract. Current placement deletion is one row at a time through `/api/placements/:id`; each placement references a floorplan-specific parent BOM entry that can own child add-on rows. `FloorplanRepository.delete` already demonstrates the correct child-before-parent cleanup order inside `withTransaction`, while `usePlacements` owns canvas placements, placement add-on memory, and the version signal that refreshes BOMs. `ProjectDashboard` derives editability from `admin`/`tenant_admin`, renders the active floorplan, and already uses extracted dialog components.

The current generic floorplan and placement routes mostly require authentication but do not consistently enforce tenant ownership or editing roles. This new destructive endpoint must therefore perform its own fail-closed role and tenant check instead of inheriting that weakness.

## Goals / Non-Goals

**Goals:**

- Provide one server-authoritative, atomic reset for exactly one floorplan.
- Keep UI state coherent across placements, BOM totals, area containment, selection/edit state, and placement-specific add-on cache.
- Make retries, empty targets, overlapping requests, and late responses predictable.
- Reuse the existing Hono response conventions, SQLite transaction helper, React service/hook structure, and extracted shadcn dialog pattern.

**Non-Goals:**

- Deleting or replacing the floorplan image, metadata, tabs, ordering, or areas.
- Clearing project-scoped `useItemMemory` size/style/add-on preferences.
- Resetting all floorplans, a whole project, the catalog, invoices/exports, or project history.
- Adding undo, soft deletion, audit history, background jobs, optimistic deletion, schema migrations, or new dependencies.
- Broadly repairing authorization on pre-existing placement/floorplan endpoints; this endpoint is secure independently and broader hardening requires separate scope.

## Decisions

### 1. Add a dedicated floorplan subresource deletion endpoint

Use `DELETE /api/floorplans/:id/placements` and return:

```json
{
  "data": { "floorplan_id": 123, "removed_count": 4 },
  "message": "Floorplan reset successfully"
}
```

The route is defined before general `/:id` routes in accordance with the repository's Hono ordering rule. A dedicated endpoint expresses a single bulk operation, avoids N client requests and partial client-driven cleanup, and leaves both `DELETE /placements/:id` and `DELETE /floorplans/:id` unchanged. Alternatives considered were looping over existing placement deletion from the browser (non-atomic and race-prone) and `DELETE /placements?floorplan_id=` (less clearly anchored to floorplan existence and authorization).

### 2. Authorize from the floorplan's project ownership, fail closed

Parse `:id` strictly as a positive base-10 integer. Apply `authMiddleware`, reject roles other than `admin` and `tenant_admin`, then resolve the floorplan joined through its project. Global `admin` can target any tenant; `tenant_admin` lookup includes the verified token tenant so absent and cross-tenant rows share the same `404` response. Never accept tenant/project scope from query or body input. Perform all checks before entering destructive work.

This endpoint uses explicit checks rather than only `tenantAdminMiddleware`, because role authorization alone does not establish resource ownership. Returning `404` for inaccessible resources avoids a tenant-existence oracle. Invalid IDs return `400`, missing/invalid auth returns `401`, read-only roles return `403`, and internal failures return the standard non-diagnostic `500` body while details remain server-side.

### 3. Delete placements and floorplan BOM hierarchy in one synchronous transaction

Add a focused repository operation using `withTransaction`. Within the transaction:

1. Re-resolve/verify the target floorplan access boundary as needed at the service/repository seam.
2. Count `type = 'item'` placements by direct `placements.floorplan_id` for the authoritative `removed_count`.
3. Delete those item placements by `floorplan_id`.
4. Delete child `project_bom` rows for that floorplan, then parent rows for that floorplan.

The direct placement floorplan column prevents unrelated rows from being selected through malformed BOM associations; BOM cleanup remains explicitly restricted by the same floorplan ID. Child-first deletion follows current repository behavior and remains safe regardless of foreign-key cascade configuration. The transaction serializes SQLite writes, so overlapping resets converge: the first removes and counts rows, and the later transaction observes/counts zero. Any thrown database error rolls back the complete operation.

Areas are represented independently and are not deleted. Item placements are the only placement type selected; this is important because area geometry also has placement-related persistence in the current model. No files are touched.

### 4. Put orchestration in the placement hook and use authoritative refreshes

Extend the frontend placement service with the bulk reset call and the placement hook with a reset operation bound to an explicit floorplan ID. The dashboard owns confirmation visibility, target snapshot, pending/error status, and success messaging. On success it clears placement selection/edit state and placement-specific add-on entries for the reset target, invalidates the placement/BOM version, and fetches placements, BOM, and areas for that exact floorplan. Project-scoped item memory is intentionally untouched.

Do not optimistically clear placements before the server commits. On error, keep the dialog open, show the normalized API/network message, and reconcile placements/BOM/areas before re-enabling Reset. Capture `{id, name}` when opening the dialog and key all response updates by that ID. If the active tab changed while the request was pending, update only per-floorplan caches/invalidation for the target; do not write the target's placement array into the new active floorplan state. This favors correctness over the slightly faster optimistic alternative.

### 5. Use a dedicated extracted confirmation dialog

Create a reusable floorplan reset dialog component rather than an inline modal. It follows existing shadcn dialog conventions and modal button consistency: **Cancel** with `X`, destructive **Reset** with an appropriate reset/trash icon, pending text, focus trapping, Escape/dismiss behavior when idle, and disabled dismissal/destructive controls while submitting or reconciling. The copy names the snapshotted floorplan and describes both deleted and preserved content.

Place the **Clean Slate** control in the Floorplan view near the active canvas controls, not on each tab, so its target is unambiguous. It is visible only for `canEdit`, disabled for an empty loaded placement list or pending reset, and exposes accessible name/status text. This avoids overloading the existing floorplan-delete dialog, whose semantics and button label are different.

### 6. Test at contract, state, traceability, and real-runtime layers

Backend tests exercise repository atomicity/rollback and the route contract for success counts, empty/repeated/concurrent calls, malformed/missing targets, unauthenticated/read-only/cross-tenant callers, BOM hierarchy cleanup, and isolation/preservation. Frontend tests mock auth and services and verify visibility, exact warning/cancel behavior, single submission, success reconciliation, error retry, and active-floorplan switching.

A user-visible Cucumber feature maps scenarios to Issue #6 and drives Playwright against the real `npm run dev` frontend/backend runtime, proving warning copy, cancellation, successful canvas/BOM empty state without reload, and preserved floorplan/areas. API-only security/transaction edge cases remain integration tests, with traceability from tasks/spec scenarios. Playwright UI review applies because the change adds an interactive destructive control and modal.

## Risks / Trade-offs

- [Late reset response could clear a newly selected floorplan] → Snapshot the target ID and key reconciliation/invalidation to it; test tab switching during the request.
- [BOM hierarchy cleanup could leave orphan rows or remove another floorplan's data] → Filter every statement by the same floorplan ID, delete child rows first, and assert cross-floorplan isolation.
- [Two requests could report misleading counts] → Count and delete inside the same serialized transaction; specify the sum-of-counts concurrency invariant.
- [A network failure can hide whether the server committed] → Never assume failure means no commit; always refetch authoritative state before retry.
- [Current adjacent APIs have weaker tenant enforcement] → Keep this endpoint independently fail-closed and document broader authorization hardening as separate work.
- [Disabled-on-empty UI does not exercise API idempotency] → Cover empty and repeated calls directly in backend integration tests.

## Migration Plan

No database or data migration is required. After approved implementation, deploy backend and frontend together so the UI does not expose an unavailable endpoint. Rollback removes the UI control and endpoint; previously completed resets are intentionally irreversible and cannot be restored by application rollback. Normal database backup/restore procedures are outside this feature and require separate privileged authorization.

Before implementation, publish immutable artifact links at the full 40-character artifact commit SHA and obtain `/approve-spec <sha>` from the authorized human through Neo. After implementation, run OpenSpec verification and all quality/review gates. Sync/archive precede a separate merge authorization; acceptance alone does not authorize merge.

## Context

See `proposal.md` for motivation and `specs/floorplan-mass-switch/spec.md` for the behavior contract. Placements currently point to floorplan bill-of-materials entries, which carry the product, style/variant, and add-on configuration; the configurator loads placements per active floorplan and separately refreshes BOM-derived totals. The change crosses frontend configurator state, placement/BOM APIs, authorization, pricing, and transactional persistence, so an explicit design is required.

## Goals / Non-Goals

**Goals:**

- Reuse the existing placement/BOM and catalog models without duplicating configuration data on each placement.
- Give confirmation a server-authoritative source set and pricing snapshot, then fail closed if that snapshot becomes stale.
- Preserve canvas-specific placement state while changing only its BOM/configuration association.
- Keep the frontend responsive and synchronize all BOM and pricing consumers after a successful batch.

**Non-Goals:**

- Cross-floorplan, cross-project, rule-based, scheduled, or undo/history-driven replacement.
- Catalog creation or editing from the mass-switch dialog.
- Changing placement geometry, area membership, or unrelated BOM entries.
- Infrastructure, ingress, deployment, merge, secret/access, or destructive production work.

## Decisions

### 1. Use preview and confirm operations with optimistic consistency

Add floorplan-scoped preview and confirmation operations rather than issuing one existing placement update per match. Preview resolves the authenticated floorplan, normalizes the selected source configuration, finds the exact matching placement IDs, validates the target configuration, calculates current prices, and returns an opaque consistency value derived from the relevant current state. Confirmation resubmits the requested source and target plus that value; the server recomputes authorization, ownership, matching IDs, target compatibility, and pricing inside the mutation boundary and rejects any mismatch.

This prevents a client-supplied quantity or stale list from defining the mutation set and avoids partial results from a sequence of client calls. A single blind batch endpoint was rejected because it cannot support a trustworthy preview; client-only matching was rejected because placement and catalog state can change concurrently.

### 2. Match the complete normalized BOM configuration

The source identity is product plus style/variant plus an order-independent, duplicate-free add-on ID set. Matching occurs only among item placements belonging to the active floorplan. This aligns the user's selected placement details with the affected count and prevents a switch from unintentionally sweeping variants or add-on combinations that merely share a product.

Product-only matching was rejected because Issue #13 explicitly asks to show variant and add-on details and would make the confirmation scope ambiguous. User-selected placement checkboxes are deferred because they would define a different partial-selection capability.

### 3. Reassociate placements within one database transaction

Confirmation resolves or creates the canonical floorplan BOM entry for the validated replacement configuration, moves every matched placement to it, and removes an unreferenced source BOM entry only through existing safe BOM lifecycle rules. The transaction preserves placement rows and their geometry/rotation/area-related state, then returns the refreshed placements and affected BOM/pricing data or enough identifiers for the existing refresh paths.

Deleting and recreating placements was rejected because it risks changing identity, layout metadata, and downstream references. Per-placement transactions were rejected because they expose partial success.

### 4. Keep Mass Switch as a dedicated interaction mode and extracted dialog

The configurator exposes a clearly labeled Mass Switch control. While active, the next eligible item-placement click opens a reusable `MassSwitchModal`; area selections and empty-canvas clicks do not start a switch. The modal owns replacement product/style/add-on selection, server preview loading, side-by-side comparison, stale/error feedback, cancel, and explicit confirmation. Success exits the mode and refreshes placements, BOM counts, and proposal totals.

An inline page modal was rejected by repository UI rules. Reusing normal edit mode was rejected because the batch scope and price impact need a distinct, explicit confirmation affordance.

### 5. Enforce fail-closed boundaries at the server

Every externally supplied floorplan, placement, product, variant/style, add-on, quantity, and consistency value is untrusted. Existing authentication and project authorization run before protected data is returned. The server verifies ownership relationships, active catalog state, target compatibility, normalized add-ons, current source membership, and price inputs; unexpected, stale, or malformed data produces no mutation. Responses use the repository's standard success/error envelope and do not disclose inaccessible project data.

Client validation remains for usability but is never authoritative. Adding a new public service or external dependency was rejected because existing authenticated APIs and SQLite transaction boundaries cover the requirement.

### 6. Require independent UI verification

Playwright review applies because this change adds a configurator mode, modal selection flow, price comparison, confirmation, and visible post-success refresh. Independent review must exercise selection, exact-match quantity, invalid replacement handling, stale confirmation, cancel, successful preservation of layout, and refreshed totals.

## Risks / Trade-offs

- [Concurrent placement or catalog edits can invalidate a preview] → Recompute inside confirmation and return a specific stale-preview response that keeps the modal open for refresh.
- [Add-on ordering or duplication could create false mismatches] → Normalize to a sorted unique set on both preview and confirmation and compare server-side.
- [A replacement BOM entry may already exist] → Reuse canonical BOM repository behavior inside the transaction and test both reuse and creation paths.
- [Large floorplans can make matching and refresh expensive] → Scope indexed queries to one floorplan, mutate as a set, and return bounded affected data rather than refreshing unrelated projects.
- [Pricing displayed by the client can drift from persisted rules] → Use server-calculated preview values and invalidate confirmation when applicable pricing state changes.
- [Mode-specific clicks can conflict with drag/edit behavior] → Give Mass Switch mode precedence for item clicks and cover mode entry/exit and drag suppression in UI tests.

## Migration Plan

1. Add the authenticated preview and transactional confirmation behavior without changing existing placement contracts.
2. Add the frontend service, dedicated mode, extracted modal, and synchronized refresh behavior behind the new UI entry point.
3. Run strict OpenSpec validation, focused RED/GREEN suites, full relevant lint/tests, independent code/test review, and independent Playwright review before acceptance.
4. Roll back by removing the new UI entry point and endpoints; no schema migration is expected, and failed confirmations leave existing placements unchanged.

## 1. Approval and Traceability Baseline

- [ ] 1.1 Stop before product-code changes until the authorized human's `/approve-spec <full-commit-sha>` is relayed through Neo for this exact artifact commit; if any material artifact changes, publish new immutable full-SHA links and obtain renewed approval.
- [ ] 1.2 Create an Issue #89 scenario traceability matrix covering every scenario in both delta specs and assign each to backend, frontend, real-runtime Cucumber/Playwright, or a justified independent-review assertion before writing implementation tests.

## 2. Migration and Persistence RED/GREEN

- [ ] 2.1 RED: add migration tests for a fresh database and an existing pre-zoning database, asserting normalized definition/value schema, constraints, indexes, initial Area revision, no seed rows, preserved existing data, and repeat-startup behavior.
- [ ] 2.2 GREEN: add the next sequential migration for `item_type_zoning_parameters`, `area_zoning_values`, and `area_properties.revision`; make the migration tests pass without destructive rollback behavior.
- [ ] 2.3 RED: add repository tests for stable identity, scoped name uniqueness, deterministic ordering, atomic complete-set reorder, rename preservation, deactivate/reactivate retention, referenced-delete conflict, Area value bounds/zero clearing, applicability, batched aggregation, and revision conflicts.
- [ ] 2.4 GREEN: add backend models and focused repositories/queries for parameter definitions, applicable grouped Area values, safe lifecycle operations, and transactional zoning-aware Area updates until the repository tests pass.

## 3. Backend API and Security RED/GREEN

- [ ] 3.1 RED: add Product Type parameter route tests for strict validation, parent/child identity checks, active/inactive listing, admin-only mutation, atomic reorder, safe deletion, structured errors, and specific-route ordering.
- [ ] 3.2 GREEN: implement the nested Product Type zoning-parameter routes and schemas using existing auth/admin middleware and make the focused route tests pass.
- [ ] 3.3 RED: add Area route tests for grouped applicability through `project_item_types`, categories having no effect, additive backward-compatible responses, atomic property/value updates, invalid values, changed-definition and stale-revision 409 responses, and retained values across Product Type/definition/project deactivation.
- [ ] 3.4 RED: add authorization regression tests for unauthenticated and cross-tenant list/detail/create/update/vertex/delete Area access, including non-disclosing 404 behavior and zero mutations.
- [ ] 3.5 GREEN: tenant-scope all touched Area routes through floorplan → project, extend strict request/response schemas and services, and make the focused Area behavior/security tests pass without breaking property-only clients.
- [ ] 3.6 RED: add repository and Create Version route tests covering multiple floorplans/Areas, mixed positive and omitted values, source-to-new Area ID remapping, unchanged stable parameter IDs, no cloned definitions, no duplicates/orphans/cross-version links, bidirectional post-copy isolation, existing tenant/source authorization, and injected zoning-copy failure with complete database rollback.
- [ ] 3.7 GREEN: extend the existing transactional project-version copy to select zoning rows only for copied source Areas, require a destination Area mapping, insert independent rows using new Area IDs and unchanged parameter IDs, and make the focused repository/route tests pass without adding an endpoint or UI control.

## 4. Product Type Configuration UI RED/GREEN

- [ ] 4.1 RED: add service and component tests for loading an expanded Product Type parameter subtable; create/edit validation; ordered rows; accessible activate/deactivate/reorder controls; safe delete confirmation; and surfaced 403/409/validation errors.
- [ ] 4.2 GREEN: extend frontend types/services and Product Type management with the expandable subtable plus extracted reusable create/edit and delete-confirmation modals following existing action-button/modal conventions until focused tests pass.

## 5. Area Editor RED/GREEN

- [ ] 5.1 RED: add Area service/hook tests for revision/group deserialization, full applicable-set save payloads, successful state replacement, zero clearing, retained drafts on errors, and explicit 409 reload recovery.
- [ ] 5.2 RED: add `AreaEditModal` and reusable-control component tests for unchanged no-parameter behavior; compact desktop layout with one and multiple ordered Product Type headings; dense aligned decrement/value/increment/label rows; parameter-specific button names and field labels/descriptions; ordinary tab order, visible focus, 32-by-32-pixel minimum button targets, direct digit entry, ArrowUp/ArrowDown and button step-1 behavior, boundary clamping/disabled states, temporary blank-as-zero, rejection and retained drafts for fractional/negative/non-digit/non-finite/out-of-range input with zero mutation calls, no duplicate native spinner, phone-width stacking/internal overflow/reachable footer actions, Cancel/Escape discard, save/reopen persistence, and error recovery.
- [ ] 5.3 GREEN: build one reusable compact compound number control from the existing application `Button`, `Input`, `Label`, and icon primitives, use a non-spinner numeric-entry field, and integrate it into the responsive zoning pane while preserving atomic save and reload-required conflict handling until service, hook, and component tests pass; add no external InputNumber dependency.

## 6. Shared Interactive and PNG Annotation RED/GREEN

- [ ] 6.1 RED: add pure annotation-model tests for generic Product Type grouping/order, positive-only and empty-state semantics, fixed candidate priority, stable Area ordering, name/annotation/product collision avoidance, nearby placements, row reduction and `+N more`, varied-background contrast tokens, normalized geometry, supported-scale transforms, and deterministic repeated output.
- [ ] 6.2 GREEN: implement the shared immutable annotation descriptor/layout module, feed it complete visible placement and prior-annotation geometry from `ConfiguratorCanvas`, and render direct dual-contrast non-interactive SVG text in `AreaPolygon` without an opaque panel.
- [ ] 6.3 RED: extend `floorplan-export` tests to require the same descriptor text/order/omission/anchor/style at natural raster scale, exclude hidden/empty Areas, preserve placement collision, reject layout/drawing failure before download, and prove the interactive/export consumers cannot use divergent presentation constants.
- [ ] 6.4 GREEN: draw shared zoning descriptors in the existing PNG canvas export with proportional typography/outline/spacing and fail the complete export before encoding/link activation on annotation failure; add no endpoint or export control.
- [ ] 6.5 Run focused accessibility and representative performance tests for full-text exposure, non-color meaning, pointer pass-through, many Areas/placements, bounded candidates, and absence of DOM measurement, background sampling, or backend query growth.
- [ ] 6.6 RED: capture the demonstrated existing-project failure through the actual API-shaped Area state and real stored placement/vertex geometry: persisted positive values visible in Edit Area MUST flow through the dashboard/configurator adapters to direct `area-zoning-annotation` SVG rows and through the same descriptor handoff to PNG paint/pixels. Preserve a failing test at the pre-revision implementation head; direct calls to the annotation helper with synthetic Areas do not satisfy this task.
- [ ] 6.7 GREEN: normalize the production Area data, geometry, identity, and visibility inputs once, make interactive SVG and existing PNG export consume that same Area collection and descriptors, and make the existing-project adapter integration test pass without weakening positive-only, grouping, collision, bounds, contrast, or fail-closed export behavior.

## 7. Real-Runtime Acceptance RED/GREEN

- [ ] 7.1 RED: add Issue #89-tagged Cucumber/Playwright scenarios that fail against the pre-revision real runtime for compact one- and multi-Product-Type compound controls; explicit parameter-named decrement/increment actions; direct entry and ArrowUp/ArrowDown; boundary disabled states; invalid draft validation with no mutation; visible focus, usable painted target sizes, no native spinner duplication, phone overflow, save/reopen persistence, positive-only/empty annotations, varied-background contrast, nearby-product non-obstruction, deterministic overflow, and interactive pointer behavior.
- [ ] 7.2 RED: add a real-runtime existing-project scenario that loads persisted positive values and real stored Area geometry through the normal API/configurator path, proves those exact values are directly painted in interactive SVG DOM, invokes the existing export with the same state, and inspects PNG paint plus decoded pixels for the same grouped annotation. Retain semantic/normalized-layout parity and fail-closed no-download coverage; synthetic descriptor injection, hidden titles, or a download event alone are insufficient.
- [ ] 7.3 GREEN: run the real backend/frontend and make the editor, interactive annotation, and inspected PNG scenarios pass without mocks; update the traceability matrix with exact scenario/test references and justified assertions.
- [ ] 7.4 RED: retain the Issue #89-tagged real-runtime Create Version scenario requiring exact copied values on remapped Areas and bidirectional source/destination edit isolation.
- [ ] 7.5 GREEN: keep Create Version zoning preservation passing against the spawned real backend/frontend, with destination Area IDs distinct and parameter IDs stable; no new endpoint or Create Version UI control.

## 8. Verification and Independent Review

- [ ] 8.1 Run focused changed-scope Deno and Vitest tests throughout each RED/GREEN cycle, then run `cd backend && deno lint` and `cd backend && deno task test`; fix every introduced failure.
- [ ] 8.2 Run `cd frontend && npm run lint`, `cd frontend && npm run test:run`, and `cd frontend && npm run build`; fix every introduced failure.
- [ ] 8.3 Run `npm run typecheck:e2e`, `npm run e2e:traceability`, `npm run e2e:unit`, and `npm run e2e` against the real runtime; preserve reports and fix every introduced failure.
- [ ] 8.4 Run `npm exec -- openspec validate issue-89-generic-zoning-parameters --type change --strict --no-interactive`, `npm exec -- openspec doctor --json`, and the `openspec-verify-change` workflow; resolve every finding.
- [ ] 8.5 Obtain independent code review and independent test/traceability review, resolve findings, and rerun every affected gate.
- [ ] 8.6 Obtain an independent Playwright UI review at representative desktop and narrow viewport sizes covering the compact compound control's explicit buttons, direct/keyboard entry, focus, accessible names, bounds/disabled/error states, target size and lack of native spinner duplication; varied floorplan backgrounds; annotation readability/collision/overflow/zoom; the existing-project persisted-data path; drag/select regression; and inspected PNG parity. Resolve findings and rerun affected gates.
- [ ] 8.7 Confirm the final diff remains within Issue #89, contains no automatic BOQ/module-selection behavior or vendor seed data, and records any baseline failure only under the repository's documented clean-main comparison and explicit human-exception process.

## 9. Governed Handoff

- [ ] 9.1 Publish final evidence using immutable blob links pinned to the implementation's full 40-character commit SHA and request `/accept`; do not treat acceptance as merge authorization.
- [ ] 9.2 After acceptance, sync delta specs and archive this OpenSpec change, publish the resulting full-SHA evidence, and stop for the separate authorized-human `/merge` decision relayed through Neo; do not merge, release, deploy, change secrets/access, or perform destructive production operations without that explicit authority.

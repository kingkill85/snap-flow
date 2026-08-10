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
- [ ] 5.2 RED: add `AreaEditModal` component tests for unchanged no-parameter behavior, desktop two-column and narrow stacked layouts, ordered expanded Product Type sections, persistent labels, keyboard-accessible steppers/direct entry, bounds, validation, one action pair, Cancel/Escape discard, and focus/error behavior.
- [ ] 5.3 GREEN: extend Area types/state and implement the responsive stacked-section editor with atomic save and reload-required conflict handling until the service, hook, and component tests pass.

## 6. Floorplan Summary RED/GREEN

- [ ] 6.1 RED: add `AreaPolygon` tests for Product Type grouping/order, positive-only rows, empty-group and empty-summary omission, current renamed labels, bounded long-name/row overflow with accessible full text and `+N more`, zoom-stable sizing, and pointer-event pass-through.
- [ ] 6.2 GREEN: implement the bounded inverse-scale SVG zoning summary adjacent to the existing Area name label and make the focused rendering/interaction tests pass.

## 7. Real-Runtime Acceptance RED/GREEN

- [ ] 7.1 RED: add Issue #89-tagged Cucumber features and Playwright steps that fail against the pre-change real runtime for administrator definition configuration, one- and multi-Product-Type applicability, accessible desktop/narrow editing, direct/stepper entry, Cancel, persistence after reload, positive-only grouped summaries, overflow, deactivation/reactivation retention, stale-definition/revision recovery, authorization, and representative validation errors.
- [ ] 7.2 GREEN: run the real backend/frontend and make those Cucumber/Playwright scenarios pass without mocks; update the traceability matrix with exact scenario/test references and record any justified non-automated assertions.
- [ ] 7.3 RED: add an Issue #89-tagged real-runtime Cucumber/Playwright scenario that configures and saves representative zoning values, uses the existing Create Version browser flow, and fails unless the new version exposes the exact copied values on remapped Areas while source and destination remain independently editable.
- [ ] 7.4 GREEN: make the Create Version zoning-preservation scenario pass against the spawned real backend/frontend, verify persisted destination Area IDs differ from source Area IDs while parameter IDs remain stable, and update the traceability matrix with the exact scenario and backend repository/route evidence. No frontend behavior change is expected beyond exercising the existing Create Version flow.

## 8. Verification and Independent Review

- [ ] 8.1 Run focused changed-scope Deno and Vitest tests throughout each RED/GREEN cycle, then run `cd backend && deno lint` and `cd backend && deno task test`; fix every introduced failure.
- [ ] 8.2 Run `cd frontend && npm run lint`, `cd frontend && npm run test:run`, and `cd frontend && npm run build`; fix every introduced failure.
- [ ] 8.3 Run `npm run typecheck:e2e`, `npm run e2e:traceability`, `npm run e2e:unit`, and `npm run e2e` against the real runtime; preserve reports and fix every introduced failure.
- [ ] 8.4 Run `npm exec -- openspec validate issue-89-generic-zoning-parameters --type change --strict --no-interactive`, `npm exec -- openspec doctor --json`, and the `openspec-verify-change` workflow; resolve every finding.
- [ ] 8.5 Obtain independent code review and independent test/traceability review, resolve findings, and rerun every affected gate.
- [ ] 8.6 Obtain an independent Playwright UI review at representative desktop and narrow viewport sizes covering Product Type configuration, Area editing accessibility/responsiveness, summary readability/overflow, zoom, and drag/select regression; resolve findings and rerun affected automated and review gates.
- [ ] 8.7 Confirm the final diff remains within Issue #89, contains no automatic BOQ/module-selection behavior or vendor seed data, and records any baseline failure only under the repository's documented clean-main comparison and explicit human-exception process.

## 9. Governed Handoff

- [ ] 9.1 Publish final evidence using immutable blob links pinned to the implementation's full 40-character commit SHA and request `/accept`; do not treat acceptance as merge authorization.
- [ ] 9.2 After acceptance, sync delta specs and archive this OpenSpec change, publish the resulting full-SHA evidence, and stop for the separate authorized-human `/merge` decision relayed through Neo; do not merge, release, deploy, change secrets/access, or perform destructive production operations without that explicit authority.

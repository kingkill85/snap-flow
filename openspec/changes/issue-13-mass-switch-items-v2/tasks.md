## 1. Backend preview contract (RED → GREEN)

- [ ] 1.1 Add failing repository/domain tests for canonical item/variant/add-on signatures, sorted affected placement IDs, exact active-floorplan scoping, exclusion of areas and non-matching configurations, and source pricing.
- [ ] 1.2 Implement shared canonical configuration resolution and batched source-set queries until the focused repository/domain tests pass.
- [ ] 1.3 Add failing route tests for preview authentication, editable-project authorization, missing/invalid sources, stable response fields, configured totals, and opaque snapshot generation.
- [ ] 1.4 Implement the authenticated mass-switch preview endpoint and stable error contract until route tests pass.

## 2. Atomic confirmation contract (RED → GREEN)

- [ ] 2.1 Add failing domain/integration tests for active project-available target variants, normalized unique add-ons, required/compatible add-ons, inactive/inaccessible targets, and identical-source no-op rejection.
- [ ] 2.2 Implement server-authoritative target validation and existing-BOM pricing reuse until the focused tests pass.
- [ ] 2.3 Add failing transaction tests proving all-or-nothing replacement, preserved placement identity/floorplan/coordinates/dimensions/rotation/area, per-placement BOM ownership, safe unreferenced cleanup, and protection of referenced/unrelated BOM entries.
- [ ] 2.4 Implement the dedicated bulk BOM replacement transaction and committed result until transaction tests pass, without looping through HTTP handlers or opening nested transactions.
- [ ] 2.5 Add failing route/integration tests for re-authorization, stale source-set and catalog snapshots, HTTP 409 conflict semantics, duplicate submission behavior, rollback after deterministic injected failure, affected quantity, and committed pricing.
- [ ] 2.6 Implement confirmation-time snapshot revalidation, stable response/error codes, and the authenticated confirmation endpoint until all focused backend tests pass.

## 3. Frontend workflow (RED → GREEN)

- [ ] 3.1 Add failing service and component tests for edit-only availability, Mass Switch mode entry/exit, item-only source selection, preview request/response handling, and read-only suppression.
- [ ] 3.2 Implement the frontend service types, dashboard-owned mode state, editable control, and canvas source-selection callback until focused tests pass without altering normal drag/edit behavior.
- [ ] 3.3 Add failing modal tests for side-by-side source/target details, quantity, configured unit/total prices, delta, active project item/variant choices, required/compatible add-ons, identical-target rejection, and cancellation without mutation.
- [ ] 3.4 Implement the focused Mass Switch modal and validation guidance until its component tests pass.
- [ ] 3.5 Add failing orchestration tests for disabled duplicate confirmation, success refresh of placements/BOM/project totals, stale-conflict recovery, generic failure, and committed-but-refresh-failed reload guidance.
- [ ] 3.6 Implement confirmation orchestration with no optimistic bulk mutation, authoritative coordinated refresh, accessible pending/error/success states, and clean mode reset until focused tests pass.

## 4. Scenario traceability and real-runtime evidence

- [ ] 4.1 Add Cucumber/Gherkin scenarios with OpenSpec scenario references for every user-visible capability scenario, including cancellation, exact-set scoping, valid success, invalid targets, stale conflicts, atomic rollback, unchanged out-of-set placements, and refresh failure semantics.
- [ ] 4.2 Add or extend deterministic E2E fixtures/helpers for editable projects, multiple floorplans, same-item differing configurations, prices/add-ons, concurrency changes, and a bounded atomic-failure injection that cannot affect production behavior.
- [ ] 4.3 Add Playwright steps/assertions against the real development runtime for success, cancellation, unchanged out-of-set placements, stale conflict, atomic failure, refreshed canvas/BOM/totals, keyboard/focus behavior, and responsive modal layout.
- [ ] 4.4 Run scenario traceability validation, E2E typecheck/unit support tests, Cucumber/Playwright, and capture exact implementation-SHA UI evidence.

## 5. Verification and governed review

- [ ] 5.1 Run strict OpenSpec validation and verify approved proposal, design, delta specification, and task files remain byte-identical to the approved specification SHA.
- [ ] 5.2 Run focused backend/frontend tests, full backend Deno tests, frontend Vitest/build/lint, and all applicable E2E commands; document any reproducible clean-main baseline exception without calling it green.
- [ ] 5.3 Commit and push the implementation, verify required GitHub CI checks completed for that exact implementation SHA, and record immutable test/evidence links.
- [ ] 5.4 Launch fresh independent read-only code, test, and Playwright/UI reviewers against the exact implementation SHA; bundle all findings back to the sole resumable Codex implementation session.
- [ ] 5.5 Repeat bounded correction, relevant tests, exact-SHA CI, and fresh re-review until clean or block with a concrete unresolved cause; do not edit approved OpenSpec artifacts to record progress.
- [ ] 5.6 Publish the exact `/accept <full-implementation-sha>` gate only after all required evidence and independent reviews are clean; keep acceptance, OpenSpec sync/archive/final CI, and separate `/merge` authorization distinct.

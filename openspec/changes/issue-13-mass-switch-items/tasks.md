## 1. Approval and implementation preflight

- [ ] 1.1 Record the authorized human approver's exact `/approve-spec <full-sha>` for this material planning revision through Neo before editing product behavior
- [ ] 1.2 Re-read the approved proposal, design, delta spec, tasks, live Issue #13 command/labels, and Draft PR; verify the approval SHA matches the immutable artifact links and move the phase from `needs-approval` to `in-progress`
- [ ] 1.3 Inspect current placement/BOM transaction, catalog compatibility, pricing, authorization, and configurator interaction paths; document any discovered material conflict by stopping, restoring `needs-approval`, and publishing a revised full-SHA packet

## 2. Backend preview behavior — strict RED/GREEN

- [ ] 2.1 RED: add focused backend tests for authenticated floorplan-scoped exact matching by product/style/add-on set, exclusion of other configurations/floorplans/areas, normalized add-on ordering, authoritative quantity/pricing, compatible active targets, and fail-closed ownership/input validation
- [ ] 2.2 GREEN: implement the minimum floorplan mass-switch preview route/service/repository behavior and typed response needed to pass the new tests, using standard API envelopes and existing pricing rules
- [ ] 2.3 REFACTOR: consolidate configuration normalization and lookup without weakening the focused preview tests; verify the backend formatter/linter for changed files

## 3. Backend confirmation behavior — strict RED/GREEN

- [ ] 3.1 RED: add focused backend tests for explicit confirmation, stale/tampered preview rejection, atomic rollback, canonical replacement BOM reuse/creation, preservation of placement identity and geometry/rotation/area state, cleanup rules, replaced quantity, and nonmatching data isolation
- [ ] 3.2 GREEN: implement the minimum transactional confirmation behavior needed to pass the tests, recomputing authorization, ownership, source membership, target compatibility, and pricing inside the mutation boundary
- [ ] 3.3 REFACTOR: keep batch persistence set-based and bounded, remove duplication with existing placement/BOM lifecycle code, and rerun all focused backend mass-switch tests

## 4. Frontend workflow — strict RED/GREEN

- [ ] 4.1 RED: add service and component tests for typed preview/confirm calls, Mass Switch mode entry/exit, eligible placement selection, drag/edit suppression, exact-match details, replacement product/style/add-on selection, loading/error/stale states, price difference, cancel, confirm, and post-success refresh
- [ ] 4.2 GREEN: implement the minimum frontend service/types, dedicated configurator control/state, and extracted reusable `MassSwitchModal` needed to pass the tests and repository modal conventions
- [ ] 4.3 GREEN: connect successful confirmation to refreshed placements, BOM counts, and proposal pricing without a page reload while preserving existing canvas layout state
- [ ] 4.4 REFACTOR: simplify configurator integration, accessibility labels, keyboard/focus behavior, and responsive side-by-side presentation without weakening the focused frontend tests

## 5. Verification and independent review

- [ ] 5.1 Run `OPENSPEC_TELEMETRY=0 npm exec -- openspec verify issue-13-mass-switch-items --strict` and resolve every finding without materially changing approved artifacts; if material change is required, stop and obtain a new approval SHA
- [ ] 5.2 Run backend `deno lint`, focused mass-switch tests, and full `deno task test`; record exact commands and results, treating any baseline failure only under the repository's documented clean-main exception gate
- [ ] 5.3 Run frontend `npm run lint`, focused mass-switch tests, full `npm run test:run`, and `npm run build`; record exact commands and results
- [ ] 5.4 Obtain independent code and security/correctness review of authorization, untrusted input, optimistic consistency, transactionality, BOM lifecycle, pricing, and bounded queries; resolve findings and repeat affected tests
- [ ] 5.5 Obtain independent test review for scenario coverage, assertions, concurrency/staleness, rollback, and regression risk; resolve findings and repeat affected suites
- [ ] 5.6 Obtain independent Playwright UI review covering mode entry, exact-match scope, replacement selection, invalid/stale/cancel paths, side-by-side prices, confirmation, layout preservation, refreshed totals, accessibility, and responsive behavior; resolve findings and repeat affected gates

## 6. Acceptance and post-acceptance lifecycle

- [ ] 6.1 Publish full-SHA implementation and review evidence in the Draft PR and the single automated Issue comment containing the exact standalone `<!-- neo-dev -->` marker, select `ready-for-review`, and request the separate authorized `/accept`
- [ ] 6.2 After `/accept`, sync the `floorplan-mass-switch` delta to the main specs, strictly verify and archive the OpenSpec change, commit/push the archive evidence, and return to `needs-approval`
- [ ] 6.3 Publish final immutable full-SHA links and request the separate authorized `/merge`; do not merge, release, deploy, alter secrets/access, or perform destructive production operations without that explicit decision relayed through Neo

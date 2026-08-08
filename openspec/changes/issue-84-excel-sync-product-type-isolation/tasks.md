## 1. Approval and Reproduction Evidence

- [x] 1.1 Verify the authorized human approver's Neo-relayed `/approve-spec <full-commit-sha>` matches the current material planning revision before any implementation edit; if artifacts change materially, stop, republish immutable links, and obtain approval for the new SHA
- [x] 1.2 RED: on one exact pre-fix revision, run the focused regression with no `.env`, with explicit test variables, and with CI-equivalent configuration; record current directory, selected database target, generated type IDs, candidate rows, and the protected product's failing active-state assertion
- [x] 1.3 Establish and document the root cause from the reproduction matrix, including environment loading, database singleton/injection timing, persistent state, query scope, and test-order checks; stop for renewed spec approval if the evidence requires a material approach or task change

## 2. Product-Type Mutation Boundary

- [x] 2.1 RED: add focused repository/service tests proving an ID-only or stale candidate cannot deactivate a product outside the selected type, while a missing active product inside the selected type is deactivated and counted
- [x] 2.2 GREEN: implement the smallest atomic type-constrained deactivation boundary and update synchronization accounting to report only rows actually changed
- [x] 2.3 RED/GREEN: cover imported selected-type activation, protected cross-type products in a shared category, and category deactivation only when no active product of any type remains
- [x] 2.4 RED/GREEN: validate invalid or missing selected types and malformed/untrusted workbook input fail closed without broadening mutation scope

## 3. Deterministic Backend Test Environment

- [x] 3.1 RED: add a tracked test-bootstrap regression that detects filesystem/developer database leakage, singleton initialization before test injection, identifier/reset nondeterminism, or dependence on an untracked `.env`
- [x] 3.2 GREEN: make backend test database selection, initialization, migration, reset, and injection explicit and deterministic for focused and full-suite runs
- [x] 3.3 Update the GitHub backend job to use the same tracked test setup and explicit required environment values without creating an untracked `.env` that changes database semantics
- [x] 3.4 Run the focused synchronization regression in both isolated no-`.env` and CI-equivalent modes on the same SHA and record equivalent passing outcomes

## 4. Verification and Reviews

- [x] 4.1 Run `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-84-excel-sync-product-type-isolation --strict` and the OpenSpec verify workflow; resolve every finding
- [x] 4.2 Run backend formatting/lint, focused database and Excel-sync tests, and `cd backend && deno task test`; run frontend lint and `npm run test:run` as repository gates, documenting any failure only after the identical failure reproduces in a fresh detached `origin/main` worktree under the repository baseline-exception rule
- [ ] 4.3 Push the exact candidate SHA and verify the GitHub backend check and all required exact-SHA CI gates pass on that same revision
- [ ] 4.4 Obtain independent production-code/security review and independent regression-test/governance review on the exact candidate SHA; resolve findings and repeat every affected gate
- [ ] 4.5 Record that independent Playwright UI review is not applicable because the change has no UI behavior, while still completing any repository-mandated Cucumber/Playwright exact-SHA check
- [ ] 4.6 Publish final exact-SHA evidence in the Draft PR and request `/accept`; do not infer merge, release, deployment, secret/access, destructive-operation, or other privileged authorization from acceptance

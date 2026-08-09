## 1. Approval and Root-Cause Evidence

- [ ] 1.1 Before any implementation edit, verify the authorized OWNER's new `/approve-spec <full-40-character-sha>` exactly matches the current immutable proposal, spec, design, and tasks revision; stop and republish for approval if any approval-bound byte changes
- [ ] 1.2 RED: on one exact pre-fix revision, run the focused Excel-sync regression with no `.env`, explicit tracked test variables, and the current CI-equivalent configuration; capture working directory, resolved database target, initialization order, generated type IDs, selected candidate rows, actual mutation rows, and protected-product state
- [ ] 1.3 Establish and document the root cause by checking environment loading, database singleton/injection timing, persistent filesystem state, query scope, and test order; return to specification approval if evidence materially changes requirements, design, or tasks

## 2. Product-Type Mutation Boundary

- [ ] 2.1 RED: add repository/service regressions proving a selected-type missing product is deactivated and counted while a stale or cross-type candidate cannot deactivate a protected product
- [ ] 2.2 GREEN: implement the smallest atomic persistence mutation constrained by the validated selected `type_id` and make synchronization accounting reflect rows actually changed
- [ ] 2.3 RED/GREEN: cover selected-type reactivation/preservation, protected products sharing a category, and category deactivation only after no active product of any type remains
- [ ] 2.4 RED/GREEN: cover missing/invalid selected types and unreadable or invalid workbook input, proving failure rolls back and never broadens destructive scope

## 3. Deterministic Backend Test Runtime

- [ ] 3.1 RED: add tracked database/bootstrap regressions that detect untracked `.env` dependence, non-test database leakage, pre-injection singleton binding, test-order coupling, and incomplete reset state
- [ ] 3.2 GREEN: make test database selection, initialization, migration, reset, and repository resolution explicit and deterministic for focused and complete backend runs
- [ ] 3.3 Update the GitHub backend job to use the same tracked test lifecycle without generating an untracked `.env`; keep unrelated required environment values explicit
- [ ] 3.4 Run the focused regression in clean no-`.env` and CI-equivalent modes on the same SHA and record equivalent product, category, count, and database-target outcomes

## 4. Verification and Governed Review

- [ ] 4.1 Run `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-84-excel-sync-runtime-parity --strict` plus repository OpenSpec verification/traceability checks and resolve every finding
- [ ] 4.2 Run backend format/lint where configured, focused database and Excel-sync tests, and `cd backend && deno task test`; compare any claimed baseline exception with the identical command in a fresh detached `origin/main` worktree
- [ ] 4.3 Review scenario applicability: add traceable Cucumber real-runtime evidence for changed user-visible behavior where applicable, or record a concrete reviewed non-applicability reason; dedicated Playwright UI review is not applicable without UI changes, but the repository Cucumber/Playwright exact-SHA gate remains required
- [ ] 4.4 Push the exact implementation SHA and verify every required GitHub check, including backend and repository Cucumber/Playwright jobs, completed successfully on that exact SHA
- [ ] 4.5 Launch fresh independent code/security and regression-test/spec reviewers against the exact implementation SHA; bundle all findings into the sole resumable Codex implementation session and repeat fixes, affected tests, exact-SHA CI, and fresh review until clean (maximum three correction cycles)
- [ ] 4.6 Publish root-cause, focused/full-suite, exact-SHA CI, and independent-review evidence in the Draft PR; request `/accept <implementation-sha>` without implying merge, release, deployment, secret/access, or destructive authorization

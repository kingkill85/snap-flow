## Context

See `proposal.md` for motivation and `specs/excel-sync-runtime-parity/spec.md` for the behavior contract. At the reported revision, GitHub Actions creates `backend/.env` with `DATABASE_URL=:memory:` while the isolated reviewer has no `.env`; the same regression passes in CI and fails in isolation. Backend tests call test-database setup, but environment loading, the SQLite singleton, repository resolution, persistent files, or test order can still alter the active connection or candidate rows. The service currently requests existing products with a `type_id` filter before deactivating by product ID, so the visible service filter alone does not prove the actual failing boundary.

The change crosses synchronization, repositories/database initialization, test bootstrap, and CI. Workbook data and the selected type remain untrusted inputs. No frontend behavior changes, so a dedicated Playwright UI review is not applicable; repository-mandated Cucumber/Playwright exact-SHA CI remains applicable.

## Goals / Non-Goals

**Goals:**

- Reproduce the divergence with a controlled same-revision matrix and identify the active database, candidate rows, and mutation path before choosing the smallest fix.
- Enforce selected-type scope at the persistence mutation boundary and report rows actually changed.
- Give focused and full backend tests one tracked, isolated initialization/reset path that behaves equivalently locally and in CI.
- Preserve global category semantics and bind focused, full-suite, CI, and independent-review evidence to one implementation SHA.

**Non-Goals:**

- Changing workbook layout, public APIs, frontend behavior, or the product-type data model.
- Reading, modifying, or deleting developer/production data to make tests pass.
- Automatically repairing products already deactivated by earlier runs.
- Deployment, release, merge, ingress, secret/access, Hermes, or Traefik changes.

## Decisions

1. **Establish root cause through a controlled pre-fix matrix.** On one exact pre-fix SHA, run the focused regression with no `.env`, explicit tracked test variables, and the current CI-equivalent configuration. Capture current directory, resolved database target, initialization order, generated type IDs, selected candidate rows, actual mutation rows, and test-order sensitivity. Alternative: immediately patch the apparent service filter. Rejected because the service already requests a filtered set and an assumed fix could hide the actual state leak.

2. **Constrain destructive mutation atomically at persistence level.** Introduce or adapt a repository operation whose mutation predicate includes both product identity/import absence and the validated selected `type_id`, returning the rows or count actually changed. Service-side candidate calculation remains useful but cannot authorize broader mutation by itself. Alternative: continue deactivating by ID after an in-memory filtered query. Rejected because correctness would depend on every query, singleton, and stale object upstream remaining coherent.

3. **Resolve repositories against an explicit tracked test database lifecycle.** Test bootstrap will select and initialize isolated state before repository operations, migrate it once as required, reset all relevant tables/sequence state deterministically, and expose a fail-closed assertion when a non-test database is active. CI will invoke this tracked path and stop creating an untracked `.env` to change database selection; unrelated required environment values remain explicit job environment variables. Alternative: require each reviewer to copy CI's `.env`. Rejected because hidden files are not reviewable evidence and preserve semantic drift.

4. **Validate scope before cleanup and retain transactional rollback.** The selected type must exist and workbook parsing must establish a valid import set before product/category deactivation. Invalid scope or parsing errors do not fall back to all products. All mutations remain inside the existing transaction and failures roll back. Alternative: treat missing scope or an empty/invalid import as an all-types cleanup. Rejected as an unsafe destructive fallback from untrusted input.

5. **Keep category cleanup global.** Product deactivation is selected-type scoped, while category cleanup asks whether any active product of any type remains. Alternative: filter category occupancy by selected type. Rejected because categories are shared entities and cross-type products must keep their category active.

6. **Require test evidence that separates RED from GREEN.** RED must deterministically demonstrate the cross-type active-state failure or the concrete root-cause leak on the pre-fix revision. GREEN reruns the same focused matrix, database/bootstrap tests, and complete backend suite before exact-SHA CI and fresh independent code/test reviews. Existing green CI is not accepted as RED/GREEN evidence because runtime divergence is the defect.

## Risks / Trade-offs

- **[The historical failure disappears after state cleanup]** → Preserve controlled commands and diagnostics, compare test order and database targets, and add a deterministic boundary regression rather than claiming an unreproduced cause.
- **[A type-constrained mutation masks wrong upstream candidates]** → Assert candidate rows and actual affected rows independently, including selected, protected, shared-category, and emptied-category fixtures.
- **[Test lifecycle changes regress unrelated tests]** → Add focused database/bootstrap coverage and compare any full-suite failure against a clean detached `origin/main` run before classifying it as baseline.
- **[SQLite modules bind before test injection]** → Make active database resolution explicit/dynamic where necessary and fail before repository use if the expected isolated test target is not active.
- **[Concurrent type reassignment changes affected rows]** → Treat products no longer in the selected type as protected; report actual affected rows and preserve transaction consistency.

## Migration Plan

No schema or stored-data migration is planned. After exact specification approval, implement through evidenced RED/GREEN cycles, verify the focused matrix and full suite, then publish exact-SHA CI and independent reviews. Rollback is an ordinary code/config revert; no automatic data repair runs. Deployment remains a separately authorized operation outside this Issue.

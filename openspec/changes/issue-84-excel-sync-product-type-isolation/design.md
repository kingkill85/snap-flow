## Context

See `proposal.md` for motivation and `specs/excel-sync-product-type-isolation/spec.md` for the behavior contract. The reported exact revision passes the complete backend suite in GitHub Actions when CI creates `backend/.env` with `DATABASE_URL=:memory:`, but the focused regression fails in an isolated runtime with no `.env`. Test bootstrap also initializes an in-memory database directly, while application environment loading and the database singleton can select a filesystem database before test injection. The current synchronization path requests products with a selected `type_id`, so implementation must establish the actual boundary violation with controlled evidence rather than assume the visible filter alone is the root cause.

The change crosses synchronization, repository/database initialization, test bootstrap, and CI configuration. Externally supplied workbook content remains untrusted input. No frontend path is involved, so independent Playwright UI review is not applicable; Cucumber/Playwright workflow checks still run if required by the repository's exact-SHA gate.

## Goals / Non-Goals

**Goals:**

- Reproduce the divergent result on the same revision with only environment/database inputs varied, and document which database connection and rows each synchronization phase actually uses.
- Enforce the selected product type at the data-mutation boundary, not only in an in-memory collection assembled earlier in the operation.
- Give backend tests one explicit, tracked database initialization path that behaves identically with and without an untracked `.env`.
- Bind focused, full-suite, GitHub, and independent-review evidence to one exact implementation SHA.

**Non-Goals:**

- Changing workbook format, catalog APIs, product-type data modeling, or unrelated repository query behavior.
- Depending on developer database contents, deleting developer data, or modifying untracked environment files.
- Frontend/UI changes, deployment, ingress, secrets/access, release, merge, or changes to Hermes/Traefik.

## Decisions

1. **Begin with a controlled reproduction matrix and trace the active database boundary.** Run the focused regression from clean state with no `.env`, with explicit test environment variables, and with the CI-equivalent configuration, recording the exact revision, current directory, selected database target, generated type IDs, and candidate rows before deactivation. This distinguishes environment loading, singleton/test-database injection, persistent SQLite state, and query scoping before any fix is chosen. Alternative: patch the apparent filter immediately. Rejected because the current code already expresses a type filter and an unproven patch could conceal the environment-dependent cause.

2. **Make deactivation atomic and type-constrained at the persistence boundary.** The implementation will expose a repository operation whose mutation predicate includes both product identity and the selected `type_id` (or an equivalent selected-type set operation), and it will report only rows actually changed. Synchronization can still compute imported model numbers, but stale or cross-type objects cannot authorize a broader mutation. Alternative: retain ID-only deactivation after filtering in service memory. Rejected because it weakens defense in depth and makes correctness depend on every upstream query and shared-state boundary remaining perfect.

3. **Use tracked test bootstrap as the source of truth for test database selection.** Backend test setup will explicitly initialize and inject its isolated database before repositories operate, reset all state needed for deterministic identifiers and constraints, and fail if production/developer database configuration leaks into a test. CI will invoke the same tracked setup rather than create an untracked `.env` to alter test semantics. Environment variables required for unrelated configuration may remain explicit job environment values. Alternative: preserve the generated `.env` and teach local reviewers to copy it. Rejected because an untracked file is invisible evidence and permits CI/local semantic drift.

4. **Preserve global category semantics while scoping product mutation.** Category cleanup continues to consider active products across all types after selected-type synchronization. Regression fixtures will include a category shared with a protected other-type product and a category emptied only by selected-type deactivation. Alternative: scope category cleanup to the selected type. Rejected because categories are shared catalog entities and that would deactivate a category still containing an active product.

5. **Fail closed on untrusted workbook and type input.** Synchronization must validate the selected type and parsed workbook data before mutation, retain transactional/error behavior, and never broaden scope when parsing, type lookup, database selection, or repository filtering is uncertain. Test-only configuration must not be selectable by workbook content or request data. Alternative: fall back to an all-types synchronization when selection is missing or invalid. Rejected because it turns malformed external input into a destructive cross-type operation.

6. **Use strict RED/GREEN evidence.** RED must demonstrate the protected other-type product becomes inactive under the reproduced failing configuration and prove the regression assertion catches it. GREEN must run the same focused command under both isolated and CI-equivalent configuration, then the complete backend suite and GitHub backend check on the exact SHA. Independent reviewers separately examine production code and test adequacy. Alternative: rely on the previously green CI run. Rejected because that is the inconsistency this issue must eliminate.

## Risks / Trade-offs

- **[The reproduction disappears after database cleanup or dependency changes]** → Preserve exact commands and environment facts first, compare against the issue's pinned failing revision when necessary, and require a regression test that deterministically constructs the boundary violation before accepting a fix.
- **[A repository-level type predicate masks incorrect upstream selection]** → Assert both the candidate set and actual affected-row count, and cover selected, protected, shared-category, and empty-category fixtures.
- **[Test bootstrap changes affect unrelated backend tests]** → Introduce the setup change in its own RED/GREEN step, run focused database/bootstrap tests before the full suite, and classify any claimed baseline failure only through the required clean `origin/main` detached-worktree comparison.
- **[SQLite singleton or module evaluation happens before test injection]** → Add a fail-closed assertion/diagnostic at bootstrap and ensure repositories resolve the injected database dynamically; do not silently continue against a filesystem database.
- **[Stricter mutation predicates leave stale selected-type rows active after concurrent changes]** → Treat a type changed concurrently as outside the selected scope; report actual affected rows and keep the synchronization transaction/error reporting coherent.

## Migration Plan

No schema or data migration is planned. After approval, implement through RED/GREEN commits or clearly evidenced cycles, run strict OpenSpec validation and all required gates, and deploy only through a separately authorized future workflow. Rollback is the ordinary code/config revert; because no stored data is transformed, rollback requires no data repair by this change. Any already deactivated cross-type products are not automatically reactivated, because inferring their intended state would be a destructive data decision outside Issue #84.

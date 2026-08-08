## Why

GitHub Issue #84 identifies an environment-dependent regression in which importing one product type can deactivate a product belonging to another type, while CI can remain green because its untracked `.env` changes database selection. SnapFlow needs product-type isolation and an explicit, reproducible test environment so the same incorrect behavior cannot pass in one runtime and fail in another.

## What Changes

- Require catalog synchronization to deactivate missing products only within the explicitly selected product type, preserving products of every other type.
- Require regression coverage to prove product-type isolation through the public synchronization operation, including shared-category and category-cleanup behavior.
- Make backend test database/environment setup explicit and independent of an untracked `.env`, and require CI and isolated runs to exercise the same database semantics.
- Require the backend gate to fail closed when isolation is violated and to report evidence from the same exact revision across focused, full-suite, and GitHub runs.

## Capabilities

### New Capabilities

- `excel-sync-product-type-isolation`: Defines selected-product-type boundaries for Excel catalog synchronization and deterministic test-runtime requirements.

### Modified Capabilities

None.

## Impact

The planned implementation is scoped to Issue #84, OpenSpec change `issue-84-excel-sync-product-type-isolation`, branch `feature/issue-84`, this worktree, and its single Draft PR. It is expected to affect the backend Excel synchronization service, its repositories or database-query boundaries as needed, backend test bootstrap and regression tests, and the backend GitHub Actions configuration; it does not change public API shapes or frontend behavior.

Implementation requires the authorized human approver's `/approve-spec <full-commit-sha>` relayed through Neo. Material planning changes invalidate that approval and require a new full-SHA approval. Merge, release, deployment, secret or access changes, destructive operations, public ingress, and Hermes/Traefik changes remain out of scope and unauthorized.

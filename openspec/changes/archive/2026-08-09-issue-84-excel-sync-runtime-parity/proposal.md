## Why

GitHub Issue #84 shows that the Excel synchronization regression can pass in GitHub Actions yet fail in an isolated checkout at the same revision. SnapFlow needs one explicit backend test runtime and a persistence-level product-type boundary so a protected product cannot be deactivated because of hidden `.env`, database-singleton, or filesystem state.

## What Changes

- Reproduce and document the environment-dependent behavior using controlled no-`.env` and CI-equivalent runs on the same pre-fix revision.
- Require Excel catalog synchronization to deactivate missing products only inside the selected product type and preserve products of all other types.
- Preserve shared categories while deactivating a category that has no active products of any type.
- Make backend test database selection and reset explicit in tracked code, independent of untracked `.env` files or persistent developer data.
- Make the GitHub backend gate exercise the same tracked test semantics and fail when product-type isolation is violated.

## Capabilities

### New Capabilities

- `excel-sync-runtime-parity`: Defines product-type isolation for Excel synchronization, cross-type category safety, and deterministic equivalent backend test behavior across isolated and CI runtimes.

### Modified Capabilities

None.

## Impact

This fresh workflow maps GitHub Issue #84 one-to-one to OpenSpec change `issue-84-excel-sync-runtime-parity`, branch `fix/issue-84-excel-sync-runtime-parity`, worktree `/workspace/snap-flow-issue-84-v2`, and a new Draft PR. Expected implementation areas are the Excel synchronization/repository mutation boundary, backend database test bootstrap and regression tests, and `.github/workflows/tests.yml`; no public API or frontend behavior is planned.

Implementation is forbidden until the authorized human approver submits `/approve-spec <full-40-character-sha>` for the new immutable planning revision. Material planning changes require a new SHA and approval. Merge, release, deployment, secret/access changes, destructive cleanup, public ingress, and Hermes/Traefik changes remain out of scope and unauthorized.

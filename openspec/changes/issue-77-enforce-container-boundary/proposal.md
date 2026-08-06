## Why

Issue #77's post-acceptance review proved that `--workspace dir:/opt/data/profiles/dev` identifies the controller Neo Dev orchestrator card, not the SnapFlow implementation control target, and that task prose asking an agent to use `snapflow-dev` cannot select the exact Issue window. Repository inspection further proved that `task.py` has no project/tmux/worktree/branch/worker fields. The accepted implementation and archived artifacts must remain immutable, so this active repair restores the approval gate before adding a concrete fail-closed controller enforcement point.

## What Changes

- **BREAKING**: Remove the unsupported `ssh:snapflow-dev` runner-workspace model, retain `dir:/opt/data/profiles/dev` only for the controller Neo Dev orchestrator card, and add a controller-installed project-control adapter as that card's sole project-command capability. Existing `task.py` remains card creation, not enforcement.
- Define an executable adapter API invoked by Neo Dev with only operation, validated governed repository, issue number, and canonical idempotency key. The adapter resolves a controller-owned, non-caller-overridable registry record, persists that resolution with the work identity, preflights it, and launches or resumes the sole Codex implementation worker through safe argv-only tmux/process boundaries.
- Generalize canonical webhook behavior through the controller registry rather than binding every issue to Issue 77. The live-verified Issue 77 record is project `snapflow-dev`, tmux target `snapflow-dev:issue-77`, remote worktree `/workspace/snap-flow-issue-77`, branch `chore/issue-77-openspec-workflow`, and Codex as the sole implementation worker; no `devsnapflow-worker` is permitted.
- Require unknown, missing, ambiguous, conflicting, or mismatched registry, persisted, or runtime state to fail closed before any project command. Callers and task prose cannot supply or derive project, session, window, worktree, branch, worker, or paths; retries reuse the persisted resolved record and original idempotency key.
- Include focused tests, operator documentation, and non-secret controller adapter installation/capability policy while preserving the fresh approval gate and archive/canonical immutability.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `github-webhook-handoff`: Strengthen downstream card creation with an executable, issue-scoped controller project-control boundary.
- `governed-development-workflow`: Define the narrow same-effort post-archive repair exception and explicit governed repo+issue controller binding.

## Impact

This active Issue #77 repair remains on branch `chore/issue-77-openspec-workflow`, in the existing Issue #77 worktree and Draft PR #78. After approval, implementation is expected to affect the standalone task-runner/control-adapter boundary under `tools/neo_dev_webhook`, its focused tests, `docs/github-webhook-handoff.md`, and non-secret controller adapter installation/capability policy. It does not alter SnapFlow product backend/frontend behavior. Existing SSH registration, endpoint/port, host key, client identity, secrets, ingress, dispatcher, container provisioning, merge, release, deployment, destructive operations, canonical specs, and archived artifacts remain out of scope or separately gated.

## Emergency post-merge repair authorization

The first real post-bootstrap test on Issue #13 proved the merged mechanism could not govern a normal issue. The operator explicitly authorized an emergency repair on `fix/generic-neo-dev-orchestrator` without a new Issue/approval cycle because that cycle is the broken capability. Authorization covers repository code, artifacts, tests, commit, and push only; it excludes deployment, secrets, release, merge, and triggering Issue #13. The repair generalizes the registry, supplies a declarative host adapter/profile/service bundle, persists one lifecycle identity, and retains closed Issue #77 solely as compatibility.

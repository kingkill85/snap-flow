## Why

SnapFlow needs a review-gated, auditable path from GitHub issues to asynchronous development work without exposing an agent endpoint or trusting unverified webhook input. Issue 77 also standardizes OpenSpec as the repository's source of truth for specification approval and implementation handoff.

## What Changes

- Establish the Issue/OpenSpec change/branch/worktree/Draft PR lifecycle, material-change approval invalidation rules, mutually exclusive states, review gates, and authorized-human-via-Neo authority boundary.
- Install the current OpenSpec 1.8.0 Codex workflows, including new, continue, fast-forward, and verify, with telemetry disabled.
- Add independently deployable automation under `tools/` with a bounded receiver and recoverable consumer that creates durable Neo Dev Kanban tasks through the private runner configured by `NEO_DEV_TASK_RUNNER`.
- Document exact configuration, local operation, integration boundaries, and the explicit prohibition on public ingress activation.

## Capabilities

### New Capabilities

- `governed-development-workflow`: Specification approval, review, acceptance, merge, and privileged-operation governance.
- `github-webhook-handoff`: Fail-closed GitHub webhook authentication, filtering, deduplication, and durable asynchronous handoff.

### Modified Capabilities

None.

## Impact

This affects repository guidance, OpenSpec configuration and generated Codex workflows, and adds standalone `tools/` automation, tests, and operator documentation. No product backend route/import/environment coupling, ingress, deployment, secrets, Hermes, or Traefik changes are included.

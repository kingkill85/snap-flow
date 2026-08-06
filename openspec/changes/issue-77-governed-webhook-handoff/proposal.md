## Why

SnapFlow needs a review-gated, auditable path from GitHub issues to asynchronous development work without exposing an agent endpoint or trusting unverified webhook input. Issue 77 also standardizes OpenSpec as the repository's source of truth for specification approval and implementation handoff.

## What Changes

- Establish the Issue/OpenSpec change/branch/worktree/Draft PR lifecycle, approval invalidation rules, review gates, labels, and Michael-via-Neo authority boundary.
- Install the current OpenSpec 1.8.0 Codex workflows, including new, continue, fast-forward, and verify, with telemetry disabled.
- Add a dormant GitHub webhook handoff service that authenticates raw payloads, filters repository/events/labels, prevents comment loops, durably deduplicates deliveries, and durably queues accepted work for the `dev` profile.
- Document exact configuration, local operation, integration boundaries, and the explicit prohibition on public ingress activation.

## Capabilities

### New Capabilities

- `governed-development-workflow`: Specification approval, review, acceptance, merge, and privileged-operation governance.
- `github-webhook-handoff`: Fail-closed GitHub webhook authentication, filtering, deduplication, and durable asynchronous handoff.

### Modified Capabilities

None.

## Impact

This affects repository guidance, OpenSpec configuration and generated Codex workflows, and adds an isolated backend integration plus tests and operator documentation. The webhook is not mounted in the SnapFlow API and no ingress, deployment, secrets, Hermes, or Traefik configuration changes are included.

# GitHub Webhook Handoff Specification

## Purpose

Defines secure standalone GitHub-to-Neo Dev Kanban automation.

## Requirements

### Requirement: Bounded authentic requests
The receiver SHALL verify raw-byte HMAC, canonical UUID delivery IDs, bounded bodies/headers/comments/labels, and a validated schema before durable acceptance.

#### Scenario: Invalid security input
- **WHEN** authentication, UUID, size, or schema validation fails
- **THEN** no task is created

### Requirement: Exact eligibility
Only `issues` and non-PR `issue_comment` events for exact repository `kingkill85/snap-flow`, an open issue with exact `neo-dev`, and actor ID `11455872` plus login `kingkill85` SHALL be eligible. Sender and comment user SHALL agree. `issues:labeled` SHALL require the newly added label to be exactly `neo-dev`.

#### Scenario: Lookalike eligibility fails
- **WHEN** repository, event, actor, state, PR status, or label differs in any way
- **THEN** no task is created

### Requirement: Exact standalone marker
The exact standalone marker SHALL be `<!-- neo-dev -->`; altered whitespace, case, suffix, or lookalike comments SHALL not match.

#### Scenario: Marker positions
- **WHEN** the exact marker occurs at the beginning, middle, or end as a standalone line/token
- **THEN** the automated comment is ignored

### Requirement: Durable persistent-profile Kanban handoff
After all validation, filtering, and rate checks, the receiver SHALL synchronously invoke the fixed task helper and require unambiguous confirmation of exactly one durable Kanban task before responding successfully. The canonical `X-GitHub-Delivery` SHALL be passed directly as the final `--idempotency-key`. The helper SHALL authoritatively serialize and reconcile that identity in the durable private-dev Kanban database, so a delivery replay MAY invoke the helper again but SHALL resolve to the same task identity. Each later eligible delivery SHALL create another task even for the same Issue. Every task SHALL target the persistent `dev` profile, `private-dev` Kanban inbox, and `dir:/opt/data/profiles/dev` workspace. The task creation interface SHALL require and strictly constrain explicit `--board private-dev`, `--assignee dev`, and `--max-runtime 2h` arguments; none may come from webhook input. Before staging, a read-only verifier SHALL confirm the pinned Hermes Agent v0.20.0 (2026.8.3) CLI and private-board schema contract without creating or changing a task. Its body SHALL contain stable repository, Issue, event/action, delivery ID, optional comment ID, and routing to the `snapflow-orchestrator` skill plus `/opt/data/profiles/dev/projects/snapflow.md`; it SHALL NOT contain a receiver-decided phase, lifecycle action, transition capability, or decision. Durable Kanban creation and validation of its returned task ID SHALL be the external handoff boundary. The Neo Dev task SHALL fetch live GitHub and governed-workflow state before acting.

#### Scenario: Replay and concurrency
- **WHEN** a delivery repeats or races with its replay
- **THEN** exactly one durable task identity exists for that delivery

#### Scenario: Later human delivery
- **WHEN** another eligible human delivery arrives for the same Issue
- **THEN** another task is durably available to the same profile, inbox, and workspace

#### Scenario: Durable handoff cannot be confirmed
- **WHEN** the task helper fails, times out, or returns ambiguous or invalid confirmation
- **THEN** the receiver returns a retryable 503 and does not claim success

### Requirement: Resource limits
The receiver SHALL enforce authenticated-eligible request-rate limits, pre-handler connection admission, aggregate size limits, and an absolute read-phase deadline for headers and the declared body, and SHALL fail closed when exhausted. The receiver SHALL disarm that deadline immediately after the complete declared body is read, so synchronous durable handoff and response writing may continue beyond the read deadline. Invalid HMAC traffic SHALL NOT consume the trusted GitHub rate bucket.

#### Scenario: Limit exhausted
- **WHEN** the rate or concurrency limit is exhausted
- **THEN** the request is rejected without creating task work

#### Scenario: Stalled unauthenticated client
- **WHEN** a client stalls while sending headers or a declared body
- **THEN** its admission slot is released after the configured read deadline

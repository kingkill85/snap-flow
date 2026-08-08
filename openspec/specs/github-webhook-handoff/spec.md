# GitHub Webhook Handoff Specification

## Purpose

Defines secure standalone GitHub-to-Neo Dev Kanban automation.

## Requirements

### Requirement: Bounded authentic requests
The receiver SHALL verify raw-byte HMAC, canonical UUID delivery IDs, bounded bodies/headers/comments/labels, and a validated schema before durable acceptance.

#### Scenario: Invalid security input
- **WHEN** authentication, UUID, size, or schema validation fails
- **THEN** no work is enqueued

### Requirement: Exact eligibility
Only `issues` and non-PR `issue_comment` events for exact repository `kingkill85/snap-flow`, an open issue with exact `neo-dev`, and actor ID `11455872` plus login `kingkill85` SHALL be eligible. Sender and comment user SHALL agree. `issues:labeled` SHALL require the newly added label to be exactly `neo-dev`.

#### Scenario: Lookalike eligibility fails
- **WHEN** repository, event, actor, state, PR status, or label differs in any way
- **THEN** no work is enqueued

### Requirement: Exact standalone marker
The exact standalone marker SHALL be `<!-- neo-dev -->`; altered whitespace, case, suffix, or lookalike comments SHALL not match.

#### Scenario: Marker positions
- **WHEN** the exact marker occurs at the beginning, middle, or end as a standalone line/token
- **THEN** the automated comment is ignored

### Requirement: Credential-free fail-closed revalidation
Immediately before external task creation, a GitHub adapter using no repository credentials SHALL revalidate open issue, exact label, and non-PR state and SHALL fail closed. Enqueue-time validation SHALL NOT substitute for this creation-time check.

#### Scenario: Live state cannot be confirmed
- **WHEN** the public adapter errors or reports ineligible state
- **THEN** no task work is accepted

### Requirement: Durable persistent-profile Kanban handoff
The receiver SHALL atomically persist exactly one durable Kanban wakeup for each eligible human delivery before responding and SHALL never run long work. The canonical `X-GitHub-Delivery` SHALL be the downstream idempotency key. Delivery replay SHALL NOT add a second wakeup, while each later eligible delivery SHALL add another wakeup even for the same Issue. Every wakeup SHALL target the persistent `dev` profile, `private-dev` Kanban inbox, and `dir:/opt/data/profiles/dev` workspace. The task creation interface SHALL require and strictly constrain explicit `--board private-dev`, `--assignee dev`, and `--max-runtime 2h` arguments; none may come from webhook input. Before staging, a read-only verifier SHALL confirm the pinned Hermes Agent v0.20.0 (2026.8.3) CLI and private-board schema contract without creating or changing a task. Its body SHALL contain stable repository, Issue, event/action, delivery ID, optional comment ID, and routing to the `snapflow-orchestrator` skill plus `/opt/data/profiles/dev/projects/snapflow.md`; it SHALL NOT contain a receiver-decided phase, lifecycle action, transition capability, or decision. Durable Kanban creation and persistence of its returned task ID SHALL be the external handoff boundary.

#### Scenario: Replay and concurrency
- **WHEN** a delivery repeats or races with its replay
- **THEN** exactly one wakeup exists for that delivery identity

#### Scenario: Later human delivery
- **WHEN** another eligible human delivery arrives for the same Issue
- **THEN** another wakeup is durably available to the same profile, inbox, and workspace

### Requirement: Retired queue records remain blocked
On initialization, every wakeup found in the retired durable queue that is not already represented in the new inbox SHALL be copied with its delivery, repository, Issue, event/action, and optional comment identity into a `blocked_legacy` wakeup. The consumer SHALL NOT execute blocked legacy wakeups. Inspection or disposition SHALL require separate authorization and SHALL NOT automatically continue historical Issues including #6, #13, or #84.

#### Scenario: Legacy database opens after upgrade
- **WHEN** the new consumer initializes a database containing retired wakeups
- **THEN** those wakeups are preserved idempotently as blocked records and no Kanban task is created from them

### Requirement: Recoverable consumer
The consumer SHALL transactionally claim queued work with an ownership token, lease processing, recover expired claims by compare-and-set, count attempts, and transactionally complete with a persisted task ID or retry/dead-letter failure. Receiver and consumer SHALL safely initialize the same previously nonexistent SQLite database concurrently through bounded lock handling. Retry SHALL be bounded and reuse task.py idempotency.

#### Scenario: Crash around task creation
- **WHEN** the consumer crashes before recording the external result
- **THEN** lease recovery retries the same idempotency key without creating competing work

### Requirement: Resource limits
The receiver SHALL enforce authenticated-eligible request-rate limits, pre-handler connection admission, aggregate size limits, and absolute per-request header/body deadlines, and SHALL fail closed when exhausted. Invalid HMAC traffic SHALL NOT consume the trusted GitHub rate bucket.

#### Scenario: Limit exhausted
- **WHEN** the rate or concurrency limit is exhausted
- **THEN** the request is rejected without enqueueing work

#### Scenario: Simultaneous fresh startup
- **WHEN** receiver and consumer processes initialize the same new database concurrently
- **THEN** bounded lock retries complete schema initialization without startup failure

#### Scenario: Stalled unauthenticated client
- **WHEN** a client stalls while sending headers or a declared body
- **THEN** its admission slot is released after the configured read deadline

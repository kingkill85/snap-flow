## Purpose

Defines secure standalone GitHub-to-Neo Dev Kanban automation.

## ADDED Requirements

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

### Requirement: Durable asynchronous coalesced handoff
The receiver SHALL atomically persist delivery, wakeup, and active work before responding, and SHALL never run long work. Canonical `X-GitHub-Delivery` SHALL be the downstream idempotency key. Concurrent events for one repo+issue SHALL append wakeups to one active task. Durable Kanban creation and persistence of its returned task ID SHALL be the external handoff boundary; dispatcher wake-up is best effort because the gateway provides an embedded dispatcher.

#### Scenario: Replay and concurrency
- **WHEN** deliveries repeat, race, or arrive while work is active
- **THEN** delivery replay is deduplicated and at most one active task exists per repo+issue

### Requirement: Recoverable consumer
The consumer SHALL transactionally claim queued work with an ownership token, lease processing, recover expired claims by compare-and-set, count attempts, and transactionally complete with a persisted task ID or retry/dead-letter failure. Receiver and consumer SHALL safely initialize the same previously nonexistent SQLite database concurrently through bounded lock handling. Retry SHALL be bounded and reuse task.py idempotency.

#### Scenario: Crash around task creation
- **WHEN** the consumer crashes before recording the external result
- **THEN** lease recovery retries the same idempotency key without creating competing work

### Requirement: Resource limits
The receiver SHALL enforce authenticated-eligible request-rate limits, pre-handler connection admission, aggregate size limits, and per-connection header/body read deadlines, and SHALL fail closed when exhausted. Invalid HMAC traffic SHALL NOT consume the trusted GitHub rate bucket.

#### Scenario: Limit exhausted
- **WHEN** the rate or concurrency limit is exhausted
- **THEN** the request is rejected without enqueueing work

#### Scenario: Simultaneous fresh startup
- **WHEN** receiver and consumer processes initialize the same new database concurrently
- **THEN** bounded lock retries complete schema initialization without startup failure

#### Scenario: Stalled unauthenticated client
- **WHEN** a client stalls while sending headers or a declared body
- **THEN** its admission slot is released after the configured read deadline

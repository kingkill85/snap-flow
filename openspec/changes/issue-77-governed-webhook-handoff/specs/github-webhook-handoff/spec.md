## Purpose

Defines a secure, durable, non-public handoff from eligible GitHub issue activity to asynchronous development work targeting the dev profile.

## ADDED Requirements

### Requirement: Authentic requests only
The handoff SHALL verify `X-Hub-Signature-256` as an HMAC SHA-256 over the exact raw request body using constant-time comparison, and SHALL reject missing, malformed, or invalid authentication data.

#### Scenario: Signature is valid
- **WHEN** a request contains a correctly formatted signature for its exact raw body
- **THEN** payload evaluation may continue

#### Scenario: Signature is absent or invalid
- **WHEN** the signature is missing, malformed, or does not match
- **THEN** the request is rejected without enqueueing work

### Requirement: Exact repository and event allowlist
The handoff SHALL require the configured repository `full_name` exactly and SHALL accept only documented Issue or Issue Comment event actions.

#### Scenario: Repository differs
- **WHEN** the payload repository does not exactly equal the configured full name
- **THEN** the request is rejected without enqueueing work

#### Scenario: Event or action is unsupported
- **WHEN** the event type or action is outside the allowlist
- **THEN** the delivery is acknowledged as ignored without enqueueing work

### Requirement: Neo development label semantics
Eligible Issue activity SHALL concern an open issue carrying `neo-dev`; eligible Issue Comment activity SHALL be a newly created non-loopback comment on an open issue carrying `neo-dev`.

#### Scenario: Label is absent
- **WHEN** otherwise supported activity concerns an issue without `neo-dev`
- **THEN** the delivery is ignored without enqueueing work

### Requirement: Loop prevention
The handoff SHALL recognize the documented `<!-- snapflow:neo-webhook -->` marker and SHALL ignore marked comments.

#### Scenario: Marked comment returns through GitHub
- **WHEN** a created Issue Comment contains the marker
- **THEN** no work is enqueued

### Requirement: Durable atomic handoff
The handoff SHALL durably deduplicate `X-GitHub-Delivery` values across restarts and atomically persist one queue record targeting profile `dev` for each newly accepted delivery before responding successfully.

#### Scenario: New eligible delivery arrives
- **WHEN** a previously unseen eligible delivery passes all checks
- **THEN** exactly one durable queued record targeting `dev` exists before the success response

#### Scenario: Delivery is replayed after restart
- **WHEN** a previously accepted delivery ID is received by a new service instance using the same durable store
- **THEN** it is reported as a duplicate and no additional queue record is created

### Requirement: Fail closed and asynchronous execution
The handoff SHALL contain no embedded secrets, SHALL fail closed on configuration, parsing, storage, or queue errors, and SHALL never perform agent work inline.

#### Scenario: Durable persistence fails
- **WHEN** accepted work cannot be durably recorded
- **THEN** the request fails and no success acknowledgement is returned

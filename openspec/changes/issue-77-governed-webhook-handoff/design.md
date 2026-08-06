## Context

See proposal.md and the two capability specs. SnapFlow uses Deno and SQLite, but the public API currently has no GitHub webhook route. The new integration must remain dormant and must not couple receipt latency to agent execution.

## Goals / Non-Goals

**Goals:**

- Make authentication and policy evaluation independently testable from HTTP hosting.
- Make deduplication and queue insertion one durable transaction.
- Provide a local-only runner and an explicit consumer-facing queue contract.

**Non-Goals:**

- Mounting the webhook in SnapFlow's main application.
- Adding public ingress, Hermes/Traefik changes, automatic agent execution, or secret material.
- Implementing GitHub API callbacks or workflow-state mutation.

## Decisions

1. A small handler consumes a standard `Request` and injected configuration plus a `WebhookHandoffStore`. This keeps raw-body signature verification intact and makes transport/store substitutions straightforward. A framework-mounted route was rejected because it would risk accidental activation.
2. Web Crypto computes HMAC and a length-normalized byte comparison performs constant-time verification. String equality and decoded-body verification were rejected.
3. A SQLite adapter owns delivery and queue tables and inserts both in one immediate transaction. Separate dedupe and queue calls were rejected because a crash could lose or duplicate work.
4. Filtering happens before durable acceptance. Issues events allow `opened`, `reopened`, `edited`, and `labeled`; issue comments allow only `created`. Both require an open `neo-dev` issue. This avoids enqueueing arbitrary repository activity.
5. Queue payloads retain only the delivery/event/action/repository/issue/comment identifiers and receipt time needed by a downstream worker; the profile is fixed to `dev`. The receiver does not invoke a worker.
6. A standalone runner reads configuration from environment variables and binds to loopback by default. It is documented but not wired into package tasks, containers, or ingress.

## Risks / Trade-offs

- [SQLite is single-host durability] → The injectable interface permits a transactional external store if deployment topology changes.
- [A downstream worker must understand the queue schema] → Version queue records and document exact columns and claim expectations.
- [Webhook retries can race] → A unique delivery key and transactional insert make only one request enqueue work.
- [Operators could expose the standalone runner] → Default to loopback and explicitly prohibit exposure until separately approved.

## Migration Plan

Land the dormant module, tests, schema-on-open store, and documentation. A separately approved integration may provision a secret, select a durable database path, place a private authenticated transport in front of the loopback listener, and add a queue consumer. Rollback consists of stopping the standalone listener; queued records remain inspectable.

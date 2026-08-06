## Context

The automation is operational tooling, not SnapFlow product behavior. It must be independently deployable, return only after durable enqueue, and execute Neo task creation outside HTTP request handling. Issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap; future material artifact changes still require a new approval.

## Goals / Non-Goals

**Goals:** exact raw-byte authentication and bounded schema validation; durable delivery/wakeup/work persistence; crash-safe task creation; public, credential-free GitHub revalidation; mutually exclusive governance states.

**Non-Goals:** product backend routes/imports/env, ingress, deployment, secrets, GitHub mutation, or UI changes. Playwright is not applicable because this automation-only change alters no UI behavior.

## Decisions

1. `tools/neo_dev_webhook` uses Python stdlib and SQLite with injected GitHub and task-runner boundaries. Tests use real files and transactions but never invoke the real task script.
2. The receiver verifies HMAC over raw bytes before JSON parsing, checks canonical UUID delivery IDs, exact repository/event/actor/label rules, bounded input, and the exact standalone `<!-- neo-dev -->` marker.
3. A public GitHub adapter sends no repository credential and fail-closed revalidates open/label/non-PR state in the consumer immediately before external task creation. Enqueue-time state is not treated as authoritative because queued work can become stale.
4. One immediate transaction inserts the delivery, wakeup, and one active repo+issue work row. A claim captures the maximum included wakeup ID. Compare-and-set completion stores the task ID and atomically moves any later wakeups to one queued successor, using its first delivery UUID as the successor idempotency key, so there is never competing active work for a repo+issue.
5. The consumer atomically claims queued or expired processing work with a unique ownership token and increments attempts. Both explicit failure and expired-lease recovery enforce the same bounded attempt limit transactionally and send exhausted work to `dead` without returning it. The canonical delivery UUID is always reused as the `task.py` idempotency key, making a crash after external creation safe to retry.
6. The receiver and consumer are separate processes. The receiver never runs `task.py`.
7. Material proposal/design/requirement/scenario/task scope/order/acceptance/approach changes invalidate approval. Checkbox-only evidence/status changes do not. Material change stops apply, selects `needs-approval`, publishes new full-SHA links, and requires `/approve-spec <new-sha>`.
8. Archive always runs `tools/openspec_archive_guard.py`; unsynced delta specs have no confirmation bypass, including the generated archive workflow.

## State transitions

`neo-dev` is eligibility. Exactly zero or one phase label may coexist: `needs-input`, `needs-approval`, `in-progress`, `ready-for-review`, or `blocked`. Transitions replace the old phase atomically: clarification → `needs-input`; material approval → `needs-approval`; approved apply → `in-progress`; verified work → `ready-for-review`; external impediment → `blocked`; resolution returns to exactly one appropriate phase. Removing `neo-dev` removes all phase labels.

## Task.py integration

Production invokes controller-owned `/opt/data/scripts/neo-dev/task.py` with safe argv and no shell. Its real contract is a positional title followed by `--body`, bounded configurable `--max-runtime` (default `2h`), `--workspace`, and `--idempotency-key`; `--help` is checked for those options. The wrapper itself runs Hermes create and dispatch with JSON output, so stdout may contain multiple JSON documents. The runner selects the created task ID from the first document carrying `id` or `task_id` and persists it. Tests emulate this exact help/output shape and never invoke a real task. HTTP concurrency is admitted by a bounded server semaphore before handler-thread allocation or request-body reads, with the receiver limit retained as defense in depth.

## Evidence rule

A task checkbox may be completed only alongside concrete command/review evidence. Unsupported prior completion claims are reopened. The concise evidence file records exact commands and outcomes.

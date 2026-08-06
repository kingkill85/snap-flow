# Standalone Neo Dev webhook automation

This automation lives entirely under `tools/neo_dev_webhook`; SnapFlow's product backend has no route, import, environment variable, or deployment coupling.

Run the receiver and consumer as separate private processes (do not activate public ingress):

```bash
export PYTHONPATH=tools
export NEO_DEV_WEBHOOK_SECRET='replace-outside-repository'
export NEO_DEV_WEBHOOK_DB='/absolute/durable/path/neo-dev.sqlite'
export NEO_DEV_TASK_RUNNER='/private/configured/task-runner.py'
python3 -m neo_dev_webhook.server --host 127.0.0.1 --port 8787
python3 -m neo_dev_webhook.consumer "$NEO_DEV_WEBHOOK_DB" --max-runtime 2h --max-attempts 5
```

The receiver accepts only raw-HMAC-authenticated GitHub `issues`/`issue_comment` payloads for `kingkill85/snap-flow`, canonical UUID deliveries, open exact-`neo-dev` issues, and the authorized numeric/login actor pair. It bounds the body, individual and aggregate headers, comments, and labels; rejects PR comments; ignores the exact standalone `<!-- neo-dev -->` marker; and applies the trusted rate bucket only after successful authentication and eligibility checks. The server sets an absolute per-request deadline so stalled headers or bodies cannot retain an admission slot indefinitely. It performs no live network or long-running work.

SQLite durability uses full synchronous WAL transactions and bounded lock retries during simultaneous receiver/consumer initialization of a fresh database. Delivery, wakeup, and coalesced repo+issue work are committed before HTTP success. A claim records the maximum included wakeup ID; completion transactionally moves later wakeups to one successor whose first delivery UUID becomes its idempotency key. Immediately before task creation, the consumer uses GitHub's public API without credentials and fails closed unless the issue is still open, non-PR, and carries exact `neo-dev`. Claims use ownership tokens so stale workers cannot finalize recovered leases. Explicit failures and expired leases share the configured bounded attempt limit and then dead-letter.

The consumer invokes the private runner configured by `NEO_DEV_TASK_RUNNER` without a shell as:

```text
python3 "$NEO_DEV_TASK_RUNNER" "SnapFlow issue #<number>" --body "..." --max-runtime 2h --workspace dir:/opt/data/profiles/dev --idempotency-key <delivery-uuid>
```

It validates the real top-level `--help` options first. The fixed workspace selects only the controller's Neo Dev orchestrator card; it is not the implementation worktree and cannot be overridden by the webhook runner. `--max-runtime` defaults to `2h` and is configurable on the consumer. Durable Kanban creation is the handoff boundary: the private helper requires an idempotency key, reconciles uncertain create outcomes against the durable store, emits one stable JSON document containing `task_id`, and then performs a bounded best-effort dispatcher wake-up. The gateway's embedded dispatcher provides eventual liveness on its normal tick even if that wake-up fails. The consumer accepts only one stable JSON document with `durable: true` and an explicit `task_id`, then persists that ID. Tests emulate the current CLI/help and stable output, exercise simultaneous process initialization and SQLite connection races, inject GitHub/task boundaries, and never create real tasks. The HTTP server also admits at most the configured number of connections before allocating handler threads or reading bodies; the receiver's internal semaphore remains defense in depth.

## Controller project-control boundary

On the controller card, Neo Dev uses this adapter API as its sole project-command capability:

```text
neo-dev-project-control <preflight|start|resume> --repository <owner/name> --issue-number <positive-integer> --idempotency-key <canonical-delivery-uuid>
```

The caller supplies no project, tmux, worktree, branch, worker, command, path, or connection coordinate. The controller-owned versioned registry resolves the exact repository+issue identity, and controller-owned persistence immutably binds that resolution to the original delivery UUID before launch. Retry and resume reload the same binding and reject registry drift. Unknown, missing, duplicate, conflicting, or mismatched registry, persistence, worktree, branch, tmux-window, or sole-worker state fails closed before Codex launch or tmux control. The adapter uses bounded argv-only subprocess calls with shell interpolation disabled. It neither derives a target nor falls back to another issue, `snapflow-dev:0`, an alternate worktree, `ssh:snapflow-dev`, or a `devsnapflow-worker`.

The non-sensitive governed record for Issue 77 is project `snapflow-dev`, session `snapflow-dev`, window `issue-77`, worktree `/workspace/snap-flow-issue-77`, branch `chore/issue-77-openspec-workflow`, and sole implementation worker `Codex`. The versioned registry, install manifest, entry point, and card capability policy are under `tools/neo_dev_webhook/controller/` for installation through the trusted operator path. The policy allows only `/usr/local/bin/neo-dev-project-control` for project commands and denies direct shell, SSH, tmux, Git, Codex, OpenSpec, package, lint, and test control from the card.

Neo Dev may separately use the controller's existing authenticated GitHub integration for Issue and PR reads/writes. That exception is not a project-command capability. Network endpoints, ports, host keys, client identities, secrets, and controller installation state are deliberately absent from this repository runbook.

Issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap. Future material artifact changes require new immutable links and `/approve-spec <new-sha>`; checkbox-only evidence updates do not invalidate an existing approval.

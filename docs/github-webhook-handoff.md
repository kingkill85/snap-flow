# Standalone Neo Dev webhook automation

This automation lives entirely under `tools/neo_dev_webhook`; SnapFlow's product backend has no route, import, environment variable, or deployment coupling.

Run the receiver and consumer as separate private processes (do not activate public ingress):

```bash
export PYTHONPATH=tools
export NEO_DEV_WEBHOOK_SECRET='replace-outside-repository'
export NEO_DEV_WEBHOOK_DB='/absolute/durable/path/neo-dev.sqlite'
python3 -m neo_dev_webhook.server --host 127.0.0.1 --port 8787
python3 -m neo_dev_webhook.consumer "$NEO_DEV_WEBHOOK_DB" --max-runtime 2h --max-attempts 5
```

The receiver accepts only raw-HMAC-authenticated GitHub `issues`/`issue_comment` payloads for `kingkill85/snap-flow`, canonical UUID deliveries, open exact-`neo-dev` issues, and the authorized numeric/login actor pair. It bounds the body, individual and aggregate headers, comments, and labels; rejects PR comments; and ignores the exact standalone `<!-- neo-dev -->` marker. It performs no live network or long-running work.

SQLite durability uses full synchronous WAL transactions. Delivery, wakeup, and coalesced repo+issue work are committed before HTTP success. A claim records the maximum included wakeup ID; completion transactionally moves later wakeups to one successor whose first delivery UUID becomes its idempotency key. Immediately before task creation, the consumer uses GitHub's public API without credentials and fails closed unless the issue is still open, non-PR, and carries exact `neo-dev`. Claims use ownership tokens so stale workers cannot finalize recovered leases. Explicit failures and expired leases share the configured bounded attempt limit and then dead-letter.

The consumer invokes controller-owned `/opt/data/scripts/neo-dev/task.py` without a shell as:

```text
python3 /opt/data/scripts/neo-dev/task.py "SnapFlow issue #<number>" --body "..." --max-runtime 2h --workspace kingkill85/snap-flow --idempotency-key <delivery-uuid>
```

It validates the real top-level `--help` options first. `--max-runtime` defaults to `2h` and is configurable on the consumer. Because the wrapper emits Hermes create JSON followed by dispatch JSON, the consumer parses multiple JSON documents and persists the created task ID from the first document containing `id` or `task_id`. Tests emulate the exact CLI/help and multi-document output, use separate SQLite connections for process-level races, inject GitHub/task boundaries, and never create real tasks. The HTTP server also admits at most the configured number of connections before allocating handler threads or reading bodies; the receiver's internal semaphore remains defense in depth.

Issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap. Future material artifact changes require new immutable links and `/approve-spec <new-sha>`; checkbox-only evidence updates do not invalidate an existing approval.

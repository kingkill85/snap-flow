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

The persisted resolution also contains controller-observed Codex execution state: the exact session UUID, phase, process generation, restart count, and an optional structured terminal observation with separate exit code, trusted semantic outcome, and resumability. The versioned state schema is installed with the adapter. Session and terminal observations are trusted controller transitions and are not CLI arguments; callers and task prose cannot set them.

`start` first records `starting`, then launches the installed internal `neo-dev-codex-runtime` supervisor with adapter-constructed fixed argv. The supervisor starts Codex app-server over private stdio, obtains the generated UUID directly from `thread/start`, persists it as `active` before starting the turn, and constrains the final assistant message with the built-in strict completion schema. It records the turn status and validated semantic result as one terminal observation. Thus the production start path cannot remain indefinitely at `starting` merely because no external caller can invoke an observation method.

The supervisor is installed as `dev:dev` mode `0750` below the adapter's private library directory, and the state directory is `dev:dev` mode `0750`. This gives the governed `dev` runtime account execute access to the helper and write/traverse access to atomic resolution state without sudo, setuid, or a supplementary-group change. It is not listed as a card capability, accepts no repository/project/tmux/worktree/branch/worker/path/outcome arguments, and is invoked only by exact argv assembled by `neo-dev-project-control`. It is a lifecycle boundary around the sole Codex worker, not another worker or a second card capability.

A correctable finding while the supervisor and Codex thread are active is delivered as the fixed continuation line to the same governed pane. The supervisor translates it to app-server `turn/steer` for the existing process, thread, and turn. If the process exited with a usable persisted session, `resume` respawns the internal supervisor with the exact persisted UUID; it uses app-server `thread/resume` for that UUID—never `--last`, a picker, or a caller-selected session.

Because both installed entrypoints use Python shebangs, tmux normally reports the active pane command as `python3`. Preflight does not trust that basename. It requires one pane whose exact `pane_start_command` equals one of the adapter-constructed start/resume argv strings for the persisted key/session, captures its numeric pane PID, and requires exactly one direct `node /usr/local/bin/codex app-server --stdio` child. Unrelated Python, changed start argv, a different child, or an extra child fails closed. The supervisor closes app-server stdin and deterministically waits, terminates, or kills-and-waits on every normal or exceptional exit so it cannot leave an orphan worker.

For an exited resumable session, tmux 3.4 may report an empty `pane_current_path` on a dead remain-on-exit pane. Inactive preflight therefore requires exactly one pane with `pane_dead=1` and a numeric pane PID, but does not treat that dead-pane path field as authoritative. It independently verifies the controller-owned worktree and branch with fixed `git -C <registered-worktree> branch --show-current`; respawn then supplies the same fixed `-c` worktree. A live, malformed, or ambiguous pane still fails before respawn. Active-pane path and process-tree checks are unchanged.

A fresh Codex session is permitted only for trusted `crashed` or exited-unresumable state and only while the persisted restart count is zero. The adapter atomically increments the process generation and consumes the single restart allowance before executing the fixed argv. A second fallback, ambiguous live/session state, an untrusted terminal report, or session drift fails closed before launch.

Process status and semantic completion are deliberately separate. Exit code zero does not mean the work succeeded. Only a schema-valid structured terminal outcome of `success` combined with exit code zero produces `semantic_success`; nominal success with a nonzero exit, extra/missing/wrongly typed fields, correctable, blocked, crashed, invalid, prose-only, and missing terminal results remain non-success states. The runtime accepts exactly `semantic_outcome`, boolean `resumable`, and a bounded nonempty `summary`; it never interprets unconstrained worker prose as completion.

The non-sensitive governed record for Issue 77 is project `snapflow-dev`, session `snapflow-dev`, window `issue-77`, worktree `/workspace/snap-flow-issue-77`, branch `chore/issue-77-openspec-workflow`, and sole implementation worker `Codex`. The versioned registry, install manifest, entry point, and card capability policy are under `tools/neo_dev_webhook/controller/` for installation through the trusted operator path. The policy allows only `/usr/local/bin/neo-dev-project-control` for project commands and denies direct shell, SSH, tmux, Git, Codex, OpenSpec, package, lint, and test control from the card.

Neo Dev may separately use the controller's existing authenticated GitHub integration for Issue and PR reads/writes. That exception is not a project-command capability. Network endpoints, ports, host keys, client identities, secrets, and controller installation state are deliberately absent from this repository runbook.

Issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap. Future material artifact changes require new immutable links and `/approve-spec <new-sha>`; checkbox-only evidence updates do not invalidate an existing approval.

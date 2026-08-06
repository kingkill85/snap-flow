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

For a live host, install the exact files declared by `tools/neo_dev_webhook/deploy/install-manifest.v1.json`, verify their owner/mode and existing secret-file prerequisites, then execute its two explicit systemd activation commands. The manifest installs both receiver/consumer units, the narrow host-side adapter, and the reviewed `snapflow.profile.md` as `/opt/data/profiles/dev/projects/snapflow.md`; do not hand-edit that external profile. Deployment is an operator action and is not performed by repository tests or merges.

The receiver accepts only raw-HMAC-authenticated GitHub `issues`/`issue_comment` payloads for `kingkill85/snap-flow`, canonical UUID deliveries, open exact-`neo-dev` issues, and the authorized numeric/login actor pair. It bounds the body, individual and aggregate headers, comments, and labels; rejects PR comments; ignores the exact standalone `<!-- neo-dev -->` marker; and applies the trusted rate bucket only after successful authentication and eligibility checks. The server sets an absolute per-request deadline so stalled headers or bodies cannot retain an admission slot indefinitely. It performs no live network or long-running work.

SQLite durability uses full synchronous WAL transactions and bounded lock retries during simultaneous receiver/consumer initialization of a fresh database. Delivery, wakeup, and coalesced repo+issue work are committed before HTTP success. A claim records the maximum included wakeup ID; successful handoff enters `waiting`, while a late wakeup transactionally requeues that same workflow row and original idempotency identity. Immediately before task creation, the consumer uses GitHub's public API without credentials and fails closed unless the issue is still open, non-PR, and carries exact `neo-dev`. Claims use ownership tokens so stale workers cannot finalize recovered leases. Explicit failures and expired leases share the configured bounded attempt limit and then dead-letter.

The consumer invokes the private runner configured by `NEO_DEV_TASK_RUNNER` without a shell as:

```text
python3 "$NEO_DEV_TASK_RUNNER" "SnapFlow issue #<number>" --body "..." --max-runtime 2h --workspace dir:/opt/data/profiles/dev --idempotency-key <delivery-uuid>
```

It validates the real top-level `--help` options first. The fixed workspace selects only the controller's Neo Dev orchestrator card; it is not the implementation worktree and cannot be overridden by the webhook runner. The self-contained body records repository, Issue, durable identity, latest exact trusted event/command, workflow phase, exact adapter invocation, mandatory project-profile read, expected artifacts, gates, and fail-fast blocker behavior. `--max-runtime` defaults to `2h`. Durable Kanban creation is the handoff boundary; later wakeups reuse the same row, idempotency key, task ID, tmux window, and Codex session. The consumer is single-process/single-claim (`concurrency: 1` in the deployment manifest), and a waiting workflow blocks other Issues until its trusted closure webhook finalizes it, so later Issues remain durably queued and isolated. Dispatcher wakeups and Hermes heartbeats provide liveness only and never satisfy progress or completion.

The controller-side `/usr/local/bin/neo-dev-project-control` is a fixed remote adapter. It accepts only `preflight|start|resume`, the exact registered repository, a positive integer Issue number, and a canonical UUID. It invokes `/usr/bin/ssh` with `shell=False`, the fixed `snapflow-dev` host alias and user, fixed identity, `BatchMode`, `IdentitiesOnly`, strict host-key checking, and the pinned known-hosts file. The sole remote executable is `/usr/local/bin/neo-dev-project-control`; host, identity, known-hosts, paths, and arbitrary remote commands are not caller options.

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

Process status and semantic completion are deliberately separate. Exit code zero does not mean the work succeeded. Only a schema-valid structured terminal outcome of `success` combined with exit code zero, repository-artifact verification, GitHub-artifact verification, and `heartbeat_only: false` produces `semantic_success`; nominal success with a nonzero exit, extra/missing/wrongly typed fields, correctable, blocked, crashed, invalid, prose-only, and missing terminal results remain non-success states. The runtime also records a bounded summary and enumerated workflow phase; it never interprets unconstrained worker prose as completion.

The registry contains one `kingkill85/snap-flow` project template. A positive Issue `N` deterministically resolves to branch `feature/issue-N`, worktree `/workspace/snap-flow-issue-N`, tmux window `issue-N`, session `snapflow-dev`, and sole worker Codex. Components are strictly validated and collisions or ambiguity fail closed. Initial `start` fetches `origin/main`, verifies or creates the issue branch/worktree idempotently, verifies its checked-out branch, and creates exactly one window; it never checks out or modifies `main`. Closed bootstrap Issue 77 remains an explicit compatibility record using branch `chore/issue-77-openspec-workflow`.

The initial Codex prompt is repository-, Issue-, and phase-specific. It requires the live Issue, `AGENTS.md`, and OpenSpec configuration and permits only proposal/design/delta specs/tasks, Draft PR, commit/push, immutable evidence, and the exact approval request. Continuations enforce `/approve-spec`, review, `/accept` sync/archive, and separate `/merge` finalization in the same session. Structured terminal state—not prose, heartbeats, elapsed time, or process exit alone—is the controller completion boundary; missing artifact or GitHub verification must yield one concrete blocker.

Neo Dev may separately use the controller's existing authenticated GitHub integration for Issue and PR reads/writes. That exception is not a project-command capability. Network endpoints, ports, host keys, client identities, secrets, and controller installation state are deliberately absent from this repository runbook.

Issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap. Future material artifact changes require new immutable links and `/approve-spec <new-sha>`; checkbox-only evidence updates do not invalidate an existing approval.

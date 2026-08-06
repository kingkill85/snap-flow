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

The live topology is the existing Dockge/Docker Compose project `snapflow-neo-dev-webhook`, with source at `/opt/data/services/snapflow-neo-dev-webhook`, persistent state under `/var/lib/neo-dev`, and shared `/opt/data`. `tools/neo_dev_webhook/deploy/install.sh` stages an override for the existing `receiver` and `consumer` services, installs both sides of the adapter, appends one delimited block to the existing project profile, verifies permissions/configuration, and supports explicit activation and rollback. It never installs parallel systemd services or replaces the profile. Installation/activation are separate operator actions and are not performed by tests or merges.

The receiver accepts only raw-HMAC-authenticated GitHub `issues`/`issue_comment` payloads for `kingkill85/snap-flow`, canonical UUID deliveries, open exact-`neo-dev` issues, and the authorized numeric/login actor pair. It bounds the body, individual and aggregate headers, comments, and labels; rejects PR comments; ignores the exact standalone `<!-- neo-dev -->` marker; and applies the trusted rate bucket only after successful authentication and eligibility checks. The server sets an absolute per-request deadline so stalled headers or bodies cannot retain an admission slot indefinitely. It performs no live network or long-running work.

SQLite durability uses full synchronous WAL transactions and bounded lock retries during simultaneous receiver/consumer initialization of a fresh database. Delivery, wakeup, and coalesced repo+issue work are committed before HTTP success. A claim records the maximum included wakeup ID; successful handoff enters `waiting`, while a late wakeup transactionally requeues that same workflow row and original idempotency identity. Immediately before task creation, the consumer uses GitHub's public API without credentials and fails closed unless the issue is still open, non-PR, and carries exact `neo-dev`. Claims use ownership tokens so stale workers cannot finalize recovered leases. Explicit failures and expired leases share the configured bounded attempt limit and then dead-letter.

The consumer invokes the private runner configured by `NEO_DEV_TASK_RUNNER` without a shell as:

```text
python3 "$NEO_DEV_TASK_RUNNER" "SnapFlow issue #<number>" --body "..." --max-runtime 2h --workspace dir:/opt/data/profiles/dev --idempotency-key <deterministic-wakeup-uuid>
```

It validates the real top-level `--help` options first. The fixed workspace selects only the controller's Neo Dev orchestrator card. The first delivery UUID remains the lifecycle/controller identity. Every wakeup derives a deterministic UUIDv5 Kanban execution identity, so the real helper creates exactly one new runnable phase card even though older executions are terminal; replay returns only that same phase card. Each self-contained body carries the lifecycle identity and exact adapter command, so all phase cards resume one controller state, tmux window, and Codex session rather than unrelated context. Successful handoff resets the failure-attempt counter. A waiting workflow blocks other Issues until independently verified finalization. Dispatcher wakeups and heartbeats are liveness only.

The Neo Dev-side adapter is `/opt/data/bin/neo-dev-project-control`. It accepts only fixed operations, repository, positive Issue number, and lifecycle UUID. It invokes `/usr/bin/ssh` with `shell=False`, `-F /dev/null`, fixed `dev@192.168.178.4` port `2222`, identity `/opt/data/credentials/snapflow-dev-client`, exclusive `/opt/data/tailscale_known_hosts`, `GlobalKnownHostsFile=/dev/null`, `ProxyCommand=none`, `BatchMode`, `IdentitiesOnly`, and strict host checking. The server authorized-key entry uses `restrict`, disables PTY/agent/port/X11 forwarding, and forces `neo-dev-forced-command`; its strict `SSH_ORIGINAL_COMMAND` grammar permits only the privileged controller wrapper.

## Controller project-control boundary

On the controller card, Neo Dev uses this adapter API as its sole project-command capability:

```text
neo-dev-project-control <preflight|start|resume> --repository <owner/name> --issue-number <positive-integer> --idempotency-key <canonical-lifecycle-uuid>
```

The caller supplies no project, tmux, worktree, branch, worker, command, path, or connection coordinate. The controller-owned versioned registry resolves the exact repository+issue identity, and controller-owned persistence immutably binds that resolution to the original delivery UUID before launch. Retry and resume reload the same binding and reject registry drift. Unknown, missing, duplicate, conflicting, or mismatched registry, persistence, worktree, branch, tmux-window, or sole-worker state fails closed before Codex launch or tmux control. The adapter uses bounded argv-only subprocess calls with shell interpolation disabled. It neither derives a target nor falls back to another issue, `snapflow-dev:0`, an alternate worktree, `ssh:snapflow-dev`, or a `devsnapflow-worker`.

The persisted resolution contains controller-observed Codex execution state. All controller/runtime Python and wrappers are root-owned and non-writable by `dev`; `/var/lib/neo-dev/project-control` is `root:root 0700`. Narrow sudo wrappers run the supervisor/controller as root, while `setpriv` drops only the Codex app-server child to `dev`. Codex therefore cannot read/write trusted state, replace supervisor code, or turn its own JSON into trusted state.

`start` first records `starting`, then launches the installed internal `neo-dev-codex-runtime` supervisor with adapter-constructed fixed argv. The supervisor starts Codex app-server over private stdio, obtains the generated UUID directly from `thread/start`, persists it as `active` before starting the turn, and constrains the final assistant message with the built-in strict completion schema. It records the turn status and validated semantic result as one terminal observation. Thus the production start path cannot remain indefinitely at `starting` merely because no external caller can invoke an observation method.

The public runtime/controller entrypoints only exec root-owned, strict privileged wrappers through the installed narrow sudoers policy. The privileged runtime validates its fixed arguments, owns the app-server stdio and trusted transitions, and executes the Codex child as `dev` with `no_new_privs`. No writable shared library or state path participates in trust.

A correctable finding while the supervisor and Codex thread are active is delivered as the fixed continuation line to the same governed pane. The supervisor translates it to app-server `turn/steer` for the existing process, thread, and turn. If the process exited with a usable persisted session, `resume` respawns the internal supervisor with the exact persisted UUID; it uses app-server `thread/resume` for that UUID—never `--last`, a picker, or a caller-selected session.

Because both installed entrypoints use Python shebangs, tmux normally reports the active pane command as `python3`. Preflight does not trust that basename. It requires one pane whose exact `pane_start_command` equals one of the adapter-constructed start/resume argv strings for the persisted key/session, captures its numeric pane PID, and requires exactly one direct `node /usr/local/bin/codex app-server --stdio` child. Unrelated Python, changed start argv, a different child, or an extra child fails closed. The supervisor closes app-server stdin and deterministically waits, terminates, or kills-and-waits on every normal or exceptional exit so it cannot leave an orphan worker.

For an exited resumable session, tmux 3.4 may report an empty `pane_current_path` on a dead remain-on-exit pane. Inactive preflight therefore requires exactly one pane with `pane_dead=1` and a numeric pane PID, but does not treat that dead-pane path field as authoritative. It independently verifies the controller-owned worktree and branch with fixed `git -C <registered-worktree> branch --show-current`; respawn then supplies the same fixed `-c` worktree. A live, malformed, or ambiguous pane still fails before respawn. Active-pane path and process-tree checks are unchanged.

A fresh Codex session is permitted only for trusted `crashed` or exited-unresumable state and only while the persisted restart count is zero. The adapter atomically increments the process generation and consumes the single restart allowance before executing the fixed argv. A second fallback, ambiguous live/session state, an untrusted terminal report, or session drift fails closed before launch.

Process status, worker JSON, and semantic completion are separate. Worker output selects a requested phase but is never evidence. The root supervisor independently verifies clean repository HEAD, phase-specific OpenSpec artifacts, the immutable approval SHA and unchanged approved artifacts, PR/head state, review evidence and successful checks, archive state, ordered `/accept` and `/merge`, merged PR/merge commit, and Issue closure as applicable. Any mismatch persists a blocker. Closure releases project concurrency only after the controller is already in verified merge-finalization success and reruns that verification; manual closure alone returns a conflict and retains state.

The registry contains one `kingkill85/snap-flow` template. Before fetch/adoption, the controller verifies the exact top-level path, absolute Git common directory, and normalized origin against the root-owned project record. Existing worktrees must share that common directory, carry the exact branch, and descend from `origin/main`. A positive Issue `N` then maps to `feature/issue-N`, `/workspace/snap-flow-issue-N`, and `snapflow-dev:issue-N`; closed Issue 77 remains an explicit compatibility record. Launch intent is persisted before tmux and launch failure becomes one bounded recoverable state; retry reconciles an absent/existing window without starting duplicates, then fails closed after the allowance.

The initial Codex prompt is repository-, Issue-, and phase-specific. It requires the live Issue, `AGENTS.md`, and OpenSpec configuration and permits only proposal/design/delta specs/tasks, Draft PR, commit/push, immutable evidence, and the exact approval request. Continuations enforce `/approve-spec`, review, `/accept` sync/archive, and separate `/merge` finalization in the same session. Structured terminal state—not prose, heartbeats, elapsed time, or process exit alone—is the controller completion boundary; missing artifact or GitHub verification must yield one concrete blocker.

Neo Dev may separately use the controller's existing authenticated GitHub integration for Issue and PR reads/writes. Private key and host-key contents remain external; only their fixed root-owned paths and endpoint are documented.

Issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap. Future material artifact changes require new immutable links and `/approve-spec <new-sha>`; checkbox-only evidence updates do not invalidate an existing approval.

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

The live topology has three scopes. Hermes stages source at `/opt/data/services/snapflow-neo-dev-webhook/src` and shared `/opt/data` artifacts. `snapflow-dev` receives controller code through the pinned SSH maintenance install phase. Dockge controls the active Compose at `/mnt/marder/docker/dockge/stacks/snapflow-neo-dev-webhook/compose.yaml`; its source copy is `/opt/data/build/snapflow-neo-dev-webhook/compose.yaml` in another environment. Durable Docker-host data is `/mnt/marder/docker/snapflow-neo-dev-webhook/data` and appears only inside receiver/consumer as `/var/lib/neo-dev`. Split scripts provide independent backup, verification, activation and rollback. No Compose override is required or supplied.

The receiver accepts only raw-HMAC-authenticated GitHub `issues`/`issue_comment` payloads for `kingkill85/snap-flow`, canonical UUID deliveries, open exact-`neo-dev` issues, and the authorized numeric/login actor pair. It bounds the body, individual and aggregate headers, comments, and labels; rejects PR comments; ignores the exact standalone `<!-- neo-dev -->` marker; and applies the trusted rate bucket only after successful authentication and eligibility checks. The server sets an absolute per-request deadline so stalled headers or bodies cannot retain an admission slot indefinitely. It performs no live network or long-running work.

SQLite durability uses full synchronous WAL transactions and bounded lock retries during simultaneous receiver/consumer initialization of a fresh database. Delivery, wakeup, and coalesced repo+issue work are committed before HTTP success. A claim records the maximum included wakeup ID; successful handoff enters `waiting`, while a late wakeup transactionally requeues that same workflow row and original idempotency identity. Immediately before task creation, the consumer uses GitHub's public API without credentials and fails closed unless the issue is still open, non-PR, and carries exact `neo-dev`. Claims use ownership tokens so stale workers cannot finalize recovered leases. Explicit failures and expired leases share the configured bounded attempt limit and then dead-letter.

The consumer invokes the private runner configured by `NEO_DEV_TASK_RUNNER` without a shell as:

```text
python3 "$NEO_DEV_TASK_RUNNER" "SnapFlow issue #<number>" --body "..." --max-runtime 2h --workspace dir:/opt/data/profiles/dev --idempotency-key <deterministic-wakeup-uuid>
```

It validates the real top-level `--help` options first. The fixed workspace selects only the controller's Neo Dev reasoning card. The first delivery UUID remains the lifecycle/controller identity. Every wakeup derives a deterministic UUIDv5 Kanban execution identity. The consumer invokes the narrow adapter before card creation; cards receive no project-command capability. Each body carries structured lifecycle context so all executions reason about one controller state, tmux window, and Codex session. Successful handoff resets failure attempts. A waiting workflow remains available for same-Issue wakeups without consuming project-worker capacity, so another queued Issue may run while the first awaits a human gate. Dispatcher wakeups and heartbeats are liveness only.

The consumer-side adapter is `/opt/data/bin/neo-dev-project-control`. It accepts only fixed operations, repository, positive Issue number, lifecycle UUID and a strict host-evidence envelope for attest/resume/finalize. It invokes fixed `neo-controller@192.168.178.4:2222` with dedicated `/opt/data/credentials/snapflow-controller-client`, exclusive `/opt/data/tailscale_known_hosts`, no uncontrolled SSH configuration/proxy/global trust, and `shell=False`. Michael/Neo's separate `dev` maintenance identity is never used by workflow traffic. The dedicated public key forces `neo-dev-forced-command` with `restrict` and no forwarding/PTY.

## Controller project-control boundary

The consumer uses this adapter API before creating a card:

```text
neo-dev-project-control <preflight|start|resume> --repository <owner/name> --issue-number <positive-integer> --idempotency-key <canonical-lifecycle-uuid>
```

The caller supplies no project, tmux, worktree, branch, worker, command, path, or connection coordinate. The controller-owned versioned registry resolves the exact repository+issue identity, and controller-owned persistence immutably binds that resolution to the original delivery UUID before launch. Retry and resume reload the same binding and reject registry drift. Unknown, missing, duplicate, conflicting, or mismatched registry, persistence, worktree, branch, tmux-window, or sole-worker state fails closed before Codex launch or tmux control. The adapter uses bounded argv-only subprocess calls with shell interpolation disabled. It neither derives a target nor falls back to another issue, `snapflow-dev:0`, an alternate worktree, `ssh:snapflow-dev`, or a `devsnapflow-worker`.

The persisted resolution contains controller-observed execution and lifecycle state. Controller code is root-owned; state is `neo-controller:neo-controller 0700`. Only the public-key-only `neo-controller` identity has narrow lifecycle sudo rights. Its externally managed sshd policy must allow `dev neo-controller`, require public key for the controller, disable password/interactive authentication, and prohibit TTY and forwarding. Codex remains `dev`, has no lifecycle sudo rule, and cannot read state, replace supervisor code, or invoke lifecycle controls.

`start` first records `starting`, then launches a root-owned one-shot supervisor. The controller invokes all repository, tmux and process inspection through a root-only fixed-argv adapter that drops to `dev`; root never adopts the dev repository or a different tmux server. It then creates the sole window in the existing dev-owned `snapflow-dev` session. The pane wrapper runs as `dev`, connects to the supervisor's one-shot socket, starts Codex app-server, reports its generated UUID, and receives only bounded launch state. A disconnect is recorded as a recoverable terminal observation rather than leaving `starting` or `resuming` wedged.

The forced SSH key reaches only the root-owned controller through `neo-controller`'s exact sudo rule. The project-worker helper is root-only and accepts only bounded Git/tmux/process argv before `setpriv --reuid=dev --regid=dev --init-groups --no-new-privs`. The tmux runtime wrapper has no sudo path and cannot mutate trusted state; only the root supervisor verifies GitHub/repository evidence and persists lifecycle transitions. No `safe.directory=*`, broad dev sudo, writable shared library, or worker-accessible state participates in trust.

A correctable finding while the supervisor and Codex thread are active is delivered as the fixed continuation line to the same governed pane. The supervisor translates it to app-server `turn/steer` for the existing process, thread, and turn. If the process exited with a usable persisted session, `resume` respawns the internal supervisor with the exact persisted UUID; it uses app-server `thread/resume` for that UUID—never `--last`, a picker, or a caller-selected session.

Because both installed entrypoints use Python shebangs, tmux normally reports the active pane command as `python3`. Preflight does not trust that basename. It requires one pane whose exact `pane_start_command` equals one of the adapter-constructed start/resume argv strings for the persisted key/session, captures its numeric pane PID, and requires exactly one direct `node /usr/local/bin/codex app-server --stdio` child. Unrelated Python, changed start argv, a different child, or an extra child fails closed. The supervisor closes app-server stdin and deterministically waits, terminates, or kills-and-waits on every normal or exceptional exit so it cannot leave an orphan worker.

For an exited resumable session, tmux 3.4 may report an empty `pane_current_path` on a dead remain-on-exit pane. Inactive preflight therefore requires exactly one pane with `pane_dead=1` and a numeric pane PID, but does not treat that dead-pane path field as authoritative. It independently verifies the controller-owned worktree and branch with fixed `git -C <registered-worktree> branch --show-current`; respawn then supplies the same fixed `-c` worktree. A live, malformed, or ambiguous pane still fails before respawn. Active-pane path and process-tree checks are unchanged.

A fresh Codex session is permitted only for trusted `crashed` or exited-unresumable state and only while the persisted restart count is zero. The adapter atomically increments the process generation and consumes the single restart allowance before executing the fixed argv. A second fallback, ambiguous live/session state, an untrusted terminal report, or session drift fails closed before launch.

Process status and worker JSON are never lifecycle authority. The Hermes consumer performs GitHub reads with fixed `/opt/data/bin/gh` and `GH_CONFIG_DIR=/opt/data/home/.config/gh`; GitHub credentials never enter `snapflow-dev`. Fresh transport-authenticated evidence is bound to workflow UUID, resolution, expected state, Issue, phase and SHA. The controller combines it with local Git/OpenSpec checks and alone advances `label → specification_ready → spec_approved → implementation_verified → accepted → archive_ci_verified → merge_authorized → merged_closed`. Specification verification rejects paths outside the planning tree and narrow evidence docs. `/accept` cannot skip approval/review; `/merge` must postdate archive/CI state and match its exact SHA. Closure backoff releases concurrency only after `merged_closed`.

The registry contains one `kingkill85/snap-flow` template. Before fetch/adoption, the controller verifies the exact top-level path, absolute Git common directory, and normalized origin against the root-owned project record. Existing worktrees must share that common directory, carry the exact branch, and descend from `origin/main`. A positive Issue `N` then maps to `feature/issue-N`, `/workspace/snap-flow-issue-N`, and `snapflow-dev:issue-N`; closed Issue 77 remains an explicit compatibility record. Launch intent is persisted before tmux and launch failure becomes one bounded recoverable state; retry reconciles an absent/existing window without starting duplicates, then fails closed after the allowance.

The initial Codex prompt is repository-, Issue-, and phase-specific. It requires the live Issue, `AGENTS.md`, and OpenSpec configuration and permits only proposal/design/delta specs/tasks, Draft PR, commit/push, immutable evidence, and the exact approval request. Continuations enforce `/approve-spec`, review, `/accept` sync/archive, and separate `/merge` finalization in the same session. Structured terminal state—not prose, heartbeats, elapsed time, or process exit alone—is the controller completion boundary; missing artifact or GitHub verification must yield one concrete blocker.

Neo Dev may separately use the controller's existing authenticated GitHub integration for Issue and PR reads/writes. Private key and host-key contents remain external; only their fixed root-owned paths and endpoint are documented.

Issue 77 was explicitly authorized by the repository owner as a one-time workflow bootstrap. Future material artifact changes require new immutable links and `/approve-spec <new-sha>`; checkbox-only evidence updates do not invalidate an existing approval.

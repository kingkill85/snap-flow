## Context

See `proposal.md` for motivation. Commit `f05642f06e47b3405564c0acfa5a66a6f718a1e1` changed task creation to `--workspace dir:/opt/data/profiles/dev` and added natural-language SSH instructions. Post-acceptance review established that this correctly selects the controller card but does not structurally select the remote Issue window. The prior change is archived and canonical specs describe the accepted baseline, so this repair remains active until normal sync/archive gates.

Repository inspection confirms `TaskRunner` can pass only title, body, maximum runtime, workspace, and idempotency key to `task.py`; it has no project, tmux, worktree, branch, or worker fields. The trustworthy enforcement point is therefore a separate controller-installed project-control adapter invoked by Neo Dev on the `dir:/opt/data/profiles/dev` card. The adapter resolves a controller-owned issue-scoped registry and controls exact tmux state—not task prose and not a nested SSH probe from the container.

## Goals / Non-Goals

**Goals:**

- Make project execution structural, exact, issue-scoped, executable, and testable.
- Fail before any project command if governed controller binding or live state is unavailable or altered.
- Preserve durable task identity/idempotency and make retries reuse persisted resolution.
- Preserve the exact Codex session across correctable findings and bound any fresh-session recovery to one genuine-failure fallback.
- Represent process and semantic terminal state separately so exit code zero cannot mask a blocked or invalid result.
- Keep the post-archive repair and renewed approval sequence auditable.

**Non-Goals:**

- Provisioning or changing existing SSH registration, endpoint/port, host-key pin, client identity, container, secrets, ingress, deployment, or dispatcher.
- Allowing payload-, environment-, prose-, convention-, or caller-selected project coordinates or paths.
- Changing SnapFlow backend/frontend behavior or UI. Playwright UI review does not apply.
- Editing `openspec/changes/archive` or synchronizing canonical specs before acceptance.

## Decisions

### 1. Keep runner workspace scoped to the controller card

The task runner continues to pass literal `dir:/opt/data/profiles/dev` solely to select the controller Neo Dev orchestrator card. It does not describe that directory as the implementation workspace, accept an override, use `scratch`, or introduce unsupported `ssh:snapflow-dev`. Tests assert complete card-creation argv. Private endpoint coordinates and identity paths remain outside task text and repository artifacts.

### 2. Add an executable controller control-adapter boundary

After approval, repository tooling adds this versioned controller CLI contract:

`neo-dev-project-control <preflight|start|resume> --repository <owner/name> --issue-number <positive-int> --idempotency-key <canonical-uuid>`

Those are the complete caller-controlled fields. The adapter returns one JSON document containing operation, idempotency key, opaque resolution identifier, status, and non-secret governed identity. It never accepts project, session, window, worktree, branch, worker, command, cwd, host, port, or identity-path options. Inputs must have canonical forms.

The adapter owns an injected process boundary such as `ProcessExecutor.run(argv: Sequence[str], *, timeout: float)`. Production always invokes subprocesses with an argv sequence and `shell=False` or its platform equivalent. The adapter constructs fixed tmux inspection/control and Codex-launch argv; no caller string becomes shell syntax, a command, or a path. Tests inject fake executor, registry, and persistence implementations, assert complete argv, and prove no subprocess runs on validation failure.

This adapter is the sole project-command capability exposed to the controller card. Controller policy permits Neo Dev to invoke the adapter but denies direct Git, Codex, OpenSpec, package, test, shell, SSH, and tmux project control from the card. Task prose remains explanatory only. Neo Dev is the controller-only orchestrator; Codex is the sole implementation worker.

Non-secret controller work is in scope after approval: install the pinned adapter entry point from repository tooling, install its governed registry/policy, grant only its narrow invocation capability to the card, and verify version, ownership, and mode. Existing connection/provisioning facts remain untouched.

### 3. Resolve governed repo+issue through a controller-owned registry

The registry key is the validated exact `(repository, issue_number)` pair. Each record contains exact project, session, window, worktree, branch, and sole worker. It is controller-owned and non-caller-overridable, not sourced from payload coordinate fields, task prose, environment overrides, naming conventions, or caller arguments. Unknown keys and missing, duplicate, conflicting, or mismatched records fail closed; there is no Issue 77 fallback and paths are never derived.

Before `start`, the adapter transactionally persists the full immutable resolved record with the canonical idempotency key. Retried `start` and `resume` load that persisted resolution and reject absence, conflict, or registry drift. Preflight verifies exact live tmux window, worktree, branch, and sole-worker topology before any project command.

The same controller-owned record contains `codex_session_id` (canonical UUID once known), `process_generation` (starting at zero), `restart_count` (zero or one), `phase`, and `terminal`. `phase` is one of `never_started`, `active`, `exited_resumable`, `correctable`, `semantic_success`, `semantic_blocked`, `crashed`, or `failed_closed`. `terminal`, when present, is a document containing the observed exit code, trusted semantic outcome (`success`, `correctable`, `blocked`, `crashed`, or `invalid`), and resumability. State updates use the same lock/atomic-replace boundary as resolution persistence and reject illegal or stale transitions.

Codex session identity is learned from controller-owned Codex session metadata after launch and must match the governed worktree and live process before it is persisted; callers cannot submit it. An active correctable state uses fixed argv-only tmux steering against the existing pane, without spawning a process. If the process has exited and the exact UUID remains resumable, the adapter uses the supported fixed form `codex resume <session-id>` in the governed pane/worktree. It never uses `--last`, a picker, a caller session, or derived session identity.

A fresh `codex` launch is legal only from `never_started`, or once from trusted `crashed`/missing-or-unusable-resumable state after atomically changing `restart_count` from zero to one and incrementing `process_generation`. Any ambiguity, stale active marker, untrusted terminal observation, or second fallback becomes `failed_closed` before launch. Exit code zero updates only the process observation; `semantic_success` requires a separate trusted structured completion transition, so prose containing blockers or an invalid/missing completion record cannot be accepted as success.

The live-verified Issue 77 record is project `snapflow-dev`, session `snapflow-dev`, window `issue-77`, worktree `/workspace/snap-flow-issue-77`, branch `chore/issue-77-openspec-workflow`, and worker `Codex`. Window `snapflow-dev:0` is prohibited because it runs the backend. A `devsnapflow-worker` is prohibited. Controller-pinned connection facts remain authoritative, so no nested SSH discovery or host-key probe runs from the container.

### 4. Keep controller GitHub integration separate

The task may use the controller's authenticated GitHub integration only through the existing documented boundary for Issue/PR reads and writes. That exception does not authorize repository commands in the controller card. Git, Codex, OpenSpec, package, lint, and test commands execute through Codex in the resolved tmux window from the exact worktree and branch.

### 5. Prove creation, continuation, failure, and retry behavior

Focused tests emulate current `task.py` help and stable JSON output. They assert exact card argv and adapter CLI/output; inject registry, persistence, session-state, and process boundaries; assert exact tmux/Codex argv for Issue 77; reject unknown/missing/conflicting/mismatched records, derived paths, extra coordinate options, `snapflow-dev:0`, `ssh:snapflow-dev`, and `devsnapflow-worker` before subprocess; and prove retries/resume reuse persisted resolution and the original idempotency key. Additional state-machine tests assert exact atomic transitions, same-process steering for active correctable findings, exact `codex resume <session-id>` for exited resumable work, rejection of exit-zero blocker/invalid results as success, and no more than one fresh-session fallback. Existing security/durability coverage remains a regression gate.

### 6. Preserve archive and canonical-spec sequencing

The archived `2026-08-06-issue-77-governed-webhook-handoff` directory is immutable historical evidence. The narrow repair exception reuses the same governed Issue, branch, worktree, and Draft PR while permitting one active repair delta. It permits neither concurrent repair nor bypass of fresh approval. After fresh approval, implementation, verification, independent review, and `/accept`, the delta is synchronized and archived before a separate merge request.

## Risks / Trade-offs

- [Controller installation may not support the proposed narrow capability] → Task 1.2 records repository-side interface discovery before approval. Installation verification after approval fails closed and requires a new approval if the pinned adapter/policy cannot be installed as designed.
- [The registered project can drift] → Persist resolution, compare registry and live state on preflight/resume, and fail closed; endpoint/port/host-key/identity remain private controller configuration.
- [A registry is operational policy] → Keep it controller-owned and non-secret, require explicit governed records, and treat record changes as material approval-bound changes.
- [Codex process state and semantic outcome diverge] → Persist both separately, require trusted structured completion, continue by exact UUID, and fail closed on ambiguous state or exhausted restart allowance.
- [Documentation can get ahead of implementation] → Pre-approval evidence labels behavior proposed; the runbook changes only during approved apply with runtime tests.

## Migration Plan

1. Obtain `/approve-spec <full-sha>` for this active change.
2. Add failing tests for card creation, adapter API, registry/persistence, exact control binding, prohibited values/topologies, retry preservation, same-session continuation, semantic completion, and the single-restart ceiling.
3. Implement the adapter, Issue 77 registry record, structured session/execution persistence, and injected safe-argv process boundary under repository tooling.
4. Install the non-secret adapter and narrow card capability policy on the controller; verify version/ownership/mode without changing existing SSH registration, host key, client identity, secrets, ingress, dispatcher, or container provisioning.
5. Update operator documentation without publishing private network coordinates or identity paths.
6. Run strict OpenSpec validation, focused tooling tests, required lint/tests, and independent code/test review; UI review remains not applicable.
7. After `/accept`, sync this delta into canonical specs and archive this active change. Request `/merge` separately.

Rollback before merge is a normal revert of repair implementation and removal of the non-secret adapter/policy installation while keeping active evidence. No deployment or privileged connection configuration change is part of this plan.

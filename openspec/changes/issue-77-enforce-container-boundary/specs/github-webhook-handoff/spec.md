## MODIFIED Requirements

### Requirement: Durable asynchronous coalesced handoff
The receiver SHALL atomically persist delivery, wakeup, and active work before responding, and SHALL never run long work. Canonical `X-GitHub-Delivery` SHALL be the downstream idempotency key. Concurrent events for one repo+issue SHALL append wakeups to one active task. Durable Kanban creation and persistence of its returned task ID SHALL be the external handoff boundary; dispatcher wake-up is best effort because the gateway provides an embedded dispatcher. The task runner SHALL use `dir:/opt/data/profiles/dev` only for the controller Neo Dev orchestrator card and SHALL NOT use unsupported workspace `ssh:snapflow-dev`.

Neo Dev on that card SHALL invoke a controller-installed project-control adapter as its sole project-command capability. The adapter SHALL accept only operation (`preflight`, `start`, or `resume`), validated governed repository, positive issue number, and canonical idempotency key; resolve repository+issue through a controller-owned non-caller-overridable allowlist/registry; persist the exact resolved record with that idempotency key before launch; and use safe argv without shell interpolation to preflight and launch/control the sole Codex worker in the resolved tmux window. Callers and task prose SHALL NOT provide, derive, or override project/session/window/worktree/branch/worker/path values. Unknown, missing, conflicting, ambiguous, or mismatched registry, persisted, or live state SHALL fail closed before a project command. Resume and retry SHALL reuse the persisted resolved record and original idempotency key. Private endpoint, port, host-key, and client-identity details SHALL remain controller-only.

#### Scenario: Replay and concurrency
- **WHEN** deliveries repeat, race, or arrive while work is active
- **THEN** delivery replay is deduplicated and at most one active task exists per repo+issue

#### Scenario: Exact Issue implementation target is selected
- **WHEN** eligible SnapFlow Issue 77 work reaches downstream card creation
- **THEN** the card uses `dir:/opt/data/profiles/dev`, Neo Dev calls the adapter with only governed repo+issue+idempotency inputs, the controller resolves project `snapflow-dev`, tmux target `snapflow-dev:issue-77`, worktree `/workspace/snap-flow-issue-77`, branch `chore/issue-77-openspec-workflow`, and sole worker Codex, and Codex alone performs repository work there

#### Scenario: Another governed issue is not rebound to Issue 77
- **WHEN** an eligible event names a repo+issue other than a controller-registered governed key
- **THEN** the adapter rejects it without deriving paths, falling back to Issue 77, or launching a worker

#### Scenario: Container boundary cannot be established
- **WHEN** the registry record, persisted resolution, exact session/window/worktree/branch, or sole-worker topology is missing, conflicting, different, ambiguous, or overridden
- **THEN** preflight/start/resume fails closed before project commands without using `snapflow-dev:0`, an alternate workspace, or a `devsnapflow-worker`

#### Scenario: Resume preserves the boundary
- **WHEN** an existing governed task is resumed or retried
- **THEN** the adapter reloads the persisted resolution and execution remains bound to the same exact target and original idempotency key, rejecting registry drift or a conflicting persisted record

#### Scenario: Controller connection facts are already verified
- **WHEN** implementation starts or resumes in the registered project
- **THEN** controller-pinned connection facts are authoritative, no nested SSH probe runs inside the container, and private coordinates and identity paths are not emitted to public artifacts

### Requirement: Generic persistent Issue lifecycle
For the registered SnapFlow project, the controller SHALL derive validated, collision-free branch, worktree, and tmux-window coordinates from a positive integer Issue number while retaining explicit Issue 77 compatibility. Initial start SHALL fetch `origin/main`, idempotently create or verify the issue branch/worktree without modifying main, and create exactly one worker window. All later trusted commands SHALL reuse the original durable task, idempotency key, target, and Codex session. Project concurrency SHALL initially be one.

#### Scenario: Issue 13 and another issue are isolated
- **WHEN** Issue 13 and another positive Issue are eligible
- **THEN** each derives distinct safe coordinates, Issue 13 starts first, and the later Issue remains durably queued

#### Scenario: Full command lifecycle continues
- **WHEN** `/approve-spec <sha>`, findings, `/accept`, and `/merge` arrive in order
- **THEN** the same workflow advances through implementation, review, sync/archive, separate merge authorization, merge, closure, and cleanup without a duplicate worker or session

### Requirement: Trusted host adapter and bounded completion
The controller card SHALL invoke a fixed host adapter using the registered SSH host/user, identity, pinned known-hosts, strict host checking, `shell=False`, and strict argv validation. It SHALL permit only the installed remote project controller. Task and Codex prompts SHALL be phase-specific and self-contained. Semantic completion SHALL require structured controller state plus repository and GitHub artifact verification; a heartbeat SHALL never count as progress or completion.

#### Scenario: Initial label is specification only
- **WHEN** a new Issue is labeled `neo-dev`
- **THEN** Codex creates only OpenSpec planning artifacts, a Draft PR, immutable evidence, and the exact approval request, then stops before implementation

#### Scenario: Prerequisite is missing
- **WHEN** a phase prerequisite or artifact verification is absent or ambiguous
- **THEN** the workflow fails fast with one concrete blocker rather than heartbeat-waiting

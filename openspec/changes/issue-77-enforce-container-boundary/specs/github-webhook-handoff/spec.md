## MODIFIED Requirements

### Requirement: Durable asynchronous coalesced handoff
The receiver SHALL atomically persist delivery, wakeup, and active work before responding, and SHALL never run long work. Canonical `X-GitHub-Delivery` SHALL be the downstream idempotency key. Concurrent events for one repo+issue SHALL append wakeups to one active task. Durable Kanban creation and persistence of its returned task ID SHALL be the external handoff boundary; dispatcher wake-up is best effort because the gateway provides an embedded dispatcher. The task runner SHALL use `dir:/opt/data/profiles/dev` only for the controller Neo Dev orchestrator card and SHALL NOT use unsupported workspace `ssh:snapflow-dev`.

Neo Dev on that card SHALL invoke a controller-installed project-control adapter as its sole project-command capability. The adapter SHALL accept only operation (`preflight`, `start`, or `resume`), validated governed repository, positive issue number, and canonical idempotency key; resolve repository+issue through a controller-owned non-caller-overridable allowlist/registry; persist the exact resolved record with that idempotency key before launch; and use safe argv without shell interpolation to preflight and launch/control the sole Codex worker in the resolved tmux window. Callers and task prose SHALL NOT provide, derive, or override project/session/window/worktree/branch/worker/path values. Unknown, missing, conflicting, ambiguous, or mismatched registry, persisted, or live state SHALL fail closed before a project command. Resume and retry SHALL reuse the persisted resolved record and original idempotency key. Private endpoint, port, host-key, and client-identity details SHALL remain controller-only.

The controller SHALL additionally persist the active Codex session UUID, process generation, restart count, and structured execution phase and terminal observation with the governed resolution. Execution phases SHALL distinguish at least `never_started`, `active`, `exited_resumable`, `correctable`, `semantic_success`, `semantic_blocked`, `crashed`, and `failed_closed`; terminal observation SHALL record exit code separately from trusted semantic outcome and resumability. Only a trusted controller transition MAY record semantic success. Textual output and exit code zero SHALL NOT imply semantic success.

For a correctable finding while Codex is active, `resume` SHALL steer the same tmux pane, process, and session without launching or resuming another Codex process. If that exact process has exited and its persisted session UUID is usable, `resume` SHALL invoke the supported `codex resume <session-id>` interface for that UUID. A new Codex session MAY start only when trusted structured state establishes a genuine crash or the persisted session is missing or unusable, and only when the persisted restart count is zero; that fallback SHALL atomically increment the count before launch and SHALL never occur more than once. Ambiguous process/session state, absent trusted semantic state, session drift, or a second fallback request SHALL fail closed.

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
- **THEN** the adapter reloads the persisted resolution, Codex session UUID, and structured execution state and execution remains bound to the same exact target and original idempotency key, rejecting registry drift or a conflicting persisted record

#### Scenario: Correctable finding preserves the active worker
- **WHEN** a trusted correctable finding arrives while the governed Codex process and session are active
- **THEN** `resume` steers that same pane, process, and session and launches no second Codex process or worker

#### Scenario: Exited Codex session is resumed exactly
- **WHEN** the governed Codex process exited without semantic success and its persisted session UUID remains usable
- **THEN** `resume` continues exactly that UUID through `codex resume <session-id>` and does not start a fresh session

#### Scenario: Fresh-session fallback is bounded
- **WHEN** trusted state proves a genuine crash or a missing or unusable resumable session
- **THEN** the adapter may atomically consume the sole restart allowance and start one fresh Codex session, while any later fallback request fails closed before launch

#### Scenario: Process success is not semantic success
- **WHEN** Codex exits with code zero but reports a blocker, correctable finding, invalid terminal result, or no trusted structured completion decision
- **THEN** persisted state is not `semantic_success` and controller completion remains blocked

#### Scenario: Controller connection facts are already verified
- **WHEN** implementation starts or resumes in the registered project
- **THEN** controller-pinned connection facts are authoritative, no nested SSH probe runs inside the container, and private coordinates and identity paths are not emitted to public artifacts

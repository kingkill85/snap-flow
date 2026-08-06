# Issue 77 container-boundary approval evidence

## Gate status

The authorized human approver relayed `/approve-spec 1843b3ddfe8433d05817c3f94bb9edbc39e96124` through Neo. Repository-side implementation is underway from that exact approved revision. Canonical specs and archived artifacts remain unchanged pending the separate acceptance, sync, and archive gates.

The active repair change is `issue-77-enforce-container-boundary` on Issue #77's existing non-main branch, worktree, and Draft PR #78. The historical `openspec/changes/archive/2026-08-06-issue-77-governed-webhook-handoff` tree is read-only.

## Defect evidence

Commit `f05642f06e47b3405564c0acfa5a66a6f718a1e1` passes `--workspace dir:/opt/data/profiles/dev` to the private task runner. That workspace is valid only for the controller Neo Dev orchestrator card; it is not the SnapFlow implementation workspace. Its task body asks the agent to use the registered `snapflow-dev` project, but prose does not structurally bind implementation control to the exact Issue window. The current operator runbook still shows `--workspace scratch`, so implementation and documentation also disagree.

Concrete interface discovery found that `tools/neo_dev_webhook/automation.py::TaskRunner` validates and invokes `task.py` with only title, body, maximum runtime, workspace, and idempotency key. It has no project, tmux, worktree, branch, or worker fields, so `task.py` and task prose cannot be the enforcement point.

The amended packet instead defines `neo-dev-project-control <preflight|start|resume> --repository --issue-number --idempotency-key`, installed on the controller after approval and invoked by Neo Dev as the card's sole project-command capability. A controller-owned, non-caller-overridable registry maps validated governed repo+issue keys to exact coordinates, persists the resolved record with the idempotency key, and uses an injected safe-argv process boundary to preflight and launch/control the sole Codex worker in tmux. Unknown, missing, conflicting, or mismatched records and caller coordinate/path overrides fail before subprocess execution; retries and resume reuse the persisted resolution and original key.

The live-verified Issue 77 record is project `snapflow-dev`, tmux target `snapflow-dev:issue-77`, worktree `/workspace/snap-flow-issue-77`, branch `chore/issue-77-openspec-workflow`, and sole worker Codex. There is no fallback binding of other issues to Issue 77 and no `devsnapflow-worker`. The registered OpenSSH endpoint, port, pinned host key, and dedicated client identity remain controller-private verified configuration; they are neither probed from this container nor published in the repository.

## Approval-bound artifacts

- `openspec/changes/issue-77-enforce-container-boundary/proposal.md`
- `openspec/changes/issue-77-enforce-container-boundary/design.md`
- `openspec/changes/issue-77-enforce-container-boundary/specs/github-webhook-handoff/spec.md`
- `openspec/changes/issue-77-enforce-container-boundary/specs/governed-development-workflow/spec.md`
- `openspec/changes/issue-77-enforce-container-boundary/tasks.md`

The approved artifacts are pinned to full revision `1843b3ddfe8433d05817c3f94bb9edbc39e96124`. Publishing final implementation and review links remains a later Neo Dev step after this repository commit and independent review.

## Approved baseline verification

These commands were recorded for the approved planning baseline. The implementation verification section below supersedes the earlier focused-test count.

- `OPENSPEC_TELEMETRY=0 npm exec -- openspec status --change issue-77-enforce-container-boundary`: **4/4 planning artifacts complete**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --all --strict`: **3/3 items passed** (two canonical specs and the active repair change).
- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **51/51 passed**.
- `python3 tools/openspec_archive_guard.py issue-77-enforce-container-boundary --root .`: **blocked as required** because both active deltas are intentionally unsynchronized before approval/acceptance.
- `git diff --exit-code -- openspec/changes/archive`: **passed**; archived artifacts are unchanged.

Interface discovery used `rg` and source inspection of `tools/neo_dev_webhook/automation.py`, `consumer.py`, `server.py`, and focused tests. It confirmed the current subprocess boundary is argv-based and test-injected through `subprocess.run`, while the new adapter needs explicit executor, registry, and persistence seams. This completed task 1.2 before the amended approval commit without inspecting controller secrets or private coordinates.

## Repository-side implementation verification

Exact post-implementation commands and outcomes:

- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **63/63 passed**. This includes the complete webhook/archive regression suite and focused project-control tests for the narrow CLI, injected registry/store/executor, exact Issue 77 argv, persisted retries, and fail-closed invalid or mismatched state.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict --no-interactive`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --all --strict --no-interactive`: **3 passed, 0 failed**.
- `python3 tools/openspec_archive_guard.py issue-77-enforce-container-boundary --root .`: **blocked as required** because the active delta specs remain intentionally unsynchronized before acceptance.
- `git diff --exit-code -- openspec/changes/archive`: **passed**; archived artifacts are unchanged.
- `cd backend && deno lint`: **passed**, 141 files checked.
- `cd frontend && npm run lint`: **passed**.
- `cd frontend && npm run test:run`: **37 test files passed, 264 tests passed**.
- `cd backend && deno task test`: **327 passed (146 steps), 1 failed**. The sole failure is `ExcelSyncService - import only deactivates missing items from the selected product type` at `backend/tests/services/excel-sync_test.ts:207`, with actual `false` and expected `true`. This is the identical clean-`main` baseline failure documented and explicitly accepted for Issue 77 in `docs/issue-77-review-fix-evidence.md`; this repair does not modify the Excel sync source or tests. The backend suite is not reported as green, and there are no new failures.
- `git diff --check`: **passed**.

### Installed runtime wiring correction

Independent review found that the initial production path launched plain `codex` and therefore could not invoke its internal observation methods. The adapter now launches the installed private `neo-dev-codex-runtime` supervisor by fixed argv. The supervisor owns Codex app-server over stdio, persists the UUID returned by `thread/start` or exact `thread/resume`, supplies the strict output schema, and persists terminal status directly. Active continuation reaches the same process/thread through `turn/steer`. The helper is mode `0750`, is absent from the card allowlist, accepts no governed coordinates or semantic-outcome arguments, and does not weaken the sole-capability policy.

- `PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_project_control tools.neo_dev_webhook.tests.test_codex_runtime -v`: **25/25 passed**. The runtime cases exercise the public `start` launch argv through session persistence and terminal capture, same-turn steering, strict completion validation, nonzero-exit rejection of nominal success, and resumable crash persistence.
- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **77/77 passed**.
- Controller and runtime Python compilation plus both installed entrypoint `--help` checks: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict --no-interactive`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --all --strict --no-interactive`: **3 passed, 0 failed**.
- `git diff --exit-code 1843b3ddfe8433d05817c3f94bb9edbc39e96124 -- openspec/changes/issue-77-enforce-container-boundary`: **passed**; every approved artifact and checkbox remains byte-identical.
- `git diff --exit-code -- openspec/changes/archive`: **passed**.
- `cd backend && deno lint`: **passed**, 141 files checked.
- `cd frontend && npm run lint`: **passed**.
- `cd frontend && npm run test:run`: **37 test files passed, 264 tests passed**.
- `cd backend && deno task test`: **327 passed (146 steps), 1 known baseline failure** at `backend/tests/services/excel-sync_test.ts:207` (`false` actual, `true` expected); no changed file touches that subsystem and the suite is not reported as green.
- `git diff --check`: **passed**.

### Governed-account install and process-topology correction

The second runtime/install review identified that root-owned `0750` runtime/state paths could not serve the governed `dev` account and that tmux reports interpreter-backed entrypoints as `python3`. The manifest now assigns only the private helper and state directory to `dev:dev` mode `0750`; the public allow-list remains unchanged. Active preflight validates exact adapter-created `pane_start_command`, pane PID, and the sole direct Codex v0.146.1 app-server child rather than broadly allowing Python. Runtime cleanup closes stdin and reaps the app-server on both completion and exceptions.

Exact correction verification:

- Governed-account installed-path smoke: **passed** as `uid=1000(dev) gid=1000(dev)`. A temporary install root reproduced the manifest layout; both staged entrypoints imported, the `dev:dev 0750` runtime was executable, the `dev:dev 0750` state directory was writable/traversable, and `FileResolutionStore` atomically created its state file.
- Codex protocol/process smoke: **passed** with `codex-cli 0.146.1`. App-server returned an initialize result containing `codexHome`, `platformFamily`, `platformOs`, and `userAgent`; `initialized` was sent; stdin was closed; and the child exited `0`. No `thread/start`, `thread/resume`, or turn request was sent. Read-only process metadata showed exact child command `node /usr/local/bin/codex app-server --stdio`.
- Read-only live tmux inspection: **passed** and confirmed `pane_current_command` reflects the interpreter/wrapper rather than a trustworthy worker identity, motivating exact start-command/PID/tree validation.
- `PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_project_control tools.neo_dev_webhook.tests.test_codex_runtime -v`: **28/28 passed**.
- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **80/80 passed**.
- Python compilation for controller/runtime and focused tests: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict --no-interactive`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --all --strict --no-interactive`: **3 passed, 0 failed**.
- Approved packet comparison to `1843b3ddfe8433d05817c3f94bb9edbc39e96124`: **passed byte-for-byte**.
- Archived OpenSpec tree comparison: **passed**.
- `cd backend && deno lint`: **passed**, 141 files checked.
- `cd frontend && npm run lint`: **passed**.
- `cd frontend && npm run test:run`: **37 test files passed, 264 tests passed**.
- `cd backend && deno task test`: **327 passed (146 steps), 1 known baseline failure** at `backend/tests/services/excel-sync_test.ts:207` (`false` actual, `true` expected); this correction does not touch that subsystem and the suite is not reported as green.
- `git diff --check`: **passed**.

### Dead-pane resume compatibility correction

Live installed-path testing against tmux 3.4 showed that a dead remain-on-exit pane has `pane_dead=1` while `pane_current_path` is empty. Inactive preflight now validates a sole dead pane and numeric PID first, ignores the non-authoritative dead-pane path field, and independently verifies the fixed registered worktree/branch before fixed-`-c` respawn. Focused coverage reproduces the empty-path output and rejects live or ambiguous panes before any respawn. Active-pane path/start-command/process-tree checks are unchanged.

Exact verification:

- `PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_project_control tools.neo_dev_webhook.tests.test_codex_runtime -v`: **29/29 passed**.
- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **81/81 passed**.
- Controller and focused-test Python compilation: **passed**.
- Strict active-change OpenSpec validation: **passed**; strict all validation: **3 passed, 0 failed**.
- Approved packet comparison to `1843b3ddfe8433d05817c3f94bb9edbc39e96124`: **passed byte-for-byte**; archived OpenSpec tree comparison: **passed**.
- `cd backend && deno lint`: **passed**, 141 files checked.
- `cd frontend && npm run lint`: **passed**.
- `cd frontend && npm run test:run`: **37 test files passed, 264 tests passed**.
- `cd backend && deno task test`: **327 passed (146 steps), 1 known baseline failure** at `backend/tests/services/excel-sync_test.ts:207` (`false` actual, `true` expected); no changed file touches that subsystem and the suite is not reported as green.
- `git diff --check`: **passed**.

No frontend behavior changed, so an independent Playwright UI review is not applicable. Independent code/test review and controller installation/preflight remain assigned to Neo Dev and are not claimed here.

### Same-session continuation correction

The approved OpenSpec directory is restored byte-for-byte to revision `1843b3ddfe8433d05817c3f94bb9edbc39e96124`; the erroneous planning-artifact edit is reversed by the implementation follow-up and no approved checkbox is claimed. Repository tooling now persists the controller-observed Codex session UUID and structured execution/terminal state, steers an active correctable session in place, resumes an exited usable session by exact UUID, separates process exit from trusted semantic success, and permits at most one atomically recorded fresh-session fallback. Exact verification outcomes are recorded here after the correction commands complete.

- `PYTHONPATH=tools python3 -m unittest tools.neo_dev_webhook.tests.test_project_control -v`: **18/18 passed**.
- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **70/70 passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict --no-interactive`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --all --strict --no-interactive`: **3 passed, 0 failed**.
- `git diff --exit-code 1843b3ddfe8433d05817c3f94bb9edbc39e96124 -- openspec/changes/issue-77-enforce-container-boundary`: **passed**; every approved artifact and checkbox is byte-identical.
- `python3 tools/openspec_archive_guard.py issue-77-enforce-container-boundary --root .`: **blocked as required** because the approved active deltas remain unsynchronized before acceptance.
- `git diff --exit-code -- openspec/changes/archive`: **passed**.
- `cd backend && deno lint`: **passed**, 141 files checked.
- `cd frontend && npm run lint`: **passed**.
- `cd frontend && npm run test:run`: **37 test files passed, 264 tests passed**.
- `cd backend && deno task test`: **327 passed (146 steps), 1 known baseline failure** at `backend/tests/services/excel-sync_test.ts:207` (`false` actual, `true` expected); no changed file touches that subsystem and the suite is not reported as green.
- `python3 -m py_compile tools/neo_dev_webhook/project_control.py tools/neo_dev_webhook/tests/test_project_control.py`: **passed**.
- `git diff --check`: **passed**.

## Scope boundary

No product backend/frontend behavior or UI changed, so Playwright review is not applicable. Controller installation and preflight are owned by Neo Dev through its trusted operator path. This repository-side work does not probe or change private connection facts or controller state. Push is authorized for Draft PR #78; merge, release, deployment, public ingress, secret/access changes, dispatcher changes, container provisioning, destructive operations, canonical-spec sync, and archive remain prohibited or separately gated.

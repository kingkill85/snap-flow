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

No frontend behavior changed, so an independent Playwright UI review is not applicable. Independent code/test review and controller installation/preflight remain assigned to Neo Dev and are not claimed here.

## Scope boundary

No product backend/frontend behavior or UI changed, so Playwright review is not applicable. Controller installation and preflight are owned by Neo Dev through its trusted operator path. This repository-side work does not probe or change private connection facts or controller state. Push is authorized for Draft PR #78; merge, release, deployment, public ingress, secret/access changes, dispatcher changes, container provisioning, destructive operations, canonical-spec sync, and archive remain prohibited or separately gated.

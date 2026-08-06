# Issue 77 container-boundary approval evidence

## Gate status

This document describes an approval-pending repair. Runtime behavior, the operator runbook, canonical specs, and archived artifacts have not been changed by this packet. Implementation must not begin until the authorized human approver relays the exact `/approve-spec <full-commit-sha>` through Neo.

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

Immutable GitHub blob links and the exact approval command are added to Issue #77 only after this packet passes strict validation, independent review, and is committed and pushed.

## Pre-approval verification

Exact command outcomes are recorded here before commit. Current tests are regression evidence only: they confirm the accepted baseline still behaves as implemented; they do not prove the proposed boundary until the approved RED/GREEN tasks are applied.

- `OPENSPEC_TELEMETRY=0 npm exec -- openspec status --change issue-77-enforce-container-boundary`: **4/4 planning artifacts complete**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate issue-77-enforce-container-boundary --strict`: **passed**.
- `OPENSPEC_TELEMETRY=0 npm exec -- openspec validate --all --strict`: **3/3 items passed** (two canonical specs and the active repair change).
- `PYTHONPATH=tools python3 -m unittest discover -s tools/neo_dev_webhook/tests -v`: **51/51 passed**.
- `python3 tools/openspec_archive_guard.py issue-77-enforce-container-boundary --root .`: **blocked as required** because both active deltas are intentionally unsynchronized before approval/acceptance.
- `git diff --exit-code -- openspec/changes/archive`: **passed**; archived artifacts are unchanged.

Interface discovery used `rg` and source inspection of `tools/neo_dev_webhook/automation.py`, `consumer.py`, `server.py`, and focused tests. It confirmed the current subprocess boundary is argv-based and test-injected through `subprocess.run`, while the new adapter needs explicit executor, registry, and persistence seams. This completed task 1.2 before the amended approval commit without inspecting controller secrets or private coordinates.

## Scope boundary

No product backend/frontend behavior or UI changes are planned, so Playwright review is not applicable. Only future non-secret controller adapter installation and narrow capability-policy work is in implementation scope. No runtime edit in this packet, push, merge, release, deployment, public ingress, secret/access change, existing SSH registration/host-key/client-identity change, dispatcher change, container provisioning, destructive operation, canonical-spec sync, or archive operation is authorized.

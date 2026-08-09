# Governed Development Workflow Specification

## Purpose

Defines auditable approval, state, evidence, and archive gates.

## Requirements

### Requirement: One-to-one identity and immutable approval
Each effort SHALL use one Issue, OpenSpec change, non-main branch, worktree, and Draft PR with full-40-character-SHA artifact links and `/approve-spec <sha>` from the authorized human approver through Neo.

After approval, the approved proposal, design, delta specifications, and task acceptance/scope/order SHALL be byte-frozen. Neo Dev SHALL record implementation progress, evidence, review findings, corrections, and blockers in Kanban rather than modifying approved OpenSpec files.

#### Scenario: Checkbox-only update
- **WHEN** implementation or review progress changes without a material planning change
- **THEN** progress is recorded in Kanban and the approved OpenSpec artifacts remain byte-identical

#### Scenario: Material artifact update
- **WHEN** proposal, design, requirement, scenario, task scope/order/acceptance, or approach materially changes
- **THEN** apply stops, `needs-approval` replaces the current phase, new immutable links are published, and `/approve-spec <new-sha>` is required

### Requirement: Mutually exclusive workflow states
Eligibility SHALL use `neo-dev`; `needs-input`, `needs-approval`, `in-progress`, `ready-for-review`, and `blocked` SHALL be mutually exclusive phase labels.

#### Scenario: Phase transition
- **WHEN** the workflow changes phase
- **THEN** the prior phase label is removed as the new one is applied

#### Scenario: Eligibility removed
- **WHEN** `neo-dev` is removed
- **THEN** every phase label is removed

### Requirement: Fail-closed phase reconciliation
Before reporting a Neo Dev gate or Kanban task complete, Neo Dev SHALL map its internal phase to the linked Issue, replace all mutually exclusive phase labels while preserving non-phase labels, re-fetch GitHub, and prove the exact expected phase label. Current mappings SHALL be `awaiting_input` to `needs-input`; `awaiting_spec_approval`, `awaiting_privileged_approval`, and `awaiting_merge_approval` to `needs-approval`; `implementation_in_progress` to `in-progress`; `ready_for_review` to `ready-for-review`; and `blocked` or `non_convergent` to `blocked`.

#### Scenario: Synchronization cannot be proven
- **WHEN** label mutation or re-fetch verification fails
- **THEN** Neo Dev invokes `kanban_block` with the failure and SHALL NOT invoke `kanban_complete`

### Requirement: Bounded review convergence
Neo Dev SHALL bundle and adjudicate independent review findings before each correction round. No more than two unsuccessful correction-and-review rounds SHALL be attempted for one implementation; failure to converge after the second SHALL transition the task to `non_convergent`, reconcile the Issue to `blocked`, and record the unresolved findings.

#### Scenario: Second correction round remains unclean
- **WHEN** fresh review after the second correction round still has required findings
- **THEN** Neo Dev blocks as non-convergent instead of starting another correction round

### Requirement: Evidence-backed completion
Tasks SHALL remain incomplete until concrete implementation or command/review evidence exists. Apply, verification, relevant suites, independent code/test review, and UI review when UI changes SHALL precede acceptance.

#### Scenario: Automation-only review
- **WHEN** no UI behavior changes
- **THEN** Playwright is recorded as not applicable with that reason

#### Scenario: Pre-existing baseline failure
- **WHEN** a project test fails identically on clean `main` in the same environment, the PR does not touch that subsystem, focused changed-scope tests pass, and CI evidence is recorded
- **THEN** the failure is documented as pre-existing rather than called green, and the verification task remains open until the authorized human explicitly accepts that baseline exception

### Requirement: Hard synchronized archive gate
The change SHALL not archive until strict OpenSpec validation succeeds and every recognized delta spec is synced. Malformed or unknown delta operations SHALL fail closed, generic/generated archive paths SHALL have no bypass, and a no-delta archive SHALL require OpenSpec to report the specs artifact as skipped.

#### Scenario: Delta is unsynced
- **WHEN** archive is attempted
- **THEN** the hard guard fails before the change is moved

### Requirement: Separate privileged authority
Acceptance SHALL NOT authorize merge. Sync/archive SHALL precede a separate merge decision, and only the authorized human approver through Neo may authorize merge, release, deployment, secrets/access, or destructive production operations.

#### Scenario: Acceptance occurs
- **WHEN** `/accept` is recorded without a separate authorized `/merge`
- **THEN** no merge or privileged operation is permitted

### Requirement: 2026-08-08 persistent Neo Dev self-bootstrap
The repository SHALL record the authorized human's explicit 2026-08-08 one-time authorization for the persistent Neo Dev self-bootstrap directly on `main`, without weakening any later approval or privileged-operation gate.

#### Scenario: Later material change occurs
- **WHEN** any future issue or later material artifact change needs approval
- **THEN** the normal immutable approval gate applies without a bootstrap exception

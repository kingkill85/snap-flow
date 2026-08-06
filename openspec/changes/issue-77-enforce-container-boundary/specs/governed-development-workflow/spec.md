## ADDED Requirements

### Requirement: Archived artifacts are immutable repair inputs
Archived OpenSpec artifacts SHALL remain immutable. As a narrow exception to the one-change identity rule, a material defect discovered after archive in the same unmerged effort MAY be corrected by one active repair delta linked to the same governed Issue, branch, worktree, and Draft PR. The exception SHALL NOT permit archive edits, concurrent active repairs, a second implementation worker, or bypass of fresh full-SHA approval. Canonical specifications SHALL be updated only by synchronizing that active delta after its implementation and acceptance gates succeed.

#### Scenario: Post-archive material defect
- **WHEN** review finds that accepted or implemented behavior differs materially from an archived design or requirement
- **THEN** the archived files remain unchanged, exactly one active repair change records the delta while reusing the Issue/branch/worktree/Draft PR, `needs-approval` is selected, and implementation stops pending `/approve-spec <full-commit-sha>` from the authorized human approver through Neo

#### Scenario: Repair exception boundary
- **WHEN** the original effort is already merged, another repair is active, or the requested work is a distinct effort rather than a repair of the archived unmerged effort
- **THEN** the narrow exception does not apply and the normal one-to-one governed workflow is required

#### Scenario: Repair is not yet accepted
- **WHEN** an active repair delta is approval-ready but has not completed implementation, verification, independent review, and acceptance
- **THEN** its requirements are not synchronized into canonical specs and the repair change is not archived

### Requirement: Governed controller bindings are explicit and issue-scoped
Canonical webhook handling SHALL treat repository+issue as a validated governed identity, not as an alias for a single historical issue. Project execution SHALL be authorized only by a controller-owned, non-caller-overridable registry record keyed by that identity and containing the exact project, session, window, worktree, branch, and sole implementation worker. Neo Dev SHALL remain the controller-only orchestrator and Codex SHALL remain the sole implementation worker.

#### Scenario: Registered governed identity
- **WHEN** an eligible webhook work item reaches controller project dispatch
- **THEN** its validated repository+issue resolves to exactly one controller record and the resolution is persisted with the canonical idempotency key before project execution

#### Scenario: Unregistered or inconsistent identity
- **WHEN** no record exists, multiple or conflicting facts exist, live state mismatches the record, or a caller attempts to supply or override a coordinate
- **THEN** controller dispatch fails closed without deriving a worktree, branch, tmux target, or worker from payload or task prose

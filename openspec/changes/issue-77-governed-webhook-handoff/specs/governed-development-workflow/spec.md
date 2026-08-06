## Purpose

Defines the approval and authority gates that keep issue-driven development auditable, reviewable, and separated from privileged operations.

## ADDED Requirements

### Requirement: One-to-one development identity
Each development effort SHALL use one GitHub Issue, one OpenSpec change, one non-main branch, one worktree, and one Draft PR.

#### Scenario: Work is initialized
- **WHEN** an issue is accepted for development
- **THEN** its OpenSpec change, branch, worktree, and Draft PR are uniquely associated with that issue

### Requirement: Immutable specification approval
Specification review links SHALL be GitHub blob links pinned to a full commit SHA, and implementation SHALL require Michael's `/approve-spec <sha>` approval relayed through Neo.

#### Scenario: Approved specification is unchanged
- **WHEN** the current specification content matches the full commit SHA in the approval command
- **THEN** implementation may enter the apply phase

#### Scenario: Specification changes after approval
- **WHEN** any specification artifact changes after approval
- **THEN** the previous approval is invalid and a new `/approve-spec <sha>` is required

### Requirement: Staged review and completion gates
The workflow SHALL require apply, verification, all relevant tests, independent code and test review, and Playwright UI review for UI changes before acceptance.

#### Scenario: Work is ready for acceptance
- **WHEN** implementation and every applicable review gate pass
- **THEN** `/accept` may be requested separately from `/merge`

### Requirement: Merge readiness and privileged authority
The OpenSpec change SHALL be synced and archived before merge approval, and only Michael's approval relayed through Neo SHALL authorize merge, release, deployment, secret or access changes, or destructive operations.

#### Scenario: Merge is requested
- **WHEN** `/merge` is issued without the required authority or before sync and archive
- **THEN** the operation is refused

### Requirement: Workflow labels and main protection
The workflow SHALL use `neo-dev` and `needs-approval` to represent handoff and approval states, and SHALL prohibit direct commits to main.

#### Scenario: Human approval is needed
- **WHEN** a workflow reaches a Michael approval gate
- **THEN** `needs-approval` identifies the blocked state until Neo relays the decision

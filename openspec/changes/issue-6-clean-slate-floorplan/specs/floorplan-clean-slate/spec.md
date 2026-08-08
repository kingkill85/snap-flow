## Purpose

Provides a safe, floorplan-scoped way to remove an entire product layout and start again without deleting the floorplan or its structural areas.

## ADDED Requirements

### Requirement: Editable floorplans expose a Clean Slate action
The configurator SHALL expose a clearly destructive “Clean Slate” action for the active floorplan only when the current project version is editable. The action SHALL be disabled when the active floorplan has no product placements.

#### Scenario: Populated editable floorplan
- **WHEN** an editable project version has an active floorplan containing one or more product placements
- **THEN** the user can invoke the active floorplan's Clean Slate action

#### Scenario: Read-only project version
- **WHEN** the current project version is read-only
- **THEN** the Clean Slate action is not available

#### Scenario: Empty active floorplan
- **WHEN** the active floorplan contains no product placements
- **THEN** the Clean Slate action is disabled and no destructive request is issued

### Requirement: Destructive confirmation is explicit
Invoking Clean Slate SHALL open a reusable warning dialog that identifies the active floorplan, states that all product placements on it will be permanently deleted, and provides Cancel and Delete actions. No deletion SHALL occur before explicit confirmation, and the dialog SHALL prevent duplicate submissions while deletion is pending.

#### Scenario: User cancels
- **WHEN** the user cancels or dismisses the Clean Slate warning without confirming Delete
- **THEN** the dialog closes and the floorplan layout remains unchanged

#### Scenario: User confirms once
- **WHEN** the user confirms Delete for the active floorplan
- **THEN** exactly one deletion request is accepted until that request completes

### Requirement: Cleanup is atomic and floorplan scoped
The system SHALL atomically delete every product placement belonging to the requested floorplan and delete BOM entries made unreferenced by those removed placements. It SHALL retain the floorplan record, floorplan image, defined areas, and placements and BOM data belonging to every other floorplan. Repeating the operation against an already-empty floorplan SHALL succeed with a deleted count of zero.

#### Scenario: Successful populated cleanup
- **WHEN** an authorized user confirms Clean Slate for a floorplan containing product placements
- **THEN** all of that floorplan's product placements and BOM entries made unreferenced by them are removed in one committed operation
- **AND** the response reports the number of placements removed

#### Scenario: Neighboring data is retained
- **WHEN** Clean Slate completes for one floorplan
- **THEN** its floorplan, image, areas, and every other floorplan's placements and BOM data remain unchanged

#### Scenario: Already-empty request
- **WHEN** an authorized cleanup request targets an existing editable floorplan with no product placements
- **THEN** the operation succeeds and reports zero placements removed without changing other data

#### Scenario: Cleanup step fails
- **WHEN** any placement or dependent BOM cleanup step fails
- **THEN** the entire operation rolls back and no partial deletion is committed

### Requirement: Cleanup fails closed across trust boundaries
The cleanup endpoint SHALL require authentication, a valid numeric floorplan identifier, tenant ownership of the requested floorplan, and permission to edit its project version. Invalid, missing, inaccessible, or read-only targets SHALL be rejected without revealing cross-tenant data and without deleting anything.

#### Scenario: Malformed identifier
- **WHEN** a cleanup request supplies a malformed floorplan identifier
- **THEN** the system rejects the request without performing deletion

#### Scenario: Missing or inaccessible floorplan
- **WHEN** the floorplan does not exist or belongs to another tenant
- **THEN** the system returns a not-found response without revealing whether another tenant owns it and deletes nothing

#### Scenario: Read-only target
- **WHEN** an authenticated user requests cleanup for a project version they cannot edit
- **THEN** the system rejects the request and leaves the layout unchanged

### Requirement: Client state follows the confirmed server result
The client SHALL update placement state only after the cleanup request succeeds, then refresh all dependent BOM, area-assignment, and proposal-summary state. On failure, it SHALL preserve the displayed layout, close or return the dialog to a retryable state, and present an actionable error.

#### Scenario: Successful client synchronization
- **WHEN** the server confirms cleanup of the active floorplan
- **THEN** the canvas shows no product placements for that floorplan and the BOM and summary-derived state reflect the deletion without a page reload

#### Scenario: Server rejects or fails cleanup
- **WHEN** the cleanup request fails
- **THEN** the existing displayed placements remain intact, the user sees an error, and the action can be retried

## Purpose

Defines how editors preview and atomically replace an exact configuration set on one floorplan while preserving layout and keeping BOM and pricing consistent.

## ADDED Requirements

### Requirement: Explicit edit-mode entry and source selection
The system SHALL expose Mass Switch only when the active project version is editable and an active floorplan exists. Entering Mass Switch mode SHALL require the editor to select an item placement on that active floorplan as the source; area placements and hidden or unrelated floorplans SHALL NOT become sources.

#### Scenario: Editor selects a source placement
- **WHEN** an authorized editor enters Mass Switch mode and selects an item placement on the active floorplan
- **THEN** the system opens a replacement preview for the exact configuration represented by that placement

#### Scenario: Project is read-only
- **WHEN** the active project version is not editable
- **THEN** Mass Switch cannot be started and no replacement request is sent

#### Scenario: Editor exits selection mode
- **WHEN** the editor cancels Mass Switch before selecting a source
- **THEN** selection mode ends without changing any placement or BOM entry

### Requirement: Exact active-floorplan source set
The source set SHALL contain every item placement on the active floorplan whose item, variant, and selected add-ons exactly match the chosen source placement. The system SHALL exclude areas, placements on every other floorplan, and placements with any different item, variant, or add-on selection.

#### Scenario: Matching configurations are counted
- **WHEN** the active floorplan contains multiple placements with the same item, variant, and selected add-ons as the source
- **THEN** the preview includes all and only those placements and reports their quantity

#### Scenario: Items outside the selected set remain unchanged
- **WHEN** a mass switch is confirmed
- **THEN** placements on other floorplans and placements on the active floorplan with a different item, variant, or add-on selection retain their original configuration and BOM relationships

### Requirement: Side-by-side replacement preview
Before confirmation, the system SHALL show the source and proposed replacement side by side. Each side SHALL identify the item, variant, selected add-ons, affected quantity, configured unit price, and configured total price, and the preview SHALL show the total price difference using the same pricing rules as the floorplan BOM.

#### Scenario: Replacement configuration is selected
- **WHEN** the editor selects a valid active replacement item, variant, and add-ons
- **THEN** the preview updates the replacement details, configured total, and price difference without changing persisted data

#### Scenario: Editor cancels the preview
- **WHEN** the editor closes or cancels the preview before confirmation
- **THEN** every placement, BOM entry, and displayed project total remains unchanged

### Requirement: Valid replacement configuration
The system SHALL accept only an active replacement item and active variant available to the project, SHALL enforce the catalog’s required and compatible add-on rules, and SHALL reject a target configuration identical to the source configuration. Invalid, inactive, inaccessible, missing, duplicated, or incompatible target identifiers SHALL fail closed without mutation.

#### Scenario: Required add-ons are enforced
- **WHEN** the chosen replacement variant has required add-ons
- **THEN** confirmation remains unavailable until every required add-on is included and all selected add-ons are compatible

#### Scenario: Invalid target is submitted directly
- **WHEN** a client submits an inactive, inaccessible, missing, duplicated, or incompatible target identifier
- **THEN** the server rejects the request and changes no placement or BOM entry

#### Scenario: Target equals source
- **WHEN** the proposed item, variant, and add-on configuration is identical to the source
- **THEN** the system rejects the no-op replacement and keeps persisted data unchanged

### Requirement: Atomic confirmed replacement
A confirmed mass switch SHALL update all placements in the previewed source set in one transaction or update none. For each affected placement, the system SHALL preserve its identity, floorplan, coordinates, dimensions, rotation, and area assignment while replacing its item/variant/add-on BOM configuration. Superseded unreferenced BOM entries SHALL be removed safely, and referenced or unrelated BOM entries SHALL remain intact.

#### Scenario: Successful mass switch
- **WHEN** an authorized editor confirms a current preview with a valid replacement configuration
- **THEN** every placement in the source set references the replacement configuration and the operation returns the affected quantity and updated pricing

#### Scenario: Any replacement step fails
- **WHEN** validation, BOM creation, placement reassignment, or cleanup fails for any member of the source set
- **THEN** the transaction rolls back and every affected placement and BOM entry retains its pre-request state

### Requirement: Stale preview protection
The server SHALL bind confirmation to the previewed floorplan, source configuration, and complete affected placement set. Immediately before mutation it SHALL re-authorize the edit and revalidate that snapshot; any source-set or catalog change SHALL return a conflict requiring a fresh preview.

#### Scenario: Source set changes after preview
- **WHEN** a matching placement is added, removed, or reconfigured after the preview but before confirmation
- **THEN** confirmation fails with a stale-preview conflict and no replacement occurs

#### Scenario: Catalog changes after preview
- **WHEN** the source or target configuration becomes inactive, inaccessible, or otherwise invalid after the preview
- **THEN** confirmation fails without mutation and the editor is required to review a fresh valid preview

### Requirement: Consistent post-operation state
After success, the client SHALL refresh placements, floorplan BOM, floorplan price, and project total from server data before reporting completion. On failure or conflict it SHALL present a recoverable error, retain no optimistic persisted result, and offer a fresh preview or cancellation.

#### Scenario: Successful refresh
- **WHEN** the server commits a mass switch
- **THEN** the canvas shows the replacement imagery/configuration and BOM and project totals reflect the returned persisted state

#### Scenario: Refresh fails after commit
- **WHEN** the replacement commits but a subsequent client refresh fails
- **THEN** the client reports that reload is required and SHALL NOT claim that the displayed BOM or price is current

### Requirement: Traceable user-visible evidence
Every user-visible scenario in this capability SHALL map to automated Cucumber/Gherkin coverage, and the successful, cancelled, unchanged-outside-set, stale-conflict, and atomic-failure paths SHALL have Playwright evidence against the real development runtime and exact implementation SHA.

#### Scenario: Exact-SHA verification
- **WHEN** implementation is presented for acceptance
- **THEN** traceability validation, relevant backend and frontend tests, Cucumber/Playwright execution, exact-SHA CI, and fresh independent code, test, and UI reviews are recorded for that implementation SHA

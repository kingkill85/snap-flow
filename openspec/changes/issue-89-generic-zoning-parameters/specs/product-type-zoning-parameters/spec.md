## Purpose

Defines reusable, safely evolvable zoning parameter definitions owned and ordered by each SnapFlow Product Type.

## ADDED Requirements

### Requirement: Product Types own zoning parameter definitions
The system SHALL allow an administrator to manage zero or more zoning parameter definitions beneath each Product Type. Each definition MUST have an immutable system identity, a trimmed display name, an integer sort order, and an active state, and MUST remain associated with exactly one Product Type for its lifetime.

#### Scenario: Administrator creates a definition
- **GIVEN** an existing Product Type and an authenticated administrator
- **WHEN** the administrator creates a parameter with a valid name and order
- **THEN** the system persists a new stable identity owned by that Product Type
- **AND** returns the definition in the Product Type's ordered parameter collection

#### Scenario: Non-administrator attempts configuration
- **GIVEN** an authenticated user without administrator privileges
- **WHEN** the user attempts to create, update, reorder, deactivate, reactivate, or delete a definition
- **THEN** the system MUST reject the request with `403 Forbidden`
- **AND** MUST NOT change any definition or Area value

#### Scenario: Definitions are listed predictably
- **GIVEN** a Product Type with multiple definitions
- **WHEN** its definitions are requested
- **THEN** the system returns them by ascending sort order and then stable identity

### Requirement: Definition input is constrained and unambiguous
The system MUST accept only a non-empty trimmed name of at most 100 characters and an integer sort order. Active definition names MUST be unique within the owning Product Type under Unicode-aware case-insensitive comparison; names belonging to different Product Types MAY match. Requests containing unknown fields, invalid identifiers, duplicate reorder identifiers, or definitions belonging to another Product Type MUST fail closed with a structured `400` or `404` response and no partial mutation.

#### Scenario: Duplicate name in one Product Type
- **GIVEN** a Product Type already has an active parameter named `Relay 16A`
- **WHEN** an administrator attempts to create or rename another active parameter to a case-insensitive equivalent
- **THEN** the system rejects the request with a validation error
- **AND** preserves both prior records unchanged

#### Scenario: Same name in separate Product Types
- **GIVEN** one Product Type has an active parameter named `Zones`
- **WHEN** an administrator creates `Zones` for another Product Type
- **THEN** the system accepts the definition with a different stable identity

#### Scenario: Invalid reorder is atomic
- **GIVEN** the current ordered definitions for a Product Type
- **WHEN** an administrator submits an order containing an unknown, duplicate, missing, or foreign definition identity
- **THEN** the system rejects the entire reorder
- **AND** no sort order changes

### Requirement: Rename and reorder preserve value identity
The system SHALL bind Area values to immutable definition identity rather than display name or list position. Renaming or reordering a definition MUST preserve every stored Area value and MUST cause subsequent reads and displays to use the current name and order.

#### Scenario: Rename a used definition
- **GIVEN** Areas have values stored for a definition
- **WHEN** an administrator renames that definition
- **THEN** all stored values remain tied to the same identity
- **AND** subsequent Area editing and summaries show the new name

#### Scenario: Reorder used definitions
- **GIVEN** an Area has values for multiple definitions
- **WHEN** an administrator changes their order
- **THEN** the values remain unchanged
- **AND** subsequent editors and summaries use the new order

### Requirement: Deactivation preserves historical values
The system SHALL allow an administrator to deactivate and reactivate a definition. A deactivated definition MUST be excluded from new Area editing and floorplan summaries, while its stored Area values MUST be retained. Reactivation MUST restore the prior values wherever the owning Product Type is applicable to the project.

#### Scenario: Deactivate a used definition
- **GIVEN** an active definition has positive values on one or more Areas
- **WHEN** an administrator deactivates it
- **THEN** the definition disappears from applicable Area editors and summaries
- **AND** its stored values remain unchanged

#### Scenario: Reactivate a definition
- **GIVEN** a deactivated definition retains Area values
- **WHEN** an administrator reactivates it
- **THEN** it reappears for applicable projects in configured order
- **AND** each Area exposes its retained value

### Requirement: Deletion is safe and explicit
The system MUST permit hard deletion only when a definition has no stored Area values. A deletion attempt for a referenced definition MUST fail with `409 Conflict` and direct the administrator to deactivate it instead. Deleting an unreferenced definition MUST remove only that definition.

#### Scenario: Delete an unused definition
- **GIVEN** a definition has never acquired an Area value
- **WHEN** an administrator confirms deletion
- **THEN** the system removes the definition
- **AND** leaves its Product Type and sibling definitions unchanged

#### Scenario: Reject deletion of a referenced definition
- **GIVEN** at least one Area value row references a definition, including a zero value if such a row exists
- **WHEN** an administrator attempts to delete the definition
- **THEN** the system returns `409 Conflict`
- **AND** preserves the definition and all values

### Requirement: Product Type lifecycle controls applicability without data loss
An inactive Product Type MUST NOT contribute parameter definitions to any Area editor or floorplan summary. Deactivation or removal of a Product Type from a project MUST NOT delete its definitions or Area values; reactivation and project reselection MUST make active definitions and retained values applicable again.

#### Scenario: Product Type becomes inactive
- **GIVEN** a project selects a Product Type whose definitions have Area values
- **WHEN** an administrator deactivates the Product Type
- **THEN** the Product Type's parameter group is omitted from Area editors and summaries
- **AND** its definitions and stored Area values are preserved

#### Scenario: Product Type is selected again for a project
- **GIVEN** a Product Type was removed from a project's selected Product Types without deleting its values
- **WHEN** the active Product Type is selected again
- **THEN** its active definitions become applicable
- **AND** the Area editor exposes retained values

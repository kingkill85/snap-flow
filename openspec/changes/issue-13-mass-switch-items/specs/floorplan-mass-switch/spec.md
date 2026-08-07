## Purpose

Enables authorized users to preview and atomically replace every placement of one exact configured product with another configuration on a single floorplan.

## ADDED Requirements

### Requirement: Floorplan-scoped source selection
The configurator SHALL provide a distinct Mass Switch mode in which selecting an item placement identifies an exact source configuration by product, style/variant, and normalized add-on selection. The system SHALL count only matching item placements on the active floorplan and SHALL exclude area placements, other configurations, and placements on other floorplans.

#### Scenario: Select a repeated configured product
- **WHEN** an authorized user enters Mass Switch mode and selects an item placement
- **THEN** the system opens the mass-switch dialog with the source product, style/variant, add-ons, and the number of exact matches on the active floorplan

#### Scenario: Similar placement does not match
- **WHEN** another placement has a different product, style/variant, or add-on selection from the selected source
- **THEN** that placement is excluded from the source quantity and replacement set

### Requirement: Valid replacement configuration
The system SHALL let the user select an active replacement product, one of its active styles/variants, and a compatible set of active add-ons. The system SHALL reject missing, inactive, nonexistent, or incompatible replacement selections.

#### Scenario: Select a compatible replacement
- **WHEN** the user selects an active product, active style/variant, and compatible active add-ons
- **THEN** the replacement configuration becomes eligible for preview and confirmation

#### Scenario: Replacement becomes invalid
- **WHEN** any selected replacement entity is missing, inactive, or incompatible at validation time
- **THEN** confirmation is unavailable or fails without changing any placement

### Requirement: Side-by-side impact preview
Before confirmation, the system SHALL display the complete source and replacement configurations side by side, the matching quantity, each configuration's unit price, each aggregate price, and the aggregate price difference using the project's existing pricing rules.

#### Scenario: Preview a price decrease
- **WHEN** the replacement configuration costs less than the source configuration
- **THEN** the preview shows both aggregate prices and a negative aggregate price difference for the matching quantity

#### Scenario: Source set changes before confirmation
- **WHEN** the matching source placements or applicable catalog pricing changes after the preview was produced
- **THEN** the system refuses to apply the stale preview and requires a refreshed preview

### Requirement: Explicit atomic confirmation
The system SHALL make no changes until the user explicitly confirms a valid preview. On confirmation, it SHALL atomically replace the configuration of every placement in the validated source set and SHALL make no partial change if any validation or write fails.

#### Scenario: Confirm a valid mass switch
- **WHEN** the user confirms a current preview and all source and replacement data remain valid
- **THEN** every matching placement on the active floorplan uses the replacement configuration and the system reports the replaced quantity

#### Scenario: Cancel the dialog
- **WHEN** the user cancels or closes the mass-switch dialog before confirmation
- **THEN** no placement or bill-of-materials data changes

#### Scenario: Atomic operation fails
- **WHEN** any source validation or replacement write fails during confirmation
- **THEN** the entire operation is rolled back and every placement retains its prior configuration

### Requirement: Preserve placement-specific state
The mass switch SHALL preserve each replaced placement's identity, floorplan membership, position, dimensions, rotation, and area relationship. It SHALL leave every nonmatching placement unchanged and SHALL refresh configurator and proposal totals after success.

#### Scenario: Preserve canvas layout
- **WHEN** placements with different coordinates, sizes, rotations, or area relationships are mass switched
- **THEN** those placement-specific values remain unchanged while their configured product selection is replaced

#### Scenario: Items outside the selected set remain unchanged
- **WHEN** a mass switch is confirmed while the floorplan contains item placements outside the validated source set
- **THEN** every item placement outside that selected set retains its existing product, style/variant, add-ons, and placement-specific state

#### Scenario: Refresh affected totals
- **WHEN** a mass switch succeeds
- **THEN** the active floorplan, bill of materials, and proposal pricing views reflect the replacement and returned quantity without a page reload

### Requirement: Authorized fail-closed execution
The system SHALL require the same authenticated project access as other placement mutations and SHALL verify that the floorplan belongs to the accessible project. All externally supplied identifiers, add-on sets, preview state, and quantities SHALL be treated as untrusted; any authorization, ownership, consistency, or validation failure SHALL cause no mutation.

#### Scenario: Unauthorized floorplan request
- **WHEN** a caller lacks mutation access to the project that owns the requested floorplan
- **THEN** the system rejects the preview or confirmation without disclosing or changing protected placement data

#### Scenario: Tampered confirmation input
- **WHEN** a caller submits identifiers, add-ons, quantity, or preview state that does not match current server state
- **THEN** the system rejects the request and changes no placement or bill-of-materials data

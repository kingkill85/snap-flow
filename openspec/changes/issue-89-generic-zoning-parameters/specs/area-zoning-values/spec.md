## Purpose

Defines secure Area zoning-value persistence, project applicability, accessible editing, and readable grouped summaries on the floorplan.

## ADDED Requirements

### Requirement: Areas store validated integer values by definition identity
The system SHALL store at most one value per Area and parameter-definition identity. Values MUST be base-10 integers greater than or equal to zero and no greater than 9999. The server MUST reject decimals, negative values, values above the limit, non-numeric values, duplicate identities, unknown definitions, and definitions not applicable to the Area's project with `400 Bad Request` and no partial update. Zero and omitted values SHALL be represented equivalently as no persisted value row.

#### Scenario: Save valid values atomically
- **GIVEN** an Area has applicable active parameter definitions
- **WHEN** an authorized user saves valid integer values together with other Area properties
- **THEN** the system atomically persists the Area properties and all submitted parameter values
- **AND** returns the complete updated Area including its revision and applicable grouped values

#### Scenario: Clear a value
- **GIVEN** an Area stores a positive value for an applicable definition
- **WHEN** an authorized user saves that definition as zero or blank
- **THEN** the system removes its persisted value row
- **AND** subsequent reads expose zero for editing and omit it from the summary

#### Scenario: Reject one invalid value without partial save
- **GIVEN** an Area edit changes its name and includes several parameter values
- **WHEN** any submitted value or definition identity is invalid
- **THEN** the system rejects the request with field-level details
- **AND** neither the name nor any parameter value changes

### Requirement: Applicability follows the Area's project Product Types
The applicable definition set for an Area MUST be the active definitions whose owning Product Types are active and selected in the Area's project through the existing project Product Type association. The system SHALL order Product Type groups by Product Type sort order then stable identity, and definitions within each group by definition sort order then stable identity. Categories SHALL NOT affect zoning applicability.

#### Scenario: Project has one configured Product Type
- **GIVEN** a project selects one active Product Type with active definitions
- **WHEN** an Area is read or edited
- **THEN** only that Product Type's active definitions are exposed in configured order

#### Scenario: Project has multiple configured Product Types
- **GIVEN** a project selects multiple active Product Types with active definitions
- **WHEN** an Area is read or edited
- **THEN** each applicable Product Type appears once as an ordered group
- **AND** no definition from an unselected, inactive, or definition-free Product Type appears

#### Scenario: Project has no applicable definitions
- **GIVEN** none of the project's selected active Product Types has an active definition
- **WHEN** an Area is read or edited
- **THEN** the Area remains usable with its existing properties
- **AND** no zoning editor or summary is shown

### Requirement: Area access is tenant-authorized through its project
Every Area read or mutation MUST resolve Area to floorplan to project and enforce the existing tenant and role access rules before returning definitions or values or changing data. An unauthenticated request MUST receive `401 Unauthorized`; an authenticated caller outside the project's tenant scope MUST receive the repository's non-disclosing not-found response and MUST NOT learn configuration or values.

#### Scenario: Tenant user edits own project Area
- **GIVEN** an authenticated active user belongs to the Area project's tenant
- **WHEN** the user reads or saves the Area
- **THEN** the operation is permitted subject to validation and concurrency rules

#### Scenario: Cross-tenant Area request
- **GIVEN** an authenticated non-global user supplies an Area or floorplan identifier belonging to another tenant
- **WHEN** the request is processed
- **THEN** the system returns the same not-found response used for an inaccessible Area
- **AND** performs no read disclosure or mutation

### Requirement: Area saves detect stale data and configuration
Each Area response SHALL include a monotonically increasing revision. A zoning-aware Area update MUST include the revision and the exact set of applicable definition identities displayed by the client. The server MUST compare both within the update transaction; a stale revision or changed applicable set MUST return `409 Conflict`, preserve all current data, and provide an error that instructs the client to reload. Existing Area-property-only clients that omit zoning fields MAY continue using the current update contract for backward compatibility.

#### Scenario: Concurrent Area edit wins once
- **GIVEN** two editors loaded the same Area revision and applicability set
- **WHEN** the first update succeeds and the second submits its stale revision
- **THEN** the second update receives `409 Conflict`
- **AND** the first update remains unchanged

#### Scenario: Definition changes while editor is open
- **GIVEN** a user opened an Area editor
- **WHEN** an administrator changes the applicable definition set before the user saves
- **THEN** the save receives `409 Conflict`
- **AND** no Area property or value from that request is persisted

### Requirement: The Area editor uses accessible stacked Product Type sections
When applicable parameters exist, the existing Edit Area dialog MUST expand responsively and retain the existing Area property controls and one Cancel/Update action pair. It SHALL place zoning controls in a second column on sufficiently wide viewports and below the Area controls on narrow viewports. The zoning column MUST use always-visible, ordered, collapsible Product Type sections rather than tabs, with each section heading showing the Product Type name and color. Every parameter MUST have a persistent label, a directly editable numeric input, and labelled decrement/increment buttons; keyboard operation, focus indication, screen-reader names, and validation messages MUST remain available without relying on color.

#### Scenario: Edit multiple Product Type groups on desktop
- **GIVEN** an Area has definitions from multiple applicable Product Types and viewport width permits two columns
- **WHEN** the user opens Edit Area
- **THEN** Area properties and the zoning column are visible side by side
- **AND** all Product Type headings remain discoverable without switching tabs

#### Scenario: Edit on a narrow viewport
- **GIVEN** an Area has applicable definitions and the viewport cannot fit two columns
- **WHEN** the user opens Edit Area
- **THEN** the zoning sections stack below the Area property controls
- **AND** the dialog body scrolls while its title and action controls remain usable

#### Scenario: Operate a stepper accessibly
- **GIVEN** focus is on a parameter control
- **WHEN** the user types an integer or activates its labelled plus or minus button by keyboard
- **THEN** the displayed value changes within the allowed range
- **AND** decrement at zero cannot create a negative value

#### Scenario: Cancel an edit
- **GIVEN** the user changed Area properties or zoning values in the dialog
- **WHEN** the user activates Cancel, presses Escape, or dismisses the dialog
- **THEN** no draft changes are sent or retained

### Requirement: Floorplan summaries show only meaningful grouped values
Each Area SHALL render a compact summary for every applicable Product Type having at least one positive parameter value. Each group MUST identify the Product Type and list only positive values as `parameter name: value` in configured order. A Product Type with no positive values MUST have no group, and an Area with no non-empty groups MUST have no zoning summary.

#### Scenario: Mixed zero and positive values
- **GIVEN** an Area has positive and zero values across two applicable Product Types
- **WHEN** the floorplan renders
- **THEN** each Product Type with a positive value has one labelled group
- **AND** zero-valued parameters and empty Product Type groups are absent

#### Scenario: No positive values
- **GIVEN** an Area has no positive values among applicable definitions
- **WHEN** the floorplan renders
- **THEN** only the existing Area name label is rendered
- **AND** no empty zoning container consumes floorplan space

### Requirement: Summaries remain readable without obscuring the floorplan
The zoning summary SHALL use viewport-independent SVG sizing consistent with the existing zoom scale, remain anchored inside or adjacent to the Area name label, and cap its displayed width and height. Long names MUST be ellipsized or clipped with the full text available through an accessible tooltip/title, and excess rows MUST collapse into a final `+N more` indicator rather than overflowing the Area or covering an unbounded portion of the floorplan. The summary MUST be non-interactive so existing Area selection and drag behavior is unchanged.

#### Scenario: Long and numerous values
- **GIVEN** an Area has more positive values than fit within the summary bounds and some names are long
- **WHEN** the floorplan renders at any supported zoom
- **THEN** visible rows stay within the bounded summary
- **AND** truncated content exposes full text accessibly
- **AND** a `+N more` row reports the omitted positive values

#### Scenario: Select or drag through a summary
- **GIVEN** a zoning summary is visible on an Area
- **WHEN** the user selects or drags the underlying Area at the summary position
- **THEN** the existing Area interaction handles the pointer event
- **AND** the summary does not become a separate interaction target

### Requirement: Existing data and consumers remain compatible
The migration MUST be additive and MUST NOT create zoning definitions or values for existing Product Types or Areas. Existing Area list/get responses SHALL retain all current fields and add zoning data and revision fields without changing their meaning. Existing projects and Areas MUST behave exactly as before until an administrator configures an applicable definition.

#### Scenario: Upgrade an existing database
- **GIVEN** a database containing Product Types, projects, floorplans, and Areas but no zoning tables
- **WHEN** the migration runs
- **THEN** all existing records and relationships remain intact
- **AND** every existing Area reads with no zoning groups and a valid initial revision

#### Scenario: Existing project after upgrade
- **GIVEN** an upgraded project has no applicable parameter definitions
- **WHEN** a user edits or views an Area
- **THEN** existing Area property behavior and rendering remain unchanged

### Requirement: User-visible scenarios are traceable across test layers
Every normative Issue #89 scenario MUST be mapped to automated coverage or an explicit justified review assertion. Persistence, validation, authorization, lifecycle, atomicity, migration, and conflict behavior MUST have backend repository or route coverage; editor and summary presentation MUST have focused frontend unit/component coverage; and representative configuration, multi-group editing, persistence-after-reload, positive-only summary, accessibility, overflow, and stale/error recovery paths MUST be covered by Issue #89-tagged Cucumber scenarios driven by Playwright against the real SnapFlow frontend and backend.

#### Scenario: Traceability gate is evaluated
- **GIVEN** the Issue #89 implementation is ready for review
- **WHEN** verification runs
- **THEN** each specification scenario has a recorded backend, frontend, Cucumber/Playwright, or justified manual-review mapping
- **AND** the real-runtime Cucumber suite proves browser-visible behavior through persisted API state rather than mocks

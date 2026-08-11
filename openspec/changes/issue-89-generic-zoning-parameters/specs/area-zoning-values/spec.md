## Purpose

Defines secure Area zoning-value persistence, project applicability, accessible compact editing, and readable grouped annotations shared by interactive and exported floorplans.

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

### Requirement: The Area editor uses a compact accessible Product Type layout
When applicable parameters exist, the existing Edit Area dialog MUST expand responsively and retain the existing Area property controls and one Cancel/Update action pair aligned at the bottom right. On sufficiently wide viewports it SHALL present a compact zoning pane beside the Area controls; on narrow viewports it SHALL place that pane below the Area controls. The zoning pane MUST have a prominent generic zoning heading and ordered Product Type headings rather than tabs or card-per-parameter containers. Under each Product Type heading, every parameter MUST occupy one dense, consistently aligned row containing an application-styled compound number control and a persistent parameter label. The compound control MUST present an explicit decrement button, a compact direct-entry value field, and an explicit increment button as one visually integrated group. When these application controls are present, the value field MUST NOT expose a duplicate browser-native spinner.

The control MUST use an inclusive integer domain of 0 through 9999 and step 1. It MUST accept direct base-10 decimal-digit entry and `ArrowUp`/`ArrowDown` operation from the value field. Increment, decrement, and arrow operations MUST clamp at the bounds; the decrement button MUST be disabled at 0 and the increment button MUST be disabled at 9999. A temporary blank draft MAY be entered and SHALL commit as zero. Fractional, negative, non-digit, non-finite, and out-of-range manual drafts MUST NOT be silently truncated or persisted: the editor MUST retain the draft for correction, expose a programmatically associated validation error, and block Update without sending a mutation. Each value field MUST have a persistent programmatic parameter label and a description of its bounds and current validation state. Each increment and decrement button MUST have a distinct accessible name containing the parameter context. The value field and enabled decrement/increment buttons MUST participate in ordinary sequential keyboard focus, expose visible focus, use operable hit targets of at least 32 by 32 CSS pixels, and communicate disabled state without color alone.

The dialog body MUST provide bounded internal scrolling when content exceeds the viewport while the heading and bottom-right actions remain reachable. Rows across one or multiple Product Type groups MUST remain densely and deterministically aligned. On narrow or phone-width viewports a row MAY stack or wrap its persistent label, but its controls MUST remain usable without page-level horizontal overflow. Saving MUST use the existing atomic Area update, and reopening after a successful save MUST display the persisted values in their original Product Type groups.

#### Scenario: Edit one Product Type compactly on desktop
- **GIVEN** an Area has definitions from one applicable Product Type and viewport width permits two columns
- **WHEN** the user opens Edit Area
- **THEN** Area properties and the compact zoning pane are visible side by side
- **AND** each parameter appears with an integrated decrement, direct-entry value field, increment, and persistent label under the Product Type heading
- **AND** no parameter card, tab, or duplicate browser-native spinner is rendered

#### Scenario: Edit multiple Product Type groups on desktop
- **GIVEN** an Area has definitions from multiple applicable Product Types and viewport width permits two columns
- **WHEN** the user opens Edit Area
- **THEN** each Product Type appears as an ordered compact section in the zoning pane
- **AND** all headings and parameter rows remain discoverable without switching tabs

#### Scenario: Edit on a narrow viewport
- **GIVEN** an Area has applicable definitions and the viewport cannot fit two columns
- **WHEN** the user opens Edit Area
- **THEN** the compact zoning pane stacks below the Area property controls without horizontal page overflow
- **AND** the dialog body scrolls while its heading and bottom-right action controls remain reachable and usable

#### Scenario: Operate the compound number control accessibly
- **GIVEN** focus is on a parameter value field whose current value is within the allowed range
- **WHEN** the user types an integer, presses `ArrowUp` or `ArrowDown`, or activates the parameter-specific increment or decrement button
- **THEN** the displayed value changes by direct entry or step 1 without leaving the inclusive 0 through 9999 range
- **AND** the field retains its parameter label and bounds description while the buttons expose distinct parameter-specific accessible names
- **AND** keyboard focus can move through decrement, value, and increment with a visible focus indicator

#### Scenario: Reach and respect the integer boundaries
- **GIVEN** a parameter control displays 0 or 9999
- **WHEN** the user attempts to step beyond the corresponding boundary
- **THEN** the value remains clamped within the allowed range
- **AND** the boundary-facing decrement or increment button is disabled while the opposite action remains available

#### Scenario: Reject an invalid manual draft without mutation
- **GIVEN** a user is editing a parameter value
- **WHEN** the user enters a fractional, negative, non-digit, non-finite, or out-of-range draft and activates Update
- **THEN** an associated validation message identifies the allowed integer range
- **AND** the invalid draft remains available for correction
- **AND** no Area mutation request is sent and no value is partially persisted

#### Scenario: Save and reopen compact zoning values
- **GIVEN** an Area editor contains one or more Product Type groups
- **WHEN** the user enters values manually, saves, and reopens the Area editor
- **THEN** the saved values appear beside the same parameter labels in the same Product Type groups
- **AND** zero and positive values retain their defined persistence semantics

#### Scenario: Cancel an edit
- **GIVEN** the user changed Area properties or zoning values in the dialog
- **WHEN** the user activates Cancel, presses Escape, or dismisses the dialog
- **THEN** no draft changes are sent or retained

### Requirement: Floorplan annotations show only meaningful grouped values
Each Area SHALL derive one annotation model for every applicable Product Type having at least one positive parameter value. Each group MUST identify the Product Type and list only positive values as `parameter name: value` in configured order. A Product Type with no positive values MUST have no group, and an Area with no non-empty groups MUST have no zoning annotation in either the interactive floorplan or PNG export. The normal API-loaded Area data and stored geometry used by an existing project MUST feed the same normalized annotation input for interactive SVG and PNG export; persisted positive values MUST NOT be dropped because the Area came from an existing database, state refetch, version selection, or one supported stored geometry representation. Categories, BOQ data, and module choices MUST NOT contribute annotations or zoning values.

#### Scenario: Mixed zero and positive values
- **GIVEN** an Area has positive and zero values across two applicable Product Types
- **WHEN** the interactive floorplan or PNG export renders
- **THEN** each Product Type with a positive value has one labelled group
- **AND** zero-valued parameters and empty Product Type groups are absent

#### Scenario: No positive values
- **GIVEN** an Area has no positive values among applicable definitions
- **WHEN** the interactive floorplan or PNG export renders
- **THEN** only the existing Area name label is rendered
- **AND** no empty zoning annotation consumes floorplan or export space

#### Scenario: Existing project values reach both real renderers
- **GIVEN** a normal Area API response for an existing project contains real stored Area geometry and persisted positive zoning values that are visible in Edit Area
- **WHEN** the configurator renders that Area and the user invokes the existing PNG export without replacing the data with a synthetic fixture
- **THEN** the interactive floorplan contains directly painted SVG annotation rows for those exact positive values
- **AND** the downloaded PNG contains paint and pixel evidence for the same grouped values through the same normalized Area and descriptor path
- **AND** neither renderer silently omits the annotation because of data or geometry adaptation

### Requirement: Annotations remain readable without obscuring the floorplan
The interactive floorplan SHALL render zoning annotation text directly over the floorplan without a large opaque panel. Text MUST use a deterministic dual-contrast foreground and outline/halo treatment that remains legible over light, dark, detailed, and mixed floorplan imagery without relying on Product Type color alone. Annotation layout MUST consider Area bounds, Area-name labels, every visible product-placement rectangle, and previously placed zoning annotations. It MUST choose from a fixed ordered set of candidate anchors, reject candidates that intersect product placements, prefer a non-overlapping candidate, and deterministically omit lower-priority rows with a `+N more` indicator when no safe full layout exists. It MUST never cover a visible product placement. Nearby Areas and placements MUST produce the same layout for the same input order, and annotations MUST remain non-interactive so existing selection and drag behavior is unchanged.

Long names MUST be ellipsized or clipped with the full interactive text available through an accessible name or title. Typography, line order, spacing, truncation limits, contrast treatment, candidate-anchor priority, collision padding, and omission rules MUST come from one shared deterministic annotation presentation/model rather than independent interactive and export implementations.

#### Scenario: Read annotations over varied floorplan backgrounds
- **GIVEN** positive zoning annotations cross light, dark, detailed, and mixed regions of a floorplan
- **WHEN** the interactive floorplan renders at a supported zoom
- **THEN** every visible annotation uses the defined dual-contrast text treatment without a large opaque backing panel
- **AND** its meaning remains available without relying on color

#### Scenario: Avoid overlapping nearby product placements
- **GIVEN** an Area contains positive zoning values and one or more product placements near its preferred annotation anchor
- **WHEN** the interactive floorplan lays out the annotation
- **THEN** it deterministically selects the first safe candidate that intersects neither a product placement nor an earlier annotation
- **AND** if all candidates are constrained it omits lower-priority rows and reports them with `+N more` rather than covering a product item

#### Scenario: Long and numerous values
- **GIVEN** an Area has more positive values than fit within the summary bounds and some names are long
- **WHEN** the floorplan renders at any supported zoom
- **THEN** visible rows stay within the bounded summary
- **AND** truncated content exposes full text accessibly
- **AND** a `+N more` row reports the omitted positive values

#### Scenario: Select or drag through an annotation
- **GIVEN** a zoning annotation is visible on an Area
- **WHEN** the user selects or drags the underlying Area at the annotation position
- **THEN** the existing Area interaction handles the pointer event
- **AND** the annotation does not become a separate interaction target

### Requirement: PNG exports preserve zoning annotation parity
The existing PNG floorplan image export SHALL include zoning annotations for every visible Area using the same shared annotation model, visible Area set, visible product-placement collision geometry, positive-only grouping, text, order, truncation, omission count, anchor selection, collision padding, and contrast style as the interactive floorplan. Semantic parity means both surfaces contain the same Product Type groups, parameter/value rows, order, omitted-row count, and selected normalized anchor for the same visibility state. Visual parity means font family, weight, relative line height, foreground/outline colors, outline ratio, alignment, and spacing are derived from the same presentation constants; raster antialiasing need not be pixel-identical.

The export SHALL map natural floorplan coordinates to its raster canvas with a single deterministic scale transform. At every supported floorplan image size, the annotation's dimensions, stroke, collision bounds, and anchor MUST scale proportionally from the shared model and remain within the exported image. Annotation layout or drawing failure MUST reject the export through the existing surfaced export-error path before a download is triggered; the exporter MUST NOT silently produce a PNG that omits requested annotations.

#### Scenario: Export includes the interactive annotations
- **GIVEN** the interactive floorplan shows positive zoning annotations for visible Areas
- **WHEN** the user invokes the existing PNG floorplan export with the same Area, placement, and visibility state
- **THEN** the PNG contains the same grouped annotation text, ordering, omission count, normalized anchors, and contrast treatment
- **AND** hidden Areas and zero or empty groups remain absent

#### Scenario: Export remains deterministic at supported scales
- **GIVEN** the same floorplan state is exported at any supported natural image size
- **WHEN** the shared annotation layout is transformed to raster coordinates
- **THEN** its geometry and style scale deterministically and remain inside the image bounds
- **AND** repeated exports of the same state choose the same anchors and omitted rows

#### Scenario: Export annotations remain clear near products and varied imagery
- **GIVEN** annotations are near visible product placements over varied floorplan backgrounds
- **WHEN** the PNG is exported
- **THEN** no annotation covers a product placement
- **AND** the dual-contrast text treatment remains present without a large opaque panel

#### Scenario: Annotation export fails closed
- **GIVEN** the shared annotation model cannot be laid out or drawn completely
- **WHEN** PNG export is attempted
- **THEN** the existing export operation reports failure and triggers no download
- **AND** it does not silently export an image missing zoning annotations

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

### Requirement: Project version creation preserves copied Area zoning values
When an authorized user creates a new project version from a source version through the existing Create Version flow, the system SHALL copy every persisted zoning value belonging to each source Area that is copied into the new version. Each copied row MUST reference the corresponding new Area identity through the source-to-new placement mapping and MUST retain the same stable Product-Type-owned `parameter_id`; the system MUST NOT clone parameter definitions. The copy MUST include only positive integer values owned by source Areas actually copied from the selected source version and MUST create no duplicate, orphaned, source-Area, or cross-version references.

The zoning copy MUST participate in the same atomic operation as creation of the project version and copying of its floorplans, placements, Area properties and vertices, and project Product Type associations. Any zoning selection, mapping, validation, constraint, or persistence failure MUST roll back the entire new-version creation with no partial project or zoning rows. Existing tenant access and source-version membership rules for Create Version MUST apply unchanged.

#### Scenario: Copy zoning values across multiple floorplans and Areas
- **GIVEN** an authorized user selects a source version with multiple floorplans and copied Areas having positive zoning values
- **WHEN** the user creates a new version through the existing Create Version flow
- **THEN** every source zoning value is reproduced exactly once for its corresponding new Area
- **AND** every copied value references a new-version Area ID, never a source Area ID
- **AND** each copied value retains the source row's positive integer value and stable parameter identity

#### Scenario: Copy mixed valued and unvalued Areas
- **GIVEN** a source version contains copied Areas with positive zoning rows and copied Areas with zero or omitted values
- **WHEN** an authorized user creates a new version
- **THEN** the new version contains zoning rows only for the source's persisted positive values
- **AND** unvalued Areas acquire no zoning rows
- **AND** Product Type parameter definitions are not duplicated

#### Scenario: Copied versions are isolated after creation
- **GIVEN** a new version was created with zoning values copied to remapped Area IDs
- **WHEN** an authorized user later changes or clears a zoning value in either the source or new version
- **THEN** the corresponding value in the other version remains unchanged

#### Scenario: Zoning-copy failure rolls back version creation
- **GIVEN** otherwise valid version creation encounters a zoning-row mapping or persistence failure
- **WHEN** the operation attempts to create the new version
- **THEN** the request fails
- **AND** no new project, floorplan, placement, Area, project Product Type association, or zoning-value row from that operation remains

#### Scenario: Inaccessible source version is not copied
- **GIVEN** an authenticated caller supplies a project group or source version outside the caller's tenant scope or a source version not belonging to the selected group
- **WHEN** the caller submits the existing Create Version request
- **THEN** the system returns the same non-disclosing authorization or not-found response used by current version creation
- **AND** creates no project or zoning rows

### Requirement: User-visible scenarios are traceable across test layers
Every normative Issue #89 scenario MUST be mapped to automated coverage or an explicit justified review assertion. Persistence, validation, authorization, lifecycle, atomicity, migration, project-version copying, and conflict behavior MUST have backend repository or route coverage. Editor, compound-control bounds/drafts/keyboard/accessibility, shared annotation layout, production Area data/geometry adaptation, interactive rendering, collision, and PNG drawing/failure behavior MUST have focused frontend unit/component/service coverage. Representative configuration, one- and multi-Product-Type editing, explicit button and keyboard operation, invalid-entry no-mutation behavior, persistence-after-reload, positive-only annotations, varied-background readability, placement collision, responsive overflow, stale/error recovery, PNG export parity, and Create Version zoning preservation paths MUST be covered by Issue #89-tagged Cucumber scenarios driven by Playwright against the real SnapFlow frontend and backend. At least one real-runtime scenario MUST begin with persisted values and real stored Area geometry from a normally loaded existing project, then use the same values to prove direct interactive DOM/SVG paint and actual PNG paint/pixel output; a synthetic descriptor fixture, hidden title, or download event alone MUST NOT satisfy that evidence.

#### Scenario: Traceability gate is evaluated
- **GIVEN** the Issue #89 implementation is ready for review
- **WHEN** verification runs
- **THEN** each specification scenario has a recorded backend, frontend, Cucumber/Playwright, or justified manual-review mapping
- **AND** the real-runtime Cucumber suite proves browser-visible behavior through persisted API state rather than mocks

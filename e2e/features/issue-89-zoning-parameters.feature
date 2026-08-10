@issue-89
Feature: Generic Product Type zoning parameters

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/product-type-zoning-parameters/spec.md#administrator-creates-a-definition
  Scenario: Administrator creates a definition
    Given an existing Product Type and an authenticated administrator
    When the administrator creates a parameter with a valid name and order
    Then the system persists a new stable identity owned by that Product Type
    And returns the definition in the Product Type's ordered parameter collection

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/product-type-zoning-parameters/spec.md#reject-deletion-of-a-referenced-definition
  Scenario: Referenced parameter deletion is actionable
    Given at least one Area value row references a definition, including a zero value if such a row exists
    When an administrator attempts to delete the definition
    Then the system returns `409 Conflict`
    And preserves the definition and all values

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#edit-one-product-type-compactly-on-desktop
  Scenario: Compact native zoning editor
    Given an Area has definitions from one applicable Product Type and viewport width permits two columns
    When the user opens Edit Area
    Then Area properties and the compact zoning pane are visible side by side
    And each parameter appears as one narrow number input beside its label under the Product Type heading
    And no parameter card, tab, or custom increment/decrement control is rendered

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#edit-multiple-product-type-groups-on-desktop
  Scenario: Multiple Product Type groups on desktop
    Given an Area has definitions from multiple applicable Product Types and viewport width permits two columns
    When the user opens Edit Area
    Then each Product Type appears as an ordered compact section in the zoning pane
    And all headings and parameter rows remain discoverable without switching tabs

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#edit-on-a-narrow-viewport
  Scenario: Narrow accessible editor
    Given an Area has applicable definitions and the viewport cannot fit two columns
    When the user opens Edit Area
    Then the compact zoning pane stacks below the Area property controls without horizontal page overflow
    And the dialog body scrolls while its heading and bottom-right action controls remain reachable and usable

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#operate-a-native-number-input-accessibly
  Scenario: Native keyboard stepper and persistence
    Given focus is on a parameter control
    When the user types an integer or uses the native number-input keyboard step operation
    Then the displayed value changes within the allowed range
    And decrement at zero cannot create a negative value
    And no redundant custom plus or minus control is present

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#cancel-an-edit
  Scenario: Cancel discards drafts
    Given the user changed Area properties or zoning values in the dialog
    When the user activates Cancel, presses Escape, or dismisses the dialog
    Then no draft changes are sent or retained

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#mixed-zero-and-positive-values
  Scenario: Positive-only grouped annotations persist after reload
    Given an Area has positive and zero values across two applicable Product Types
    When the interactive floorplan or PNG export renders
    Then each Product Type with a positive value has one labelled group
    And zero-valued parameters and empty Product Type groups are absent

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#save-and-reopen-compact-zoning-values
  Scenario: Saved editor values reach the floorplan and PNG export
    Given an Area editor contains one or more Product Type groups
    When the user enters values manually, saves, and reopens the Area editor
    Then the saved values appear beside the same parameter labels in the same Product Type groups
    And zero and positive values retain their defined persistence semantics

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#long-and-numerous-values
  Scenario: Annotation overflow remains bounded and accessible
    Given an Area has more positive values than fit within the summary bounds and some names are long
    When the floorplan renders at any supported zoom
    Then visible rows stay within the bounded summary
    And truncated content exposes full text accessibly
    And a `+N more` row reports the omitted positive values

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#read-annotations-over-varied-floorplan-backgrounds
  Scenario: Annotation remains readable over varied floorplan backgrounds
    Given positive zoning annotations cross light, dark, detailed, and mixed regions of a floorplan
    When the interactive floorplan renders at a supported zoom
    Then every visible annotation uses the defined dual-contrast text treatment without a large opaque backing panel
    And its meaning remains available without relying on color

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#avoid-overlapping-nearby-product-placements
  Scenario: Annotation avoids a nearby product placement
    Given an Area contains positive zoning values and one or more product placements near its preferred annotation anchor
    When the interactive floorplan lays out the annotation
    Then it deterministically selects the first safe candidate that intersects neither a product placement nor an earlier annotation
    And if all candidates are constrained it omits lower-priority rows and reports them with `+N more` rather than covering a product item

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#select-or-drag-through-an-annotation
  Scenario: Annotation passes pointer interaction through
    Given a zoning annotation is visible on an Area
    When the user selects or drags the underlying Area at the annotation position
    Then the existing Area interaction handles the pointer event
    And the annotation does not become a separate interaction target

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#export-includes-the-interactive-annotations
  Scenario: PNG export preserves annotation presentation
    Given the interactive floorplan shows positive zoning annotations for visible Areas
    When the user invokes the existing PNG floorplan export with the same Area, placement, and visibility state
    Then the PNG contains the same grouped annotation text, ordering, omission count, normalized anchors, and contrast treatment
    And hidden Areas and zero or empty groups remain absent

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#annotation-export-fails-closed
  Scenario: PNG annotation export fails closed
    Given the shared annotation model cannot be laid out or drawn completely
    When PNG export is attempted
    Then the existing export operation reports failure and triggers no download
    And it does not silently export an image missing zoning annotations

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/product-type-zoning-parameters/spec.md#non-administrator-attempts-configuration
  Scenario: Non-administrator authorization is enforced
    Given an authenticated user without administrator privileges
    When the user attempts to create, update, reorder, deactivate, reactivate, or delete a definition
    Then the system MUST reject the request with `403 Forbidden`
    And MUST NOT change any definition or Area value

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#cross-tenant-area-request
  Scenario: Cross-tenant Area is non-disclosing
    Given an authenticated non-global user supplies an Area or floorplan identifier belonging to another tenant
    When the request is processed
    Then the system returns the same not-found response used for an inaccessible Area
    And performs no read disclosure or mutation

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#reject-one-invalid-value-without-partial-save
  Scenario: Invalid value is rejected atomically
    Given an Area edit changes its name and includes several parameter values
    When any submitted value or definition identity is invalid
    Then the system rejects the request with field-level details
    And neither the name nor any parameter value changes

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/product-type-zoning-parameters/spec.md#reactivate-a-definition
  Scenario: Deactivate and reactivate retains values
    Given a deactivated definition retains Area values
    When an administrator reactivates it
    Then it reappears for applicable projects in configured order
    And each Area exposes its retained value

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/product-type-zoning-parameters/spec.md#product-type-is-selected-again-for-a-project
  Scenario: Project Product Type reselection retains values
    Given a Product Type was removed from a project's selected Product Types without deleting its values
    When the active Product Type is selected again
    Then its active definitions become applicable
    And the Area editor exposes retained values

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#definition-changes-while-editor-is-open
  Scenario: Applicability conflict has visible recovery
    Given a user opened an Area editor
    When an administrator changes the applicable definition set before the user saves
    Then the save receives `409 Conflict`
    And no Area property or value from that request is persisted

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#concurrent-area-edit-wins-once
  Scenario: Stale revision recovery
    Given two editors loaded the same Area revision and applicability set
    When the first update succeeds and the second submits its stale revision
    Then the second update receives `409 Conflict`
    And the first update remains unchanged

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#copy-zoning-values-across-multiple-floorplans-and-areas
  Scenario: Create Version preserves remapped zoning values
    Given an authorized user selects a source version with multiple floorplans and copied Areas having positive zoning values
    When the user creates a new version through the existing Create Version flow
    Then every source zoning value is reproduced exactly once for its corresponding new Area
    And every copied value references a new-version Area ID, never a source Area ID
    And each copied value retains the source row's positive integer value and stable parameter identity

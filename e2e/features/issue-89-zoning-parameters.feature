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

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#edit-multiple-product-type-groups-on-desktop
  Scenario: Multiple Product Type groups on desktop
    Given an Area has definitions from multiple applicable Product Types and viewport width permits two columns
    When the user opens Edit Area
    Then Area properties and the zoning column are visible side by side
    And all Product Type headings remain discoverable without switching tabs

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#edit-on-a-narrow-viewport
  Scenario: Narrow accessible editor
    Given an Area has applicable definitions and the viewport cannot fit two columns
    When the user opens Edit Area
    Then the zoning sections stack below the Area property controls
    And the dialog body scrolls while its title and action controls remain usable

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#operate-a-stepper-accessibly
  Scenario: Keyboard stepper and persistence
    Given focus is on a parameter control
    When the user types an integer or activates its labelled plus or minus button by keyboard
    Then the displayed value changes within the allowed range
    And decrement at zero cannot create a negative value

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#cancel-an-edit
  Scenario: Cancel discards drafts
    Given the user changed Area properties or zoning values in the dialog
    When the user activates Cancel, presses Escape, or dismisses the dialog
    Then no draft changes are sent or retained

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#mixed-zero-and-positive-values
  Scenario: Positive-only grouped summary persists after reload
    Given an Area has positive and zero values across two applicable Product Types
    When the floorplan renders
    Then each Product Type with a positive value has one labelled group
    And zero-valued parameters and empty Product Type groups are absent

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/area-zoning-values/spec.md#long-and-numerous-values
  Scenario: Summary overflow remains bounded and accessible
    Given an Area has more positive values than fit within the summary bounds and some names are long
    When the floorplan renders at any supported zoom
    Then visible rows stay within the bounded summary
    And truncated content exposes full text accessibly
    And a `+N more` row reports the omitted positive values

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

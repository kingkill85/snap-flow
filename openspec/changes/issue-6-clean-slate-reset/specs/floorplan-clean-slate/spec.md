## Purpose

Defines a safe, authorized way to restart one floorplan design by removing its placed products and associated floorplan BOM data while preserving the floorplan and unrelated project content.

## ADDED Requirements

### Requirement: Editable Floorplan view exposes a Clean Slate action
The system SHALL show a user-visible action labeled **Clean Slate** for the active floorplan only when the signed-in user has an editing role (`admin` or `tenant_admin`). The action MUST NOT be presented as available to a read-only `user`, MUST be disabled while a reset request is pending, and MUST be disabled when the loaded active floorplan has no item placements.

#### Scenario: Editor sees an available action
- **GIVEN** an `admin` or `tenant_admin` is viewing an active floorplan with at least one item placement
- **WHEN** the Floorplan view finishes loading
- **THEN** the system shows an enabled **Clean Slate** action associated with that active floorplan

#### Scenario: Read-only user cannot invoke the action
- **GIVEN** a signed-in user has the `user` role
- **WHEN** the user views a floorplan
- **THEN** the system does not offer an enabled **Clean Slate** action

#### Scenario: Empty active floorplan disables the action
- **GIVEN** an editor is viewing an active floorplan whose loaded placement collection is empty
- **WHEN** the Floorplan view finishes loading
- **THEN** the **Clean Slate** action is disabled and no confirmation can be opened from it

### Requirement: Reset requires explicit destructive confirmation
The system SHALL open a modal confirmation before sending a reset request. The modal MUST identify the active floorplan by name, state that every placed product and its associated floorplan BOM data will be permanently removed, state that the floorplan image and areas will remain, and provide **Cancel** and destructive **Reset** actions. Opening or cancelling the modal MUST NOT mutate server or client design data.

#### Scenario: User opens the warning
- **GIVEN** an editor is viewing floorplan `Ground Floor` with item placements
- **WHEN** the editor activates **Clean Slate**
- **THEN** a modal identifies `Ground Floor`, explains the permanent placement and BOM removal and the preserved floorplan image and areas, and offers **Cancel** and **Reset**

#### Scenario: User cancels the warning
- **GIVEN** the Clean Slate confirmation is open
- **WHEN** the editor selects **Cancel**, presses Escape, or dismisses the modal
- **THEN** the modal closes without sending a reset request and without changing placements, BOM data, areas, or selection state

#### Scenario: Duplicate confirmation is prevented
- **GIVEN** the editor has confirmed a reset and its request is pending
- **WHEN** the editor attempts to activate **Reset** again
- **THEN** the destructive action remains disabled and the system sends no second request from that dialog

### Requirement: Reset is scoped to item placements and their BOM data
On confirmed reset, the system SHALL delete every `type = 'item'` placement whose `floorplan_id` is the requested floorplan and SHALL delete the parent and child `project_bom` rows associated with that floorplan. It MUST preserve the floorplan record, name, image, ordering, defined areas, project metadata, catalog data, other floorplans and their placements/BOM rows, and client-side product size/style/add-on preferences used for later placements.

#### Scenario: Populated floorplan is reset
- **GIVEN** a floorplan has multiple item placements whose BOM entries include add-ons
- **WHEN** an authorized editor confirms its reset
- **THEN** all item placements and all parent and child BOM rows for that floorplan are removed and the response reports the number of removed item placements

#### Scenario: Areas and floorplan survive reset
- **GIVEN** a floorplan has an image, metadata, defined areas, and item placements assigned to those areas
- **WHEN** its reset succeeds
- **THEN** the floorplan image, metadata, and areas still exist and none of the removed placements remain assigned to an area

#### Scenario: Other floorplans are isolated
- **GIVEN** the same project or another project has placements and BOM data on other floorplans
- **WHEN** one floorplan is reset
- **THEN** placements and BOM rows belonging to every other floorplan remain unchanged

#### Scenario: Product placement preferences survive reset
- **GIVEN** the browser remembers product size, style, or add-on defaults for the project
- **WHEN** the active floorplan reset succeeds
- **THEN** those preferences remain available when the editor places products again

### Requirement: Reset is atomic and idempotent for an existing floorplan
The system MUST perform the floorplan-scoped placement and BOM deletion in one database transaction. The operation SHALL return success for an existing accessible floorplan even if it is already empty. A successful response MUST contain an authoritative non-negative integer `removed_count`; repeated or concurrent requests SHALL each report the rows removed by that transaction and SHALL leave the same valid empty result without partial deletion.

#### Scenario: Existing empty floorplan is a successful no-op
- **GIVEN** an authorized editor can access an existing floorplan with no item placements or floorplan BOM rows
- **WHEN** the editor requests a reset directly through the API
- **THEN** the system returns success with `removed_count` equal to `0` and preserves the floorplan and its areas

#### Scenario: Concurrent resets converge safely
- **GIVEN** an accessible floorplan contains item placements
- **WHEN** two authorized reset requests overlap
- **THEN** both requests complete without corrupting data, the sum of their `removed_count` values equals the number of placements present before either transaction, and the floorplan has no item placements or BOM rows afterward

#### Scenario: Transaction failure rolls back all deletion
- **GIVEN** a reset encounters a database failure after deletion work begins
- **WHEN** the transaction fails
- **THEN** the system returns an error and retains the pre-request placements and BOM rows without a partial reset

### Requirement: Reset endpoint fails closed
The reset API SHALL accept a positive integer floorplan identifier and require a valid authenticated identity. Only `admin` and `tenant_admin` roles MAY reset a floorplan. A `tenant_admin` MAY reset only a floorplan whose project belongs to that administrator's tenant; a global `admin` MAY reset an accessible floorplan in any tenant. The server MUST derive role and tenant from the verified token, MUST NOT trust client-supplied tenant or project identifiers, and MUST apply authorization before deletion.

#### Scenario: Missing or invalid authentication is rejected
- **WHEN** a client requests a floorplan reset without a valid access token
- **THEN** the system returns `401` and changes no data

#### Scenario: Read-only role is rejected
- **GIVEN** an authenticated caller has the `user` role
- **WHEN** the caller requests a floorplan reset
- **THEN** the system returns `403` and changes no data

#### Scenario: Cross-tenant target is concealed
- **GIVEN** an authenticated `tenant_admin` supplies a floorplan identifier belonging to another tenant
- **WHEN** the caller requests a reset
- **THEN** the system returns `404` without revealing whether the floorplan exists and changes no data

#### Scenario: Missing target is rejected
- **GIVEN** an authorized caller supplies a well-formed identifier that does not resolve to an accessible floorplan
- **WHEN** the caller requests a reset
- **THEN** the system returns `404` and changes no data

#### Scenario: Malformed target is rejected
- **GIVEN** an authenticated editor supplies a floorplan identifier that is not a positive integer
- **WHEN** the caller requests a reset
- **THEN** the system returns `400` and changes no data

### Requirement: Client state follows authoritative reset outcome
After a successful reset, the system SHALL close the confirmation, display a success indication, clear any selected or edited placement and placement-specific add-on cache for that floorplan, and refresh the active floorplan's placements, BOM, and area-containment-dependent view from authoritative server data. The canvas and BOM summary MUST show the empty state without a page reload. If the request fails, the system MUST keep the modal available with a user-visible error, MUST NOT present success, and MUST refetch authoritative floorplan state before permitting a retry.

#### Scenario: Successful reset refreshes the active design
- **GIVEN** the Clean Slate confirmation is open for a populated active floorplan
- **WHEN** the reset succeeds
- **THEN** the modal closes, success is indicated, selection/edit state and placement-specific cache are cleared, placements/BOM/area-dependent state is refreshed, and the canvas and totals show no placed products without reloading the page

#### Scenario: Failed reset preserves authoritative content
- **GIVEN** the Clean Slate confirmation is open
- **WHEN** the reset request fails due to a server or network error
- **THEN** the system shows an actionable error in or with the modal, does not show success, refetches the active floorplan state, and allows a retry only after that reconciliation completes

#### Scenario: Active floorplan changes during request
- **GIVEN** a reset is pending for one floorplan
- **WHEN** the user changes the active floorplan before the response arrives
- **THEN** the response is applied only to the requested floorplan's cached data and MUST NOT clear or overwrite the newly active floorplan's placements, BOM, selection, or area state

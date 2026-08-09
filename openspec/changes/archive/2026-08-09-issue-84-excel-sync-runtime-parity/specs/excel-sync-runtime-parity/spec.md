## Purpose

Ensure Excel catalog synchronization preserves product-type boundaries and produces equivalent, fail-closed results in explicitly configured isolated and continuous-integration backend test runtimes.

## ADDED Requirements

### Requirement: Missing-product deactivation is limited to the selected product type
When synchronizing an Excel catalog for a selected product type, the system SHALL deactivate only active products of that selected type whose base model numbers are absent from the imported catalog. It SHALL preserve products assigned to every other product type and SHALL count only products actually deactivated by the operation.

#### Scenario: Missing selected-type product is deactivated
- **GIVEN** an active product belongs to the selected product type
- **WHEN** its base model number is absent from the imported catalog
- **THEN** the system deactivates that product and includes it in the product deactivation count

#### Scenario: Product of another type remains active
- **GIVEN** an active product belongs to a product type other than the selected type
- **WHEN** its base model number is absent from the imported catalog
- **THEN** the system leaves that product active and excludes it from the product deactivation count

#### Scenario: Imported selected-type product remains active
- **GIVEN** an existing product belongs to the selected product type
- **WHEN** its base model number is present in the imported catalog
- **THEN** the system leaves or makes that product active and does not count it as deactivated

### Requirement: Invalid synchronization scope fails closed
The system SHALL validate the selected product type and imported catalog before destructive synchronization mutations. Missing, invalid, or ambiguous scope SHALL NOT cause an all-types or broader fallback.

#### Scenario: Selected product type does not exist
- **GIVEN** no product type matches the supplied selection
- **WHEN** catalog synchronization is requested
- **THEN** the operation fails without deactivating products or categories

#### Scenario: Catalog cannot establish a valid import set
- **GIVEN** the supplied workbook is unreadable or cannot establish valid catalog rows
- **WHEN** synchronization evaluates destructive cleanup
- **THEN** the operation fails without broadening product-type scope or deactivating products outside a validated selection

### Requirement: Category cleanup evaluates active products across all types
After selected-type synchronization, the system SHALL deactivate a category only when it contains no active products of any product type. A category that contains an active product outside the selected type SHALL remain active.

#### Scenario: Shared category is preserved
- **GIVEN** a category contains an active product of another product type
- **WHEN** selected-type synchronization performs category cleanup
- **THEN** the system leaves the category active

#### Scenario: Category emptied by selected-type deactivation is deactivated
- **GIVEN** a category's only active product is a missing product of the selected type
- **WHEN** synchronization deactivates that product and performs category cleanup
- **THEN** the system deactivates the empty category and includes it in the category deactivation count

### Requirement: Backend synchronization tests use explicit deterministic state
Backend tests that exercise catalog synchronization SHALL select, initialize, and reset their database through tracked test configuration. Their result SHALL NOT depend on an untracked `.env` file, test order, a developer database, or prior filesystem state.

#### Scenario: Isolated run has no env file
- **GIVEN** the focused synchronization regression runs in a clean isolated checkout without a backend `.env` file
- **WHEN** tracked test bootstrap initializes the test runtime
- **THEN** the test uses isolated deterministic state and produces the required product-type isolation result

#### Scenario: CI and isolated runs use equivalent semantics
- **GIVEN** the focused regression and complete backend suite execute the same exact revision
- **WHEN** one run is isolated and another runs in GitHub Actions
- **THEN** both use equivalent tracked database semantics and produce the same product-type isolation outcome

#### Scenario: Non-test database state cannot leak into tests
- **GIVEN** developer or filesystem database state exists outside the test database
- **WHEN** backend synchronization tests initialize
- **THEN** they fail closed or use their explicitly isolated database without reading or mutating that external state

### Requirement: Continuous integration detects isolation violations
The backend continuous-integration gate SHALL execute the product-type isolation regression on the exact checked-out revision and SHALL fail when synchronization deactivates a product outside the selected type. A passing gate SHALL NOT rely on generating an untracked `.env` file that changes test database semantics.

#### Scenario: Cross-type deactivation fails the gate
- **GIVEN** synchronization incorrectly deactivates a protected product of another type
- **WHEN** the focused regression or complete backend gate runs
- **THEN** the test and gate fail

#### Scenario: Correct exact revision passes both environments
- **GIVEN** the corrected exact revision is tested in an isolated runtime and by GitHub Actions
- **WHEN** the focused regression and complete backend suite finish
- **THEN** both pass with equivalent product-type isolation results

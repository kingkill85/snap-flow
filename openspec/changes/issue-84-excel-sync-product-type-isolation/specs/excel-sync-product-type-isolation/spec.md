## Purpose

Ensure Excel catalog synchronization preserves product-type boundaries and is verified under an explicit, reproducible backend test environment.

## ADDED Requirements

### Requirement: Missing-product deactivation is scoped to the selected product type
When synchronizing a catalog for a selected product type, the system SHALL deactivate only active products of that selected type whose base model numbers are absent from the imported catalog. The system SHALL preserve the active state of products assigned to every other product type, including products that share categories with the selected type.

#### Scenario: Missing selected-type product is deactivated
- **WHEN** a catalog synchronization selects one product type and an existing active product of that type is absent from the imported catalog
- **THEN** the system deactivates that missing product and includes it in the synchronization's product deactivation count

#### Scenario: Product of another type remains active
- **WHEN** a catalog synchronization selects one product type and an active product of another type is absent from the imported catalog
- **THEN** the system leaves the other-type product active and excludes it from the synchronization's product deactivation count

#### Scenario: Imported selected-type product remains active
- **WHEN** an existing product of the selected type is represented by its base model number in the imported catalog
- **THEN** the system leaves or makes that product active and does not count it as deactivated

### Requirement: Category cleanup reflects products across all product types
After a selected-type catalog synchronization, the system SHALL deactivate a category only when that category contains no active products of any product type. A category containing an active product outside the selected type SHALL remain active.

#### Scenario: Shared category is preserved
- **WHEN** cleanup evaluates a category after selected-type synchronization and the category contains an active product of another type
- **THEN** the system leaves the category active

#### Scenario: Category emptied by selected-type deactivation is deactivated
- **WHEN** cleanup evaluates a category whose only active product was a missing product of the selected type that the synchronization deactivated
- **THEN** the system deactivates that category and includes it in the category deactivation count

### Requirement: Backend synchronization tests use an explicit deterministic database
Backend tests that exercise catalog synchronization SHALL select their test database explicitly through tracked test configuration or test bootstrap. Their correctness SHALL NOT depend on discovering an untracked `.env` file or on a developer database's prior filesystem state.

#### Scenario: Isolated run without an env file
- **WHEN** the focused synchronization regression test runs in an isolated checkout without a backend or repository `.env` file
- **THEN** it uses the intended test database and produces the same isolation result as the configured CI run

#### Scenario: Full backend suite uses the same semantics
- **WHEN** the complete backend test suite runs from the same exact revision as the focused regression test
- **THEN** database selection and initialization preserve the same product-type isolation behavior without relying on test order or persistent singleton state

### Requirement: Continuous integration fails closed on isolation violations
The backend continuous-integration gate SHALL exercise the product-type isolation regression on the exact checked-out revision and SHALL fail when a synchronization deactivates a product outside the selected type. A passing result SHALL NOT depend on an untracked environment file changing which database or state the test uses.

#### Scenario: Isolation violation is detected
- **WHEN** synchronization deactivates a protected product belonging to a non-selected type during the regression test
- **THEN** the focused test and the complete backend gate fail

#### Scenario: Same revision passes in isolated and CI runtimes
- **WHEN** the corrected exact revision is tested both without an untracked `.env` in an isolated runtime and by the GitHub backend check
- **THEN** the focused regression and complete backend suite pass with equivalent product-type isolation outcomes

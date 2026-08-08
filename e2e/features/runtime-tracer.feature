@infrastructure
Feature: SnapFlow real-runtime tracer
  The E2E control plane proves that a browser reaches the real frontend and backend.

  Scenario: Browser reaches both SnapFlow runtime layers
    Given the isolated SnapFlow runtime is ready
    When the tracer browser opens the SnapFlow login page
    Then the real frontend renders the SnapFlow sign-in form
    And the real backend health endpoint reports ready

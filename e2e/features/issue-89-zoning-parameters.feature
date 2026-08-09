@issue-89
Feature: Generic Product Type zoning parameters

  # openspec-scenario: openspec/changes/issue-89-generic-zoning-parameters/specs/product-type-zoning-parameters/spec.md#administrator-creates-a-definition
  Scenario: Administrator creates a definition
    Given an existing Product Type and an authenticated administrator
    When the administrator creates a parameter with a valid name and order
    Then the system persists a new stable identity owned by that Product Type
    And returns the definition in the Product Type's ordered parameter collection

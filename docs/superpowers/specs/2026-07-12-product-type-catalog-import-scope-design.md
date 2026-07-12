# Product-Type-Scoped Catalog Import

## Problem

Catalog import accepts a selected product type and correctly intends to deactivate products of that type when they are absent from the imported Excel file. Category synchronization currently deactivates every database category absent from the file before product synchronization. Deactivating a category cascades to all products in that category without filtering by product type. Products from unrelated product types therefore become inactive and disappear from the catalog.

Catalog import uses soft deletion: records remain in the database with `is_active = false` so existing references remain intact and later imports can reactivate them.

## Required Behavior

- An import for product type A may create, update, reactivate, or deactivate only products belonging to product type A.
- Products belonging to every other product type must retain their active state.
- Categories present in the imported file are created or reactivated as needed.
- Category cleanup runs only after products for the selected type have been synchronized.
- A category absent from the imported file is deactivated only when it has no active products remaining across any product type.
- A category shared with an active product from another product type remains active.
- No products or categories are physically deleted by catalog import.

## Design

Split category synchronization into two responsibilities:

1. Before product synchronization, create or reactivate categories present in the Excel file. Do not deactivate missing categories at this stage.
2. Synchronize products for the selected product type. Deactivate only products of that type whose base model numbers are absent from the file.
3. After product and variant synchronization, evaluate categories absent from the Excel file. Deactivate only categories with zero active products. Because no active products remain, the existing category-deactivation cascade cannot affect an active product from another type.

The category repository will expose a focused active-product check, or the synchronization service will use an equivalent repository query. The synchronization service remains responsible for deciding when category cleanup is appropriate.

## Error Handling and Transactions

All synchronization phases remain inside the existing database transaction. Any failure rolls back product and category state together. Existing structured import errors and result counters remain unchanged, except category deactivation counts now reflect only categories that became empty.

## Tests

Add a service-level regression test that creates two product types and categories, then imports a catalog for the first type. It must prove:

- a missing product of the imported type becomes inactive;
- an active product of the other type remains active;
- a category used by that other product remains active;
- a missing category containing no active products becomes inactive;
- no database records are physically deleted.

Run the focused backend test first, then the complete backend test and lint commands.

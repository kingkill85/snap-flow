# Product-Type-Scoped Catalog Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent a catalog import for one product type from deactivating products belonging to another product type while still deactivating genuinely empty categories.

**Architecture:** Keep product synchronization scoped by the selected `typeId`. Split category synchronization into an early create/reactivate pass and a late cleanup pass; the cleanup deactivates a category only when no active product of any type remains in it. Preserve the existing transaction and soft-deletion behavior.

**Tech Stack:** Deno 2.8, TypeScript strict mode, SQLite, npm `xlsx`, Deno.test, `@std/assert`

## Global Constraints

- Catalog import uses soft deletion only: products and categories remain in the database with `is_active = false`.
- An import may deactivate products only for its selected product type.
- A category shared with any active product remains active.
- A category absent from the Excel file may be deactivated only after synchronization leaves it with zero active products across all product types.
- Keep every database mutation inside the existing `syncCatalog` transaction.
- Do not change frontend behavior, API request/response formats, migrations, or database schema.

---

## File Structure

- Modify `backend/tests/services/excel-sync_test.ts`: add a public-API regression test that builds a minimal workbook and verifies cross-type isolation, empty-category cleanup, and retained database records.
- Modify `backend/src/repositories/category.ts`: add the focused `hasActiveItems(categoryId)` query used to guard category deactivation.
- Modify `backend/src/services/excel-sync.ts`: stop deactivating categories during the initial pass and add guarded cleanup after item/variant/add-on synchronization.

### Task 1: Scope Catalog Deactivation by Product Type

**Files:**
- Modify: `backend/tests/services/excel-sync_test.ts`
- Modify: `backend/src/repositories/category.ts`
- Modify: `backend/src/services/excel-sync.ts`

**Interfaces:**
- Consumes: `ExcelSyncService.syncCatalog(excelPath: string, typeId: number): Promise<SyncResult>` and the existing category/item repository APIs.
- Produces: `CategoryRepository.hasActiveItems(categoryId: number): Promise<boolean>`.
- Preserves: the `SyncResult` structure, the `/api/items/sync-catalog?type_id=...` contract, and transaction rollback behavior.

- [ ] **Step 1: Write the failing cross-type regression test**

Add the `xlsx` and item-type imports at the top of `backend/tests/services/excel-sync_test.ts`:

```typescript
import * as xlsx from 'xlsx';
import { itemTypeRepository } from '../../src/repositories/item-type.ts';
```

Then add this test after the existing repository tests:

```typescript
Deno.test('ExcelSyncService - import only deactivates missing items from the selected product type', async () => {
  clearDatabase();

  const importedType = await itemTypeRepository.create({
    name: 'Imported Type',
    abbreviation: 'IMP',
  });
  const protectedType = await itemTypeRepository.create({
    name: 'Protected Type',
    abbreviation: 'PRO',
  });

  const sharedCategory = await categoryRepository.create({ name: 'Shared Category' });
  const emptyAfterImportCategory = await categoryRepository.create({ name: 'Obsolete Category' });

  const missingImportedItem = await itemRepository.create({
    category_id: emptyAfterImportCategory.id,
    type_id: importedType.id,
    name: 'Missing Imported Product',
    base_model_number: 'IMP-OLD',
  });
  const protectedItem = await itemRepository.create({
    category_id: sharedCategory.id,
    type_id: protectedType.id,
    name: 'Protected Product',
    base_model_number: 'PRO-KEEP',
  });

  const worksheet = xlsx.utils.aoa_to_sheet([
    [],
    [],
    [],
    ['Imported Category', '', '', 'Current Imported Product', '', 'IMP-NEW', '', 'Default', 'IMP-NEW-DEFAULT', 100],
  ]);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Catalog');
  const workbookBytes = xlsx.write(workbook, { type: 'array', bookType: 'xlsx' });
  const relativePath = 'imports/product-type-scope-test.xlsx';
  const fullPath = `./uploads/${relativePath}`;

  await Deno.mkdir('./uploads/imports', { recursive: true });
  await Deno.writeFile(fullPath, new Uint8Array(workbookBytes));

  try {
    const result = await excelSyncService.syncCatalog(relativePath, importedType.id);

    assertEquals(result.success, true);
    assertEquals(result.phases.items.deactivated, 1);

    const missingImportedAfter = await itemRepository.findById(missingImportedItem.id);
    const protectedAfter = await itemRepository.findById(protectedItem.id);
    const sharedCategoryAfter = await categoryRepository.findById(sharedCategory.id);
    const emptyCategoryAfter = await categoryRepository.findById(emptyAfterImportCategory.id);

    assertExists(missingImportedAfter);
    assertExists(protectedAfter);
    assertEquals(Boolean(missingImportedAfter.is_active), false);
    assertEquals(Boolean(protectedAfter.is_active), true);
    assertEquals(Boolean(sharedCategoryAfter?.is_active), true);
    assertEquals(Boolean(emptyCategoryAfter?.is_active), false);
  } finally {
    await Deno.remove(fullPath).catch(() => {});
  }
});
```

- [ ] **Step 2: Run the focused test and verify the current bug**

Run:

```bash
cd backend && deno test --allow-all tests/services/excel-sync_test.ts --filter "import only deactivates"
```

Expected: FAIL because `protectedAfter.is_active` is `false`. The existing early category cleanup deactivates `Shared Category`, whose repository cascade deactivates `Protected Product` despite its different `type_id`.

- [ ] **Step 3: Add the category active-item guard**

Add this method to `CategoryRepository` in `backend/src/repositories/category.ts`, adjacent to `findByName`:

```typescript
  hasActiveItems(categoryId: number): Promise<boolean> {
    const result = getDb().queryEntries<{ count: number }>(
      'SELECT COUNT(*) AS count FROM items WHERE category_id = ? AND is_active = true',
      [categoryId],
    );
    return Promise.resolve(result[0].count > 0);
  }
```

This query deliberately has no `type_id` filter: category activity is shared globally, so any active product protects the category.

- [ ] **Step 4: Make initial category synchronization non-destructive**

Update the Phase 1 comment in `backend/src/services/excel-sync.ts` to state that it creates/reactivates categories and defers cleanup. In `syncCategories`, remove the existing `// Deactivate categories not in Excel` loop entirely. Retain category creation/reactivation and finish the method with:

```typescript
    result.phases.categories.total = excelCategories.size;
    this.log(
      result,
      `✓ Categories prepared: ${result.phases.categories.added} added, ${result.phases.categories.activated} activated`,
      'categories',
    );
```

- [ ] **Step 5: Add guarded late category cleanup**

Add this private method immediately after `syncCategories` in `backend/src/services/excel-sync.ts`:

```typescript
  private async deactivateEmptyCategories(
    groupedItems: Record<string, GroupedItem>,
    result: SyncResult,
  ): Promise<void> {
    const excelCategoryNames = new Set(
      Object.values(groupedItems)
        .map((item) => item.category.trim().toLowerCase())
        .filter(Boolean),
    );
    const dbCategories = await categoryRepository.findAll(true);

    for (const category of dbCategories) {
      const isPresentInExcel = excelCategoryNames.has(category.name.trim().toLowerCase());
      if (isPresentInExcel || !category.is_active) {
        continue;
      }

      if (await categoryRepository.hasActiveItems(category.id)) {
        continue;
      }

      await categoryRepository.deactivate(category.id);
      result.phases.categories.deactivated++;
      this.log(result, `  ✗ Deactivated empty category: ${category.name}`, 'categories');
    }

    this.log(
      result,
      `✓ Category cleanup complete: ${result.phases.categories.deactivated} empty categories deactivated`,
      'categories',
    );
  }
```

In `syncCatalog`, call it after `syncVariantAddons` and before `setLastSyncTimestamp`:

```typescript
        // Phase 5: Deactivate categories only when no active products remain
        await this.deactivateEmptyCategories(groupedItems, result);
```

- [ ] **Step 6: Run the focused test and verify it passes**

Run:

```bash
cd backend && deno test --allow-all tests/services/excel-sync_test.ts --filter "import only deactivates"
```

Expected: PASS. The selected-type product becomes inactive, the other-type product remains active, the shared category remains active, and the now-empty category becomes inactive while all records still exist.

- [ ] **Step 7: Run the entire Excel sync test file**

Run:

```bash
cd backend && deno test --allow-all tests/services/excel-sync_test.ts
```

Expected: all tests pass with zero failures.

- [ ] **Step 8: Run backend lint and the complete backend suite**

Run:

```bash
cd backend && deno lint
cd backend && deno task test
```

Expected: lint reports no diagnostics and the full backend suite finishes with zero failed tests.

- [ ] **Step 9: Review the diff for scope and whitespace errors**

Run:

```bash
git diff --check
git diff -- backend/src/repositories/category.ts backend/src/services/excel-sync.ts backend/tests/services/excel-sync_test.ts
```

Expected: `git diff --check` exits successfully. The diff contains only the regression test, category active-item query, deferred category cleanup, and orchestration call.

- [ ] **Step 10: Commit the fix**

```bash
git add backend/src/repositories/category.ts backend/src/services/excel-sync.ts backend/tests/services/excel-sync_test.ts
git commit -m "fix: scope catalog imports by product type"
```

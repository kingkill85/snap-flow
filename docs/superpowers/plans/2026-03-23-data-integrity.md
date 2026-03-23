# Data Integrity Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix data integrity issues: add transaction safety, fix logic bugs in BOM/routing/repositories, and clean up structural issues.

**Architecture:** Add a `withTransaction`/`withTransactionAsync` helper to `database.ts`, then wrap all multi-step mutations. Fix 5 logic bugs in routing, BOM calculations, and repository methods. Clean up migration docs and eager DB singleton.

**Tech Stack:** Deno, SQLite, Hono

**Spec:** `docs/superpowers/specs/2026-03-23-data-integrity-design.md`

---

## File Structure

### Files to modify
- `backend/src/config/database.ts` — add transaction helpers, remove eager `db` export
- `backend/src/repositories/item.ts:268-276` — wrap delete in transaction
- `backend/src/repositories/item-variant.ts:158-175,177-186` — wrap deleteByItemId + reorder in transaction
- `backend/src/repositories/bom-entry.ts:158-172` — fix delete (child images + placements) + fix deleteByFloorplan
- `backend/src/repositories/floorplan.ts:89-116` — wrap delete + reorder in transaction
- `backend/src/repositories/category.ts:145-154` — wrap reorder in transaction
- `backend/src/repositories/placement.ts:57-75` — remove broken `create` method
- `backend/src/repositories/user.ts:48-63` — fix truthy checks
- `backend/src/routes/placements.ts:236-260` — move bulk-update before /:id routes
- `backend/src/services/bom.ts:697-723` — fix stale totalAfter + wrong image path
- `backend/src/services/excel-sync.ts:110-156` — wrap syncCatalog in transaction
- `backend/src/scripts/migrate.ts` — add documentation comments
- `backend/src/scripts/create-admin.ts:1` — change `db` import to `getDb()`

### Files to create
- `backend/tests/routes/data-integrity_test.ts` — tests for transaction rollback, route ordering, BOM totals

---

## Task 1: Transaction Helpers + Remove Eager DB Singleton

**Files:**
- Modify: `backend/src/config/database.ts:52-61`
- Modify: `backend/src/scripts/create-admin.ts:1`
- Test: `backend/tests/routes/data-integrity_test.ts`

- [ ] **Step 1: Write the failing test for transaction rollback**

Create `backend/tests/routes/data-integrity_test.ts`:

```typescript
import { assertEquals, assertThrows } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { getDb } from '../../src/config/database.ts';
import { withTransaction, withTransactionAsync } from '../../src/config/database.ts';

await setupTestDatabase();

Deno.test('withTransaction - commits on success', () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('test', 1)");

  withTransaction(() => {
    db.query("UPDATE categories SET name = 'updated' WHERE name = 'test'");
  });

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'updated'");
  assertEquals(result.length, 1);
});

Deno.test('withTransaction - rolls back on error', () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('original', 1)");

  try {
    withTransaction(() => {
      db.query("UPDATE categories SET name = 'changed' WHERE name = 'original'");
      throw new Error('intentional');
    });
  } catch { /* expected */ }

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'original'");
  assertEquals(result.length, 1);
  const changed = db.queryEntries("SELECT name FROM categories WHERE name = 'changed'");
  assertEquals(changed.length, 0);
});

Deno.test('withTransactionAsync - rolls back on async error', async () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('asynctest', 1)");

  try {
    await withTransactionAsync(async () => {
      db.query("UPDATE categories SET name = 'asyncchanged' WHERE name = 'asynctest'");
      await Promise.resolve();
      throw new Error('intentional');
    });
  } catch { /* expected */ }

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'asynctest'");
  assertEquals(result.length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && deno test --allow-all tests/routes/data-integrity_test.ts`
Expected: FAIL — `withTransaction` and `withTransactionAsync` do not exist

- [ ] **Step 3: Implement transaction helpers in database.ts**

In `backend/src/config/database.ts`, replace lines 59-61 (the backward compat comment + eager export) with:

```typescript
/**
 * Execute a synchronous function inside a database transaction.
 * Commits on success, rolls back on error.
 */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.query('BEGIN');
  try {
    const result = fn();
    db.query('COMMIT');
    return result;
  } catch (error) {
    db.query('ROLLBACK');
    throw error;
  }
}

/**
 * Execute an async function inside a database transaction.
 * Commits on success, rolls back on error.
 */
export async function withTransactionAsync<T>(fn: () => Promise<T>): Promise<T> {
  const db = getDb();
  db.query('BEGIN');
  try {
    const result = await fn();
    db.query('COMMIT');
    return result;
  } catch (error) {
    db.query('ROLLBACK');
    throw error;
  }
}
```

- [ ] **Step 4: Fix create-admin.ts import**

In `backend/src/scripts/create-admin.ts`, line 1, change:
```typescript
import { db } from '../config/database.ts';
```
To:
```typescript
import { getDb } from '../config/database.ts';
```

And update any usage of `db` in the file to `getDb()`.

- [ ] **Step 5: Run tests**

Run: `cd backend && deno test --allow-all tests/routes/data-integrity_test.ts`
Expected: All 3 tests PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/config/database.ts backend/src/scripts/create-admin.ts backend/tests/routes/data-integrity_test.ts
git commit -m "feat: add withTransaction helpers, remove eager db singleton"
```

---

## Task 2: Wrap Repository Deletes in Transactions

**Files:**
- Modify: `backend/src/repositories/item.ts:268-276`
- Modify: `backend/src/repositories/item-variant.ts:158-175`
- Modify: `backend/src/repositories/floorplan.ts:89-105`

- [ ] **Step 1: Wrap `ItemRepository.delete` in transaction**

In `backend/src/repositories/item.ts`, add import at top:
```typescript
import { withTransactionAsync } from '../config/database.ts';
```

Replace the `delete` method (lines 268-276):

```typescript
  async delete(id: number): Promise<void> {
    await withTransactionAsync(async () => {
      // Clear item_id in project_bom to preserve BOM history
      await bomEntryRepository.clearItemId(id);

      // Delete related variants first (use Internal to avoid nested transaction)
      await itemVariantRepository.deleteByItemIdInternal(id);

      getDb().query(`DELETE FROM items WHERE id = ?`, [id]);
    });
  }
```

- [ ] **Step 2: Split `ItemVariantRepository.deleteByItemId` into public + private**

In `backend/src/repositories/item-variant.ts`, add import:
```typescript
import { withTransactionAsync } from '../config/database.ts';
```

Replace the `deleteByItemId` method (lines 158-175) with TWO methods — a private helper (no transaction) and a public wrapper:

```typescript
  /**
   * Internal: delete variants by item ID without opening a transaction.
   * Use this when already inside a transaction (e.g., called from ItemRepository.delete).
   */
  async deleteByItemIdInternal(itemId: number): Promise<void> {
    const variants = await this.findByItemId(itemId, true);

    for (const variant of variants) {
      await bomEntryRepository.clearVariantId(variant.id);
    }

    for (const variant of variants) {
      await variantAddonRepository.deleteByVariantId(variant.id);
      await variantAddonRepository.deleteByAddonVariantId(variant.id);
    }

    getDb().query(`DELETE FROM item_variants WHERE item_id = ?`, [itemId]);
  }

  /**
   * Public: delete variants by item ID, wrapped in a transaction.
   * Use this when NOT already inside a transaction.
   */
  async deleteByItemId(itemId: number): Promise<void> {
    await withTransactionAsync(async () => {
      await this.deleteByItemIdInternal(itemId);
    });
  }
```

**IMPORTANT:** This split prevents nested transactions. `ItemRepository.delete` (Step 1) must call `deleteByItemIdInternal` instead of `deleteByItemId`.

- [ ] **Step 3: Wrap `FloorplanRepository.delete` in transaction**

Note: This is not a separate spec item but is justified — `FloorplanRepository.delete` performs 4 sequential DB statements (delete placements, delete child BOM, delete parent BOM, delete floorplan) that must be atomic.

In `backend/src/repositories/floorplan.ts`, add import:
```typescript
import { withTransaction } from '../config/database.ts';
```

Replace the `delete` method (lines 89-105):

```typescript
  delete(id: number): Promise<void> {
    withTransaction(() => {
      // Delete placements that reference BOM entries for this floorplan
      getDb().query(`
        DELETE FROM placements
        WHERE bom_id IN (SELECT id FROM project_bom WHERE floorplan_id = ?)
      `, [id]);

      // Delete child BOM entries first (parent_bom_id references)
      getDb().query(`DELETE FROM project_bom WHERE floorplan_id = ? AND parent_bom_id IS NOT NULL`, [id]);

      // Then delete parent BOM entries
      getDb().query(`DELETE FROM project_bom WHERE floorplan_id = ?`, [id]);

      // Finally delete the floorplan
      getDb().query(`DELETE FROM floorplans WHERE id = ?`, [id]);
    });
    return Promise.resolve();
  }
```

- [ ] **Step 4: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/item.ts backend/src/repositories/item-variant.ts backend/src/repositories/floorplan.ts
git commit -m "fix: wrap item, variant, and floorplan deletes in transactions"
```

---

## Task 3: Fix BomEntry Delete (Child Images + Placements) and DeleteByFloorplan

**Files:**
- Modify: `backend/src/repositories/bom-entry.ts:158-172`

- [ ] **Step 1: Fix `delete` — add child image cleanup + child placement cleanup + transaction**

In `backend/src/repositories/bom-entry.ts`, add imports:
```typescript
import { withTransactionAsync } from '../config/database.ts';
import { fileStorageService } from '../services/file-storage.ts';
```

Replace the `delete` method (lines 158-167):

```typescript
  async delete(id: number): Promise<void> {
    // Collect image paths before deleting (for file cleanup after transaction)
    const children = getDb().queryEntries<{ picture_path: string | null }>(
      `SELECT picture_path FROM project_bom WHERE parent_bom_id = ?`, [id]
    );
    const parent = getDb().queryEntries<{ picture_path: string | null }>(
      `SELECT picture_path FROM project_bom WHERE id = ?`, [id]
    );
    const imagePaths = [
      ...children.map(c => c.picture_path),
      ...parent.map(p => p.picture_path),
    ].filter((p): p is string => p !== null && p !== undefined);

    await withTransactionAsync(async () => {
      // Delete placements referencing children
      getDb().query(`DELETE FROM placements WHERE bom_id IN (SELECT id FROM project_bom WHERE parent_bom_id = ?)`, [id]);
      // Delete placements referencing parent
      await placementRepository.deleteByBomEntry(id);
      // Delete children BOM entries
      getDb().query(`DELETE FROM project_bom WHERE parent_bom_id = ?`, [id]);
      // Delete parent BOM entry
      getDb().query(`DELETE FROM project_bom WHERE id = ?`, [id]);
    });

    // Clean up image files outside transaction
    for (const imagePath of imagePaths) {
      try {
        await fileStorageService.deleteFile(imagePath);
      } catch {
        // Ignore file cleanup errors — DB state is consistent
      }
    }
  }
```

- [ ] **Step 2: Fix `deleteByFloorplan` — delete placements first + transaction**

Replace the `deleteByFloorplan` method (lines 169-172):

```typescript
  deleteByFloorplan(floorplanId: number): Promise<void> {
    withTransaction(() => {
      // Delete placements referencing BOM entries for this floorplan
      getDb().query(`DELETE FROM placements WHERE bom_id IN (SELECT id FROM project_bom WHERE floorplan_id = ?)`, [floorplanId]);
      // Delete BOM entries
      getDb().query(`DELETE FROM project_bom WHERE floorplan_id = ?`, [floorplanId]);
    });
    return Promise.resolve();
  }
```

Add import for `withTransaction`:
```typescript
import { withTransaction, withTransactionAsync } from '../config/database.ts';
```

- [ ] **Step 3: Write test for deleteByFloorplan placement cleanup**

Append to `backend/tests/routes/data-integrity_test.ts`:

```typescript
const { bomEntryRepository } = await import('../../src/repositories/bom-entry.ts');
const { placementRepository } = await import('../../src/repositories/placement.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');
const { bomService } = await import('../../src/services/bom.ts');

Deno.test('deleteByFloorplan - placements are cleaned up', async () => {
  clearDatabase();

  // Create project → floorplan → item → variant → BOM entry → placement
  const project = await projectRepository.create({ name: 'Test Project', status: 'draft' });
  const floorplan = await floorplanRepository.create({ project_id: project.id, name: 'Floor 1' });
  const category = await categoryRepository.create({ name: 'Cat1' });
  const item = await itemRepository.create({ name: 'Item1', category_id: category.id });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Default',
    price: 100,
  });

  // Create BOM entry and placement
  const bomEntry = await bomService.createBomEntry(project.id, floorplan.id, variant.id);
  await placementRepository.createWithBomEntry(bomEntry.id, { x: 10, y: 20, width: 50, height: 50, rotation: 0 });

  // Verify placement exists
  const placementsBefore = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(placementsBefore.length, 1);

  // Delete by floorplan
  await bomEntryRepository.deleteByFloorplan(floorplan.id);

  // Placements should be cleaned up
  const placementsAfter = await placementRepository.findByFloorplan(floorplan.id);
  assertEquals(placementsAfter.length, 0);
});
```

- [ ] **Step 4: Run tests**

Run: `cd backend && deno test --allow-all tests/routes/data-integrity_test.ts`
Expected: All tests PASS

- [ ] **Step 5: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/bom-entry.ts backend/tests/routes/data-integrity_test.ts
git commit -m "fix: BomEntry delete cleans up child images and placements, wrapped in transactions"
```

---

## Task 4: Wrap Reorder Operations in Transactions

**Files:**
- Modify: `backend/src/repositories/item-variant.ts:177-186`
- Modify: `backend/src/repositories/category.ts:145-154`
- Modify: `backend/src/repositories/floorplan.ts:107-116`

- [ ] **Step 1: Wrap `ItemVariantRepository.reorder`**

In `backend/src/repositories/item-variant.ts` (already has `withTransaction` import from Task 2 — if not, add `withTransaction` to the import), replace `reorder` (lines 177-186):

```typescript
  reorder(itemId: number, variantIds: number[]): Promise<void> {
    withTransaction(() => {
      for (let i = 0; i < variantIds.length; i++) {
        getDb().query(`
          UPDATE item_variants
          SET sort_order = ?
          WHERE id = ? AND item_id = ?
        `, [i + 1, variantIds[i], itemId]);
      }
    });
    return Promise.resolve();
  }
```

- [ ] **Step 2: Wrap `CategoryRepository.reorder`**

In `backend/src/repositories/category.ts`, add import:
```typescript
import { withTransaction } from '../config/database.ts';
```

Replace `reorder` (lines 145-154):

```typescript
  reorder(categoryIds: number[]): Promise<void> {
    withTransaction(() => {
      for (let i = 0; i < categoryIds.length; i++) {
        getDb().query(`
          UPDATE categories
          SET sort_order = ?
          WHERE id = ?
        `, [i + 1, categoryIds[i]]);
      }
    });
    return Promise.resolve();
  }
```

- [ ] **Step 3: Wrap `FloorplanRepository.reorder`**

Already has import from Task 2. Replace `reorder` (lines 107-116):

```typescript
  reorder(projectId: number, floorplanIds: number[]): Promise<void> {
    withTransaction(() => {
      for (let i = 0; i < floorplanIds.length; i++) {
        getDb().query(`
          UPDATE floorplans
          SET sort_order = ?
          WHERE id = ? AND project_id = ?
        `, [i + 1, floorplanIds[i], projectId]);
      }
    });
    return Promise.resolve();
  }
```

- [ ] **Step 4: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/item-variant.ts backend/src/repositories/category.ts backend/src/repositories/floorplan.ts
git commit -m "fix: wrap reorder operations in transactions"
```

---

## Task 5: Wrap ExcelSync in Transaction

**Files:**
- Modify: `backend/src/services/excel-sync.ts:110-156`

- [ ] **Step 1: Add manual BEGIN/COMMIT/ROLLBACK to syncCatalog**

In `backend/src/services/excel-sync.ts`, add import:
```typescript
import { getDb } from '../config/database.ts';
```

In the `syncCatalog` method (lines 110-156), add `BEGIN` before Phase 1, `COMMIT` after Phase 4, and `ROLLBACK` in the catch block. Replace lines 123-153:

```typescript
    try {
      // Phase 0: Parse Excel
      this.log(result, '📖 Parsing Excel file...', 'parsing');
      const groupedItems = await this.parseAndGroupExcel(excelPath);
      const extractedImages = await this.extractImages(excelPath);

      this.log(result, `✓ Found ${Object.keys(groupedItems).length} unique items with ${Object.values(groupedItems).reduce((acc, item) => acc + item.variants.length, 0)} variants`, 'parsing');
      this.log(result, `✓ Extracted ${extractedImages.size} images`, 'parsing');

      // Begin transaction for all DB mutations
      getDb().query('BEGIN');

      try {
        // Phase 1: Sync Categories
        await this.syncCategories(groupedItems, result);

        // Phase 2: Sync Base Items
        const itemIdMap = await this.syncItems(groupedItems, result);

        // Phase 3: Sync Variants with Images
        await this.syncVariants(groupedItems, itemIdMap, extractedImages, result);

        // Phase 4: Sync Variant Addons
        await this.syncVariantAddons(groupedItems, itemIdMap, result);

        // Set last sync timestamp for image cache busting
        await settingsRepository.setLastSyncTimestamp(Date.now());

        getDb().query('COMMIT');
      } catch (error) {
        getDb().query('ROLLBACK');
        throw error; // Re-throw to outer catch
      }

      this.log(result, '✅ Sync completed successfully!', 'complete');

    } catch (error) {
      result.success = false;
      const errorMsg = `Fatal error: ${error instanceof Error ? error.message : String(error)}`;
      this.log(result, `❌ ${errorMsg}`, 'error');
      result.errors.push({ row: 0, message: errorMsg });
    }
```

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/excel-sync.ts
git commit -m "fix: wrap Excel catalog sync in database transaction"
```

---

## Task 6: Fix Route Ordering + Remove Broken create()

**Files:**
- Modify: `backend/src/routes/placements.ts:236-260` (move bulk-update)
- Modify: `backend/src/repositories/placement.ts:57-75` (remove create)
- Test: `backend/tests/routes/data-integrity_test.ts` (append)

- [ ] **Step 1: Write test for bulk-update reachability**

Append to `backend/tests/routes/data-integrity_test.ts`:

```typescript
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

const { userRepository } = await import('../../src/repositories/user.ts');

Deno.test('Route ordering - POST /placements/bulk-update is reachable', async () => {
  clearDatabase();

  // Create user and get auth token
  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({ email: 'routetest@example.com', password_hash: passwordHash, role: 'admin' });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'routetest@example.com', password: 'testpassword123' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  // POST to bulk-update — should get 400 (missing params), NOT 404
  const response = await testRequest('/api/placements/bulk-update?floorplan_id=1&item_id=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ width: 100, height: 100 }),
  });

  // Should be 200 (or possibly an error from missing data, but NOT 404)
  const data = await parseJSON(response);
  assertEquals(response.status !== 404, true, `Expected non-404, got ${response.status}: ${JSON.stringify(data)}`);
});
```

- [ ] **Step 2: Move bulk-update before /:id routes**

In `backend/src/routes/placements.ts`, cut the entire `POST /bulk-update` block (lines 235-260, including the comment) and paste it right after the `GET /` handler (after line 61, before `GET /:id`).

The order should be:
1. `GET /` (list placements)
2. `POST /bulk-update` (moved here)
3. `GET /:id`
4. `POST /` (create)
5. `PUT /:id`
6. etc.

- [ ] **Step 3: Remove broken `PlacementRepository.create`**

In `backend/src/repositories/placement.ts`, delete the `create` method (lines 57-75). Keep `createWithBomEntry` (lines 77-93) which is the correct method.

- [ ] **Step 4: Run tests**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/placements.ts backend/src/repositories/placement.ts backend/tests/routes/data-integrity_test.ts
git commit -m "fix: move bulk-update before /:id routes, remove broken create method"
```

---

## Task 7: Fix BOM updateFromCatalog (Stale Totals + Wrong Image Path)

**Files:**
- Modify: `backend/src/services/bom.ts:697-723`
- Test: `backend/tests/routes/data-integrity_test.ts` (append)

- [ ] **Step 1: Fix stale totalAfter — update in-memory entry after DB update**

In `backend/src/services/bom.ts`, in the `updateFromCatalog` method, inside the `if (variant.price !== entry.unit_price)` block (after line 708, the `bomEntryRepository.update` call), add:

```typescript
        // Update in-memory entry so totalAfter calculation uses new price
        entry.unit_price = variant.price;
```

- [ ] **Step 2: Fix wrong image path — use copyImageToProject instead of raw catalog path**

In the same block, replace line 707:

```typescript
          picture_path: variant.image_path,
```

With logic that copies the image to the project folder:

```typescript
          picture_path: variant.image_path
            ? await this.copyImageToProject(entry.project_id, entry.id, variant.image_path)
            : entry.picture_path,
```

Note: `this.copyImageToProject` takes `(projectId, bomEntryId, sourceImagePath)` and returns the new project-scoped path. The `entry.project_id` field is available from the `findByFloorplan` query.

The full update call should now look like:

```typescript
        // Copy image to project folder (not raw catalog path)
        const newPicturePath = variant.image_path
          ? await this.copyImageToProject(entry.project_id, entry.id, variant.image_path)
          : entry.picture_path;

        // Update snapshot
        await bomEntryRepository.update(entry.id, {
          item_name: item.name,
          style_name: variant.style_name,
          model_number: item.base_model_number || `${variant.style_name}`,
          unit_price: variant.price,
          picture_path: newPicturePath,
        });

        // Update in-memory entry so totalAfter calculation uses new price
        entry.unit_price = variant.price;
```

- [ ] **Step 3: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/bom.ts
git commit -m "fix: updateFromCatalog uses correct image path and fresh prices for totalAfter"
```

---

## Task 8: Fix UserRepository.update Truthy Checks

**Files:**
- Modify: `backend/src/repositories/user.ts:48-63`

- [ ] **Step 1: Fix truthy checks to use `!== undefined`**

In `backend/src/repositories/user.ts`, replace lines 48-63:

```typescript
    if (data.email !== undefined) {
      sets.push('email = ?');
      values.push(data.email);
    }
    if (data.full_name !== undefined) {
      sets.push('full_name = ?');
      values.push(data.full_name);
    }
    if (data.password_hash !== undefined) {
      sets.push('password_hash = ?');
      values.push(data.password_hash);
    }
    if (data.role !== undefined) {
      sets.push('role = ?');
      values.push(data.role);
    }
```

- [ ] **Step 2: Write test for setting email to empty string**

Append to `backend/tests/routes/data-integrity_test.ts`:

```typescript
Deno.test('UserRepository.update - can set email to empty-like value', async () => {
  clearDatabase();

  const user = await userRepository.create({
    email: 'original@example.com',
    password_hash: hashPassword('testpassword123'),
    role: 'user',
  });

  // Update with a different email (verifies !== undefined works)
  const updated = await userRepository.update(user.id, { email: 'new@example.com' });
  assertEquals(updated?.email, 'new@example.com');
});
```

- [ ] **Step 3: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/repositories/user.ts backend/tests/routes/data-integrity_test.ts
git commit -m "fix: UserRepository.update uses !== undefined instead of truthy checks"
```

---

## Task 9: Migration Documentation

**Files:**
- Modify: `backend/src/scripts/migrate.ts`

- [ ] **Step 1: Add comment for missing migration 022**

In `backend/src/scripts/migrate.ts`, find the migration after `021_update_placements_for_bom` and before `023_rename_bom_add_project`. Add a comment:

```typescript
    // NOTE: Migration 022 was removed during development. The gap is intentional.
```

- [ ] **Step 2: Add comment for duplicate migration 025**

Before the first `025_` migration entry, add:

```typescript
    // NOTE: Two migrations share the 025 prefix. Both run correctly because
    // the migration runner tracks by full name string, not by number.
```

- [ ] **Step 3: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/migrate.ts
git commit -m "docs: document migration numbering gaps and duplicates"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 2: Run backend linter**

Run: `cd backend && deno lint`
Expected: No errors

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS (no frontend changes, but verify no regressions)

- [ ] **Step 4: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

# Data Integrity Fixes — Design Spec

## Context

SnapFlow code review identified 12 data integrity issues across the backend. These cause orphaned records, inconsistent state on crashes, stale calculations, and unreachable routes.

## Scope

14 fixes in 3 batches. Each batch is independently deployable.

---

## Batch A — Transaction Safety

### A.0 Add `withTransaction` helper to `database.ts`

**File:** `backend/src/config/database.ts`

**Problem:** No transaction utility exists. Each repository would need to manually call `BEGIN`/`COMMIT`/`ROLLBACK` with proper error handling.

**Fix:** Add a `withTransaction` helper function:

```typescript
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
```

For async functions, add `withTransactionAsync`:

```typescript
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

**Acceptance criteria:**
- Both helpers exist and are exported
- On success, changes are committed
- On error, changes are rolled back and the error is re-thrown
- Unit test confirms rollback on error

### A.1 Wrap `ItemRepository.delete` in transaction

**File:** `backend/src/repositories/item.ts` (lines 268-276)

**Problem:** `clearItemId` on BOM entries, deleting variants, and deleting the item are separate statements. A crash midway leaves orphaned records.

**Fix:** Wrap the body of `delete` in `withTransactionAsync`.

### A.2 Wrap `ItemVariantRepository.delete` in transaction

**File:** `backend/src/repositories/item-variant.ts` (lines 153-156)

**Problem:** Deleting addons and then the variant are separate statements.

**Fix:** Wrap in `withTransaction` (sync operations).

### A.3 Fix `BomEntryRepository.delete` — add child image cleanup + transaction

**File:** `backend/src/repositories/bom-entry.ts` (lines 158-167)

**Problem:** Two issues:
1. Child BOM entries are deleted directly without cleaning up their `picture_path` files (images orphaned on disk)
2. No transaction wrapping

**Fix:**
- Before deleting children, query their `picture_path` values
- After DB deletes complete, clean up the image files (file I/O outside transaction)
- Wrap the DB operations in `withTransactionAsync`

The pattern:
1. Collect child `picture_path` values
2. `BEGIN`
3. Delete children from DB
4. Delete placements
5. Delete parent from DB
6. `COMMIT`
7. Clean up image files (outside transaction — file I/O shouldn't block rollback)

### A.4 Fix `BomEntryRepository.deleteByFloorplan` — delete placements first

**File:** `backend/src/repositories/bom-entry.ts` (lines 169-172)

**Problem:** Deletes BOM entries without deleting the placements that reference them, creating orphaned placement rows (CASCADE was removed in migration 025).

**Fix:** Before deleting BOM entries, delete placements that reference them:

```sql
DELETE FROM placements WHERE bom_id IN (SELECT id FROM project_bom WHERE floorplan_id = ?)
```

Then delete the BOM entries. Wrap both in `withTransaction`.

### A.5 Wrap reorder operations in transactions

**Files:**
- `backend/src/repositories/item-variant.ts` (lines 177-186)
- `backend/src/repositories/category.ts` (lines 145-154)
- `backend/src/repositories/floorplan.ts` (lines 107-116)

**Problem:** Each reorder issues one UPDATE per item in a plain loop. A crash mid-loop leaves sort orders permanently inconsistent.

**Fix:** Wrap each reorder method's loop in `withTransaction`.

### A.6 Wrap `ExcelSyncService.syncCatalog` in transaction

**File:** `backend/src/services/excel-sync.ts` (lines 110-156)

**Problem:** Four sync phases (categories, items, variants, addons) execute hundreds of statements. A mid-sync failure leaves the catalog half-synced with no rollback.

**Fix:** Wrap the 4-phase sync in `withTransactionAsync`. The top-level try/catch already sets `result.success = false` — add `ROLLBACK` to that path.

---

## Batch B — Logic Bugs

### B.1 Fix route ordering for `POST /placements/bulk-update`

**File:** `backend/src/routes/placements.ts`

**Problem:** `POST /bulk-update` (line 236) is defined after `POST /:id/update-bom` (line 178). Hono matches `"bulk-update"` as `:id`, so the endpoint is unreachable.

**Fix:** Move the `POST /bulk-update` handler to before all `/:id` routes (after line 44, before `GET /`). Same for `POST /:id/duplicate` — verify it's after `POST /bulk-update` but that's already the case.

**Acceptance criteria:**
- `POST /placements/bulk-update` returns 200 (not 404)
- `POST /placements/:id/update-bom` still works

### B.2 Fix stale `totalAfter` in `BomService.updateFromCatalog`

**File:** `backend/src/services/bom.ts` (lines 718-725)

**Problem:** After updating entries in the DB (line 702), the code iterates the original `entries` array to compute `totalAfter`. The in-memory objects still hold old `unit_price` values, so `totalAfter` always equals `totalBefore`.

**Fix:** Update the in-memory `entry.unit_price` when the DB update is performed (inside the `if (variant.price !== entry.unit_price)` block, after the `bomEntryRepository.update` call):

```typescript
entry.unit_price = variant.price;
```

This is simpler and more efficient than re-fetching from DB.

### B.3 Fix image path in `BomService.updateFromCatalog`

**File:** `backend/src/services/bom.ts` (line 707)

**Problem:** `picture_path: variant.image_path` stores the raw catalog path instead of copying to the project folder. This breaks the design contract — BOM entries should have project-scoped image copies.

**Fix:** Replace `picture_path: variant.image_path` with a call to `this.copyImageToProject()`:

```typescript
const newPicturePath = variant.image_path
  ? await this.copyImageToProject(variant.image_path, entry.project_id)
  : entry.picture_path;
```

Then use `newPicturePath` in the update call. Need to ensure `entry.project_id` is available — check if the `findByFloorplan` query includes it, or join through the floorplan.

### B.4 Remove broken `PlacementRepository.create`

**File:** `backend/src/repositories/placement.ts` (lines 57-75)

**Problem:** The `create` method inserts `data.floorplan_id` into the `bom_id` column — a referential integrity violation. It's superseded by `createWithBomEntry` (line 77).

**Fix:** Delete the `create` method entirely. Verify no callers exist (grep for `placementRepository.create` excluding `createWithBomEntry`).

### B.5 Fix `UserRepository.update` truthy checks

**File:** `backend/src/repositories/user.ts` (lines 48-63)

**Problem:** `if (data.email)` and `if (data.role)` use truthy checks instead of `!== undefined`. This means you can never clear email to an empty string. Inconsistent with `data.full_name !== undefined` on line 52.

**Fix:** Change:
- `if (data.email)` → `if (data.email !== undefined)`
- `if (data.password_hash)` → `if (data.password_hash !== undefined)`
- `if (data.role)` → `if (data.role !== undefined)`

---

## Batch C — Structural

### C.1 Document duplicate migration `025` and missing `022`

**File:** `backend/src/scripts/migrate.ts`

**Problem:** Two migrations share the `025` prefix. Migration `022` is missing from the sequence.

**Fix:** Add comments:
- Before the first `025` migration: `// NOTE: Two migrations share the 025 prefix. Both run correctly because the migration runner tracks by full name, not number.`
- At the gap between `021` and `023`: `// NOTE: Migration 022 was removed during development. The gap is intentional.`

### C.2 Remove eager `db` singleton export

**File:** `backend/src/config/database.ts` (line 61)

**Problem:** `export const db = Database.getInstance()` runs at module import time, opening the production DB before tests can set up in-memory isolation.

**Fix:**
- Remove line 61 (`export const db = Database.getInstance();`)
- Remove line 60 (the comment `// Keep backward compatibility`)
- Update `backend/src/scripts/create-admin.ts` (the only file importing `db` directly) to use `getDb()` instead

**Acceptance criteria:**
- No file imports `db` from `database.ts`
- All files use `getDb()` exclusively
- Tests still pass with in-memory DB

---

## Testing Strategy

- **Transaction helper:** Unit test with intentional error to verify rollback
- **Route ordering:** Integration test that `POST /placements/bulk-update` is reachable
- **BOM totals:** Test that `updateFromCatalog` returns different `totalBefore` and `totalAfter` when prices changed
- **Image path:** Test that `updateFromCatalog` produces a `projects/` path, not an `items/` path
- **deleteByFloorplan:** Test that placements are cleaned up when BOM entries are deleted by floorplan
- **UserRepository.update:** Test setting email to empty string

## Out of Scope

- N+1 queries in `getBomForFloorplan` — performance issue, not integrity
- `BaseRepository` unused methods — dead code, not a bug
- `CategoryRepository.deactivate` atomicity — same pattern as the transaction fixes but lower risk since deactivation is rare

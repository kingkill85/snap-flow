# Item Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-manageable item types (Zigbee, BusPro, KNX, etc.) so items are categorized by technology with separate Excel imports, color-coded markers, visibility toggles, and per-type proposal documents.

**Architecture:** New `item_types` table with CRUD. Items get a `type_id` FK. Projects get a junction table to enable/disable types. BOM entries snapshot `item_type_name`. Excel sync is scoped by type. Invoice generates separate DOCX per type.

**Tech Stack:** Deno + Hono + SQLite (backend), React 18 + TypeScript + Tailwind + shadcn/ui (frontend), docx library for DOCX generation.

**Spec:** `docs/superpowers/specs/2026-04-03-item-types-design.md`

---

## File Structure

### Backend — New Files
- `backend/migrations/030_add_item_types.sql` — Migration for item_types table, items.type_id, project_bom.item_type_name, project_item_types
- `backend/src/repositories/item-type.ts` — ItemTypeRepository CRUD
- `backend/src/routes/item-types.ts` — Item type CRUD routes
- `backend/tests/routes/item-types_test.ts` — Item type route tests

### Backend — Modified Files
- `backend/src/models/index.ts` — Add ItemType, CreateItemTypeDTO, UpdateItemTypeDTO interfaces
- `backend/src/main.ts` — Mount item-types routes
- `backend/src/repositories/item.ts` — Add type_id filter, join type info
- `backend/src/routes/items.ts` — Accept type_id in filter/create/update, pass type_id to sync
- `backend/src/services/excel-sync.ts` — Scope sync operations by type_id
- `backend/src/services/bom.ts` — Snapshot item_type_name on BOM entry creation
- `backend/src/repositories/bom-entry.ts` — Add item_type_name to create/queries
- `backend/src/routes/projects.ts` — Accept item_type_ids, return enabled types
- `backend/src/repositories/project.ts` — Manage project_item_types junction

### Frontend — New Files
- `frontend/src/services/item-type.ts` — ItemType API service
- `frontend/src/pages/catalog/ItemTypeManagement.tsx` — Item type admin page
- `frontend/src/components/items/ItemTypeFormModal.tsx` — Create/edit item type modal
- `frontend/src/components/items/ItemTypeBadge.tsx` — Colored abbreviation badge component
- `frontend/src/components/invoice/ExportTypeDialog.tsx` — Selection dialog for proposal export

### Frontend — Modified Files
- `frontend/src/App.tsx` — Add item types route
- `frontend/src/components/layout/Header.tsx` — Add Item Types nav link
- `frontend/src/pages/catalog/ItemManagement.tsx` — Type filter dropdown, type badge on items
- `frontend/src/components/items/ItemFormModal.tsx` — Type dropdown in form
- `frontend/src/components/items/ImportModal.tsx` — Type selector before upload
- `frontend/src/components/configurator/ItemPalette.tsx` — Type filter tabs, type badges
- `frontend/src/components/configurator/ConfiguratorCanvas.tsx` — Color-coded markers on placements
- `frontend/src/pages/projects/ProjectDashboard.tsx` — Type visibility toggles
- `frontend/src/components/projects/ProjectFormModal.tsx` — Item type checkboxes
- `frontend/src/services/project.ts` — Add item_type_ids to create/update DTOs
- `frontend/src/services/item.ts` — Add type_id to filter
- `frontend/src/components/invoice/SummaryTab.tsx` — Export type dialog trigger
- `frontend/src/services/invoice-docx.ts` — Filter by type, per-type document generation

---

## Task 1: Database Migration

**Files:**
- Create: `backend/migrations/030_add_item_types.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- Create item_types table
CREATE TABLE IF NOT EXISTS item_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default Zigbee type
INSERT INTO item_types (name, abbreviation, color, sort_order)
VALUES ('Zigbee', 'ZB', '#3b82f6', 1);

-- Add type_id to items, default all existing items to Zigbee (id=1)
ALTER TABLE items ADD COLUMN type_id INTEGER DEFAULT 1;

-- Add item_type_name to project_bom for snapshot
ALTER TABLE project_bom ADD COLUMN item_type_name TEXT;

-- Backfill existing BOM entries with 'Zigbee'
UPDATE project_bom SET item_type_name = 'Zigbee' WHERE item_type_name IS NULL;

-- Create project_item_types junction table
CREATE TABLE IF NOT EXISTS project_item_types (
  project_id INTEGER NOT NULL,
  item_type_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, item_type_id)
);

-- Link all existing projects to the Zigbee type
INSERT INTO project_item_types (project_id, item_type_id)
SELECT id, 1 FROM projects;
```

- [ ] **Step 2: Run migration**

Run: `cd backend && deno task migrate`
Expected: Migration 030 applied successfully.

- [ ] **Step 3: Verify migration**

Run: `cd backend && deno task dev` (start server, check it boots without errors, then stop)

- [ ] **Step 4: Commit**

```bash
git add backend/migrations/030_add_item_types.sql
git commit -m "feat: add item_types migration with Zigbee default"
```

---

## Task 2: Backend Type Definitions

**Files:**
- Modify: `backend/src/models/index.ts`

- [ ] **Step 1: Add ItemType interfaces**

Add after the Category interfaces (after line ~77 in `backend/src/models/index.ts`):

```typescript
// === Item Types ===
export interface ItemType {
  id: number;
  name: string;
  abbreviation: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateItemTypeDTO {
  name: string;
  abbreviation: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}

export interface UpdateItemTypeDTO {
  name?: string;
  abbreviation?: string;
  color?: string;
  sort_order?: number;
  is_active?: boolean;
}
```

- [ ] **Step 2: Update Item interface**

Add `type_id` to the `Item` interface and the type info fields for joined responses:

```typescript
export interface Item {
  id: number;
  category_id: number;
  type_id: number;
  name: string;
  description: string;
  base_model_number: string;
  dimensions: string;
  created_at: string;
  is_active: boolean;
  preview_image?: string | null;
  variants?: ItemVariant[];
  // Joined type info
  type_name?: string;
  type_abbreviation?: string;
  type_color?: string;
}
```

Add `type_id` to `CreateItemDTO`:

```typescript
export interface CreateItemDTO {
  category_id: number;
  type_id: number;
  name: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}
```

Add `type_id` to `UpdateItemDTO`:

```typescript
export interface UpdateItemDTO {
  category_id?: number;
  type_id?: number;
  name?: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}
```

- [ ] **Step 3: Update ProjectBom interface**

Add `item_type_name` to the `ProjectBom` interface:

```typescript
export interface ProjectBom {
  id: number;
  project_id: number;
  floorplan_id: number;
  item_id: number;
  variant_id: number;
  parent_bom_id: number | null;
  area_id: number | null;
  item_name: string;
  item_type_name: string | null;
  style_name: string | null;
  model_number: string | null;
  unit_price: number;
  picture_path: string | null;
  created_at: string;
  updated_at: string;
  children?: ProjectBom[];
  placement_count?: number;
}
```

- [ ] **Step 4: Update CreateProjectDTO and Project**

Add `item_type_ids` to `CreateProjectDTO` and `UpdateProjectDTO`:

```typescript
export interface CreateProjectDTO {
  name: string;
  status?: 'active' | 'completed' | 'cancelled';
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  tenant_id: number;
  item_type_ids?: number[];
}

export interface UpdateProjectDTO {
  name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  tenant_id?: number;
  item_type_ids?: number[];
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/index.ts
git commit -m "feat: add ItemType interfaces and update Item/ProjectBom/Project DTOs"
```

---

## Task 3: ItemType Repository

**Files:**
- Create: `backend/src/repositories/item-type.ts`

- [ ] **Step 1: Write the ItemTypeRepository**

```typescript
import { getDb, withTransaction } from '../config/database.ts';
import type { ItemType, CreateItemTypeDTO, UpdateItemTypeDTO } from '../models/index.ts';

export class ItemTypeRepository {
  findAll(includeInactive = false): Promise<ItemType[]> {
    let sql = 'SELECT id, name, abbreviation, color, sort_order, is_active, created_at FROM item_types';
    if (!includeInactive) {
      sql += ' WHERE is_active = 1';
    }
    sql += ' ORDER BY sort_order ASC, name ASC';
    const result = getDb().queryEntries(sql);
    return Promise.resolve(result as unknown as ItemType[]);
  }

  findById(id: number): Promise<ItemType | null> {
    const result = getDb().queryEntries(
      'SELECT id, name, abbreviation, color, sort_order, is_active, created_at FROM item_types WHERE id = ?',
      [id]
    );
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ItemType) : null);
  }

  findByName(name: string): Promise<ItemType | null> {
    const result = getDb().queryEntries(
      'SELECT id, name, abbreviation, color, sort_order, is_active, created_at FROM item_types WHERE name = ?',
      [name]
    );
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ItemType) : null);
  }

  async create(data: CreateItemTypeDTO): Promise<ItemType> {
    const sortOrder = data.sort_order ?? await this.getNextSortOrder();
    const isActive = data.is_active ?? true;
    const color = data.color ?? '#3b82f6';

    const result = getDb().queryEntries(`
      INSERT INTO item_types (name, abbreviation, color, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, name, abbreviation, color, sort_order, is_active, created_at
    `, [data.name, data.abbreviation, color, sortOrder, isActive]);

    return result[0] as unknown as ItemType;
  }

  update(id: number, data: UpdateItemTypeDTO): Promise<ItemType | null> {
    const sets: string[] = [];
    const values: (string | number | boolean | undefined)[] = [];

    if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
    if (data.abbreviation !== undefined) { sets.push('abbreviation = ?'); values.push(data.abbreviation); }
    if (data.color !== undefined) { sets.push('color = ?'); values.push(data.color); }
    if (data.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(data.sort_order); }
    if (data.is_active !== undefined) { sets.push('is_active = ?'); values.push(data.is_active); }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = getDb().queryEntries(`
      UPDATE item_types SET ${sets.join(', ')} WHERE id = ?
      RETURNING id, name, abbreviation, color, sort_order, is_active, created_at
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ItemType) : null);
  }

  deactivate(id: number): Promise<ItemType | null> {
    return this.update(id, { is_active: false });
  }

  activate(id: number): Promise<ItemType | null> {
    return this.update(id, { is_active: true });
  }

  delete(id: number): Promise<void> {
    // Check if items reference this type
    const items = getDb().queryEntries('SELECT id FROM items WHERE type_id = ? LIMIT 1', [id]);
    if (items.length > 0) {
      throw new Error('Cannot delete item type that has items assigned to it');
    }
    getDb().query('DELETE FROM item_types WHERE id = ?', [id]);
    return Promise.resolve();
  }

  hasItems(id: number): Promise<boolean> {
    const result = getDb().queryEntries('SELECT COUNT(*) as count FROM items WHERE type_id = ?', [id]);
    return Promise.resolve((result[0] as unknown as { count: number }).count > 0);
  }

  reorder(typeIds: number[]): Promise<void> {
    withTransaction(() => {
      for (let i = 0; i < typeIds.length; i++) {
        getDb().query('UPDATE item_types SET sort_order = ? WHERE id = ?', [i + 1, typeIds[i]]);
      }
    });
    return Promise.resolve();
  }

  getNextSortOrder(): Promise<number> {
    const result = getDb().queryEntries('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM item_types');
    return Promise.resolve((result[0] as unknown as { next: number }).next);
  }
}

export const itemTypeRepository = new ItemTypeRepository();
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/repositories/item-type.ts
git commit -m "feat: add ItemTypeRepository with CRUD operations"
```

---

## Task 4: ItemType Routes

**Files:**
- Create: `backend/src/routes/item-types.ts`
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Write item type routes**

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';
import { itemTypeRepository } from '../repositories/item-type.ts';

const itemTypeRoutes = new Hono();

const createItemTypeSchema = z.object({
  name: z.string().min(1).max(100),
  abbreviation: z.string().min(1).max(10),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().optional(),
});

const updateItemTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  abbreviation: z.string().min(1).max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.number()),
});

// GET /item-types - List all
itemTypeRoutes.get('/', authMiddleware, async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === 'true';
    const types = await itemTypeRepository.findAll(includeInactive);
    return c.json({ data: types });
  } catch (error) {
    console.error('List item types error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /item-types/:id
itemTypeRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  try {
    const type = await itemTypeRepository.findById(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type });
  } catch (error) {
    console.error('Get item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /item-types - Create
itemTypeRoutes.post('/', authMiddleware, adminMiddleware, zValidator('json', createItemTypeSchema), async (c) => {
  const data = c.req.valid('json');

  try {
    const existing = await itemTypeRepository.findByName(data.name);
    if (existing) return c.json({ error: 'Item type with this name already exists' }, 400);

    const type = await itemTypeRepository.create(data);
    return c.json({ data: type, message: 'Item type created successfully' }, 201);
  } catch (error) {
    console.error('Create item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /item-types/:id - Update
itemTypeRoutes.put('/:id', authMiddleware, adminMiddleware, zValidator('json', updateItemTypeSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const data = c.req.valid('json');

  try {
    // Check name uniqueness if changing name
    if (data.name) {
      const existing = await itemTypeRepository.findByName(data.name);
      if (existing && existing.id !== id) return c.json({ error: 'Item type with this name already exists' }, 400);
    }

    const type = await itemTypeRepository.update(id, data);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type, message: 'Item type updated successfully' });
  } catch (error) {
    console.error('Update item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /item-types/:id - Delete
itemTypeRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  try {
    const type = await itemTypeRepository.findById(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);

    await itemTypeRepository.delete(id);
    return c.json({ message: 'Item type deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot delete')) {
      return c.json({ error: error.message }, 400);
    }
    console.error('Delete item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /item-types/:id/deactivate
itemTypeRoutes.patch('/:id/deactivate', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  try {
    const type = await itemTypeRepository.deactivate(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type, message: 'Item type deactivated' });
  } catch (error) {
    console.error('Deactivate item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /item-types/:id/activate
itemTypeRoutes.patch('/:id/activate', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  try {
    const type = await itemTypeRepository.activate(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type, message: 'Item type activated' });
  } catch (error) {
    console.error('Activate item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /item-types/reorder - must be before /:id routes
itemTypeRoutes.patch('/reorder', authMiddleware, adminMiddleware, zValidator('json', reorderSchema), async (c) => {
  const { ids } = c.req.valid('json');

  try {
    await itemTypeRepository.reorder(ids);
    const types = await itemTypeRepository.findAll(true);
    return c.json({ data: types });
  } catch (error) {
    console.error('Reorder item types error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export { itemTypeRoutes };
```

- [ ] **Step 2: Mount routes in main.ts**

In `backend/src/main.ts`, add the import and route mounting. Add this import near the other route imports:

```typescript
import { itemTypeRoutes } from './routes/item-types.ts';
```

Add this line near the other `api.route()` calls (before `api.route('/items', itemRoutes)`):

```typescript
api.route('/item-types', itemTypeRoutes);
```

- [ ] **Step 3: Fix route ordering in item-types.ts**

The `/reorder` PATCH must come before `/:id` routes to avoid Hono matching "reorder" as an id. Move the reorder handler above the `/:id` GET route. Reorder the route definitions so that:
1. `GET /` (list all)
2. `POST /` (create)
3. `PATCH /reorder` (reorder — before any /:id)
4. `GET /:id`
5. `PUT /:id`
6. `DELETE /:id`
7. `PATCH /:id/deactivate`
8. `PATCH /:id/activate`

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/item-types.ts backend/src/main.ts
git commit -m "feat: add item type CRUD routes and mount in app"
```

---

## Task 5: ItemType Route Tests

**Files:**
- Create: `backend/tests/routes/item-types_test.ts`

- [ ] **Step 1: Write tests**

```typescript
import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

await setupTestDatabase();

const { userRepository } = await import('../../src/repositories/user.ts');
const { itemTypeRepository } = await import('../../src/repositories/item-type.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');

async function getAdminToken(): Promise<string> {
  clearDatabase();
  const passwordHash = hashPassword('admin123');
  await userRepository.create({
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
    tenant_id: 1,
  });
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' }),
  });
  const loginData = await parseJSON(loginResponse);
  return loginData.data.accessToken;
}

Deno.test('GET /item-types - should list active item types', async () => {
  clearDatabase();
  await itemTypeRepository.create({ name: 'Zigbee', abbreviation: 'ZB', color: '#3b82f6' });
  await itemTypeRepository.create({ name: 'KNX', abbreviation: 'KNX', color: '#f97316' });

  const token = await getAdminToken();
  // Re-create types after clearDatabase in getAdminToken
  await itemTypeRepository.create({ name: 'Zigbee', abbreviation: 'ZB', color: '#3b82f6' });
  await itemTypeRepository.create({ name: 'KNX', abbreviation: 'KNX', color: '#f97316' });

  const response = await testRequest('/api/item-types', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(data.data.length, 2);
});

Deno.test('POST /item-types - admin should create item type', async () => {
  const token = await getAdminToken();

  const response = await testRequest('/api/item-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'BusPro', abbreviation: 'BP', color: '#22c55e' }),
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.name, 'BusPro');
  assertEquals(data.data.abbreviation, 'BP');
  assertEquals(data.data.color, '#22c55e');
});

Deno.test('POST /item-types - should reject duplicate name', async () => {
  const token = await getAdminToken();
  await itemTypeRepository.create({ name: 'Zigbee', abbreviation: 'ZB' });

  const response = await testRequest('/api/item-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Zigbee', abbreviation: 'ZB2' }),
  });

  assertEquals(response.status, 400);
});

Deno.test('PUT /item-types/:id - should update item type', async () => {
  const token = await getAdminToken();
  const type = await itemTypeRepository.create({ name: 'Test', abbreviation: 'T' });

  const response = await testRequest(`/api/item-types/${type.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name: 'Updated', abbreviation: 'UP', color: '#ef4444' }),
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Updated');
  assertEquals(data.data.color, '#ef4444');
});

Deno.test('DELETE /item-types/:id - should delete type with no items', async () => {
  const token = await getAdminToken();
  const type = await itemTypeRepository.create({ name: 'ToDelete', abbreviation: 'TD' });

  const response = await testRequest(`/api/item-types/${type.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 200);
});

Deno.test('DELETE /item-types/:id - should block delete if items exist', async () => {
  const token = await getAdminToken();
  const type = await itemTypeRepository.create({ name: 'InUse', abbreviation: 'IU' });
  await itemRepository.create({
    category_id: 0,
    type_id: type.id,
    name: 'Test Item',
  });

  const response = await testRequest(`/api/item-types/${type.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(response.status, 400);
});

Deno.test('PATCH /item-types/:id/deactivate - should deactivate', async () => {
  const token = await getAdminToken();
  const type = await itemTypeRepository.create({ name: 'Active', abbreviation: 'A' });

  const response = await testRequest(`/api/item-types/${type.id}/deactivate`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.is_active, false);
});

Deno.test('PATCH /item-types/reorder - should reorder types', async () => {
  const token = await getAdminToken();
  const t1 = await itemTypeRepository.create({ name: 'First', abbreviation: 'F' });
  const t2 = await itemTypeRepository.create({ name: 'Second', abbreviation: 'S' });

  const response = await testRequest('/api/item-types/reorder', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids: [t2.id, t1.id] }),
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  // t2 should now be first (sort_order=1)
  const reorderedT2 = data.data.find((t: { id: number }) => t.id === t2.id);
  assertEquals(reorderedT2.sort_order, 1);
});
```

- [ ] **Step 2: Run tests**

Run: `cd backend && deno test --allow-all tests/routes/item-types_test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/routes/item-types_test.ts
git commit -m "test: add item type route tests"
```

---

## Task 6: Update Item Repository for type_id

**Files:**
- Modify: `backend/src/repositories/item.ts`

- [ ] **Step 1: Update findAll to support type_id filter and join type info**

In the `findAll` method, update the SELECT to join `item_types` and add `type_id` filter support. The SELECT should include:

```sql
SELECT i.id, i.category_id, i.type_id, i.name, i.description, i.base_model_number, i.dimensions, i.is_active, i.created_at,
  it.name as type_name, it.abbreviation as type_abbreviation, it.color as type_color
FROM items i
LEFT JOIN item_types it ON i.type_id = it.id
```

Add `type_id` to the filter conditions:

```typescript
if (filter?.type_id !== undefined) {
  conditions.push('i.type_id = ?');
  params.push(filter.type_id);
}
```

- [ ] **Step 2: Update findById to join type info**

Same LEFT JOIN pattern on findById so item responses always include type info.

- [ ] **Step 3: Update create to include type_id**

Add `data.type_id` to the INSERT statement.

- [ ] **Step 4: Update the update method to support type_id**

Add `type_id` to the dynamic update pattern.

- [ ] **Step 5: Run existing item tests to verify no regressions**

Run: `cd backend && deno test --allow-all tests/routes/items_test.ts` (if exists) or `cd backend && deno task test`
Expected: All existing tests pass (they'll use the default Zigbee type from migration).

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/item.ts
git commit -m "feat: add type_id filter and type info join to item repository"
```

---

## Task 7: Update Item Routes for type_id

**Files:**
- Modify: `backend/src/routes/items.ts`

- [ ] **Step 1: Add type_id to item filter**

In the `GET /items` handler, read `type_id` from query params and pass to repository:

```typescript
const type_id = c.req.query('type_id') ? parseInt(c.req.query('type_id')!) : undefined;
```

Pass it in the filter object to `itemRepository.findAll()`.

- [ ] **Step 2: Add type_id to create/update schemas**

Add `type_id: z.number()` to the create schema (required) and `type_id: z.number().optional()` to the update schema.

- [ ] **Step 3: Pass type_id in create and update handlers**

Include `type_id` from validated data in the `itemRepository.create()` and `itemRepository.update()` calls.

- [ ] **Step 4: Run backend tests**

Run: `cd backend && deno task test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/items.ts
git commit -m "feat: add type_id to item create/update/filter routes"
```

---

## Task 8: Update Excel Sync to Scope by type_id

**Files:**
- Modify: `backend/src/services/excel-sync.ts`
- Modify: `backend/src/routes/items.ts`

- [ ] **Step 1: Add typeId parameter to syncCatalog**

Update the `syncCatalog` method signature:

```typescript
async syncCatalog(excelPath: string, typeId: number): Promise<SyncResult> {
```

- [ ] **Step 2: Pass typeId to item creation/update**

In `syncItems`, when calling `itemRepository.create()` or `itemRepository.findOrCreateByBaseModelNumber()`, include `type_id: typeId`.

- [ ] **Step 3: Scope deactivation to type**

In the deactivation phase where items NOT in Excel are deactivated, add a WHERE clause to only deactivate items of the given type:

```sql
WHERE type_id = ? AND base_model_number NOT IN (...)
```

Same for variant deactivation — only deactivate variants of items belonging to this type.

- [ ] **Step 4: Update sync-catalog route to accept type_id**

In `backend/src/routes/items.ts`, the `POST /items/sync-catalog` handler should read `type_id` from the request. Since it's a multipart upload, read it from form data or query param:

```typescript
const typeIdParam = c.req.query('type_id');
if (!typeIdParam) {
  return c.json({ error: 'type_id is required' }, 400);
}
const typeId = parseInt(typeIdParam);
if (isNaN(typeId)) {
  return c.json({ error: 'Invalid type_id' }, 400);
}
```

Pass `typeId` to `excelSyncService.syncCatalog(uploadResult.filePath, typeId)`.

- [ ] **Step 5: Run backend tests**

Run: `cd backend && deno task test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/excel-sync.ts backend/src/routes/items.ts
git commit -m "feat: scope Excel sync operations by item type_id"
```

---

## Task 9: Update BOM Service to Snapshot item_type_name

**Files:**
- Modify: `backend/src/services/bom.ts`
- Modify: `backend/src/repositories/bom-entry.ts`

- [ ] **Step 1: Update BomEntryRepository to include item_type_name**

In `backend/src/repositories/bom-entry.ts`, update the `create` method's INSERT to include `item_type_name`:

```sql
INSERT INTO project_bom 
(project_id, floorplan_id, item_id, variant_id, parent_bom_id,
 item_name, item_type_name, style_name, model_number, unit_price, picture_path)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Update the RETURNING clause and all SELECT queries to include `item_type_name`.

Add `item_type_name` to `CreateBomEntryDTO` if it exists, or add it:

```typescript
item_type_name?: string;
```

- [ ] **Step 2: Update BomService.createBomEntry to look up type name**

In `backend/src/services/bom.ts`, after fetching the item, look up its type:

```typescript
import { itemTypeRepository } from '../repositories/item-type.ts';

// Inside createBomEntry, after fetching item:
const itemType = item.type_id ? await itemTypeRepository.findById(item.type_id) : null;
```

Pass it to bomEntryRepository.create:

```typescript
const mainEntry = await bomEntryRepository.create({
  project_id: projectId,
  floorplan_id: floorplanId,
  item_id: variant.item_id,
  variant_id: variantId,
  parent_bom_id: null,
  item_name: item.name,
  item_type_name: itemType?.name ?? null,
  style_name: variant.style_name,
  model_number: item.base_model_number || `${variant.style_name}`,
  unit_price: variant.price,
  picture_path: null,
});
```

- [ ] **Step 3: Do the same for recreateBomEntry**

Apply the same pattern to `recreateBomEntry` method — look up item type and pass `item_type_name` to the create call.

- [ ] **Step 4: Run backend tests**

Run: `cd backend && deno task test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/bom.ts backend/src/repositories/bom-entry.ts
git commit -m "feat: snapshot item_type_name on BOM entry creation"
```

---

## Task 10: Update Project Routes for item_type_ids

**Files:**
- Modify: `backend/src/repositories/project.ts`
- Modify: `backend/src/routes/projects.ts`

- [ ] **Step 1: Add project item type methods to ProjectRepository**

Add these methods to `backend/src/repositories/project.ts`:

```typescript
getItemTypeIds(projectId: number): Promise<number[]> {
  const result = getDb().queryEntries(
    'SELECT item_type_id FROM project_item_types WHERE project_id = ? ORDER BY item_type_id',
    [projectId]
  );
  return Promise.resolve((result as unknown as { item_type_id: number }[]).map(r => r.item_type_id));
}

setItemTypeIds(projectId: number, typeIds: number[]): Promise<void> {
  getDb().query('DELETE FROM project_item_types WHERE project_id = ?', [projectId]);
  for (const typeId of typeIds) {
    getDb().query(
      'INSERT INTO project_item_types (project_id, item_type_id) VALUES (?, ?)',
      [projectId, typeId]
    );
  }
  return Promise.resolve();
}

setDefaultItemTypes(projectId: number): Promise<void> {
  const types = getDb().queryEntries('SELECT id FROM item_types WHERE is_active = 1');
  for (const t of types) {
    const typeId = (t as unknown as { id: number }).id;
    getDb().query(
      'INSERT OR IGNORE INTO project_item_types (project_id, item_type_id) VALUES (?, ?)',
      [projectId, typeId]
    );
  }
  return Promise.resolve();
}
```

- [ ] **Step 2: Update project create route**

In `backend/src/routes/projects.ts`, after creating the project, handle item_type_ids:

```typescript
// After project creation:
if (item_type_ids && item_type_ids.length > 0) {
  await projectRepository.setItemTypeIds(project.id, item_type_ids);
} else {
  await projectRepository.setDefaultItemTypes(project.id);
}
```

Add `item_type_ids` to the create schema as `z.array(z.number()).optional()`.

- [ ] **Step 3: Update project update route**

Similar pattern — if `item_type_ids` is provided in the update body, call `setItemTypeIds`.

- [ ] **Step 4: Include item_type_ids in project responses**

In GET routes, after fetching a project, also fetch its type IDs:

```typescript
const itemTypeIds = await projectRepository.getItemTypeIds(project.id);
return c.json({ data: { ...project, item_type_ids: itemTypeIds } });
```

For list routes, fetch type IDs per project (or do a batch query).

- [ ] **Step 5: Run backend tests**

Run: `cd backend && deno task test`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/project.ts backend/src/routes/projects.ts
git commit -m "feat: add item_type_ids to project create/update/response"
```

---

## Task 11: Frontend — ItemType Service

**Files:**
- Create: `frontend/src/services/item-type.ts`

- [ ] **Step 1: Write the service**

```typescript
import api from './api';

export interface ItemType {
  id: number;
  name: string;
  abbreviation: string;
  color: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export interface CreateItemTypeDTO {
  name: string;
  abbreviation: string;
  color?: string;
}

export interface UpdateItemTypeDTO {
  name?: string;
  abbreviation?: string;
  color?: string;
  is_active?: boolean;
}

export const itemTypeService = {
  async getAll(signal?: AbortSignal, includeInactive = false): Promise<ItemType[]> {
    const params = includeInactive ? { include_inactive: 'true' } : undefined;
    const response = await api.get('/item-types', { params, signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.get(`/item-types/${id}`, { signal });
    return response.data.data;
  },

  async create(data: CreateItemTypeDTO, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.post('/item-types', data, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateItemTypeDTO, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.put(`/item-types/${id}`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/item-types/${id}`, { signal });
  },

  async deactivate(id: number, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.patch(`/item-types/${id}/deactivate`, {}, { signal });
    return response.data.data;
  },

  async activate(id: number, signal?: AbortSignal): Promise<ItemType> {
    const response = await api.patch(`/item-types/${id}/activate`, {}, { signal });
    return response.data.data;
  },

  async reorder(ids: number[]): Promise<ItemType[]> {
    const response = await api.patch('/item-types/reorder', { ids });
    return response.data.data;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/item-type.ts
git commit -m "feat: add itemTypeService frontend API client"
```

---

## Task 12: Frontend — ItemTypeBadge Component

**Files:**
- Create: `frontend/src/components/items/ItemTypeBadge.tsx`

- [ ] **Step 1: Write the badge component**

```tsx
interface ItemTypeBadgeProps {
  abbreviation: string;
  color: string;
  className?: string;
}

const ItemTypeBadge = ({ abbreviation, color, className = '' }: ItemTypeBadgeProps) => {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none ${className}`}
      style={{ backgroundColor: color }}
    >
      {abbreviation}
    </span>
  );
};

export default ItemTypeBadge;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/items/ItemTypeBadge.tsx
git commit -m "feat: add ItemTypeBadge component"
```

---

## Task 13: Frontend — ItemType Management Page

**Files:**
- Create: `frontend/src/pages/catalog/ItemTypeManagement.tsx`
- Create: `frontend/src/components/items/ItemTypeFormModal.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/Header.tsx`

- [ ] **Step 1: Write ItemTypeFormModal**

Create `frontend/src/components/items/ItemTypeFormModal.tsx`. Follow the pattern from AreaEditModal for the color picker:

```tsx
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ItemType, CreateItemTypeDTO, UpdateItemTypeDTO } from '@/services/item-type';

const PRESET_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316'];

interface ItemTypeFormModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CreateItemTypeDTO | UpdateItemTypeDTO) => Promise<void>;
  itemType: ItemType | null; // null = create, object = edit
}

const ItemTypeFormModal = ({ open, onClose, onSubmit, itemType }: ItemTypeFormModalProps) => {
  const isEdit = !!itemType;
  const [name, setName] = useState('');
  const [abbreviation, setAbbreviation] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(itemType?.name ?? '');
      setAbbreviation(itemType?.abbreviation ?? '');
      setColor(itemType?.color ?? '#3b82f6');
      setError('');
    }
  }, [open, itemType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        abbreviation: abbreviation.trim().toUpperCase(),
        color,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Item Type' : 'Create Item Type'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-2">
            <Label htmlFor="type-name">Name</Label>
            <Input id="type-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Zigbee" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type-abbr">Abbreviation</Label>
            <Input id="type-abbr" value={abbreviation} onChange={(e) => setAbbreviation(e.target.value)} required maxLength={10} placeholder="e.g. ZB" />
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map(c => (
                <button
                  key={c} type="button" onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded border border-input bg-transparent p-0.5" />
              <Input value={color} onChange={(e) => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) setColor(e.target.value); }}
                className="font-mono text-sm w-32" maxLength={7} placeholder="#3b82f6" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white" style={{ backgroundColor: color }}>
                {abbreviation.toUpperCase() || 'XX'}
              </span>
              <span className="text-sm text-muted-foreground">{name || 'Type Name'}</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isLoading}>{isEdit ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ItemTypeFormModal;
```

- [ ] **Step 2: Write ItemTypeManagement page**

Create `frontend/src/pages/catalog/ItemTypeManagement.tsx`. Follow CategoryManagement pattern:

```tsx
import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { itemTypeService } from '@/services/item-type';
import type { ItemType } from '@/services/item-type';
import { extractErrorMessage } from '@/services/api';
import ItemTypeFormModal from '@/components/items/ItemTypeFormModal';
import ItemTypeBadge from '@/components/items/ItemTypeBadge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, CheckCircle, XCircle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ItemTypeManagement = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [types, setTypes] = useState<ItemType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [typeToEdit, setTypeToEdit] = useState<ItemType | null>(null);
  const [typeToDelete, setTypeToDelete] = useState<ItemType | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const fetchTypes = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await itemTypeService.getAll(signal, showInactive);
      setTypes(data);
      setError('');
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, '');
      if (msg !== 'AbortError') setError(extractErrorMessage(err) || 'Failed to fetch item types');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchTypes(controller.signal);
    return () => controller.abort();
  }, [showInactive]);

  const handleCreate = async (data: Record<string, unknown>) => {
    await itemTypeService.create(data as { name: string; abbreviation: string; color?: string });
    fetchTypes();
  };

  const handleUpdate = async (data: Record<string, unknown>) => {
    if (!typeToEdit) return;
    await itemTypeService.update(typeToEdit.id, data as { name?: string; abbreviation?: string; color?: string });
    fetchTypes();
  };

  const handleDelete = async () => {
    if (!typeToDelete) return;
    try {
      await itemTypeService.delete(typeToDelete.id);
      fetchTypes();
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to delete item type');
    }
    setShowDeleteDialog(false);
    setTypeToDelete(null);
  };

  const handleToggleActive = async (type: ItemType) => {
    try {
      if (type.is_active) {
        await itemTypeService.deactivate(type.id);
      } else {
        await itemTypeService.activate(type.id);
      }
      fetchTypes();
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to toggle status');
    }
  };

  const moveType = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === types.length - 1) return;
    const newTypes = [...types];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newTypes[index], newTypes[targetIndex]] = [newTypes[targetIndex], newTypes[index]];
    try {
      const updated = await itemTypeService.reorder(newTypes.map(t => t.id));
      setTypes(updated);
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to reorder');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Item Types</h1>
          <p className="text-muted-foreground">Manage technology types for catalog items</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? 'Hide Inactive' : 'Show Inactive'}
          </Button>
          {isAdmin && (
            <Button onClick={() => { setTypeToEdit(null); setShowFormModal(true); }}>
              <Plus className="mr-1 h-4 w-4" /> Add Type
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Order</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Abbreviation</TableHead>
              <TableHead>Status</TableHead>
              {isAdmin && <TableHead className="w-40">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.map((type, index) => (
              <TableRow key={type.id} className={!type.is_active ? 'opacity-60' : ''}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-6">{type.sort_order}</span>
                    {isAdmin && (
                      <div className="flex flex-col">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveType(index, 'up')} disabled={index === 0}>
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => moveType(index, 'down')} disabled={index === types.length - 1}>
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: type.color }} />
                    <span className="font-medium">{type.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <ItemTypeBadge abbreviation={type.abbreviation} color={type.color} />
                </TableCell>
                <TableCell>
                  {isAdmin ? (
                    <Button variant="ghost" size="sm" onClick={() => handleToggleActive(type)}>
                      {type.is_active ? (
                        <span className="inline-flex items-center text-green-600 text-sm"><CheckCircle className="w-4 h-4 mr-1" />Active</span>
                      ) : (
                        <span className="inline-flex items-center text-muted-foreground text-sm"><XCircle className="w-4 h-4 mr-1" />Inactive</span>
                      )}
                    </Button>
                  ) : (
                    type.is_active ? (
                      <span className="inline-flex items-center text-green-600 text-sm"><CheckCircle className="w-4 h-4 mr-1" />Active</span>
                    ) : (
                      <span className="inline-flex items-center text-muted-foreground text-sm"><XCircle className="w-4 h-4 mr-1" />Inactive</span>
                    )
                  )}
                </TableCell>
                {isAdmin && (
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => { setTypeToEdit(type); setShowFormModal(true); }}>
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => { setTypeToDelete(type); setShowDeleteDialog(true); }}>
                        <Trash2 className="mr-1 h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ItemTypeFormModal
        open={showFormModal}
        onClose={() => { setShowFormModal(false); setTypeToEdit(null); }}
        onSubmit={typeToEdit ? handleUpdate : handleCreate}
        itemType={typeToEdit}
      />

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item Type</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{typeToDelete?.name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ItemTypeManagement;
```

- [ ] **Step 3: Add route to App.tsx**

Import and add route:

```tsx
import ItemTypeManagement from '@/pages/catalog/ItemTypeManagement';
```

Add after the categories route:

```tsx
<Route path="catalog/item-types" element={
  <ProtectedRoute>
    <ItemTypeManagement />
  </ProtectedRoute>
} />
```

- [ ] **Step 4: Add nav link to Header.tsx**

Add an "Item Types" link in the catalog dropdown, next to Categories and Products:

```tsx
<Link to="/catalog/item-types" className="flex items-center gap-2">
  Item Types
</Link>
```

- [ ] **Step 5: Verify in browser**

Run: `npm run dev`
Navigate to `/catalog/item-types`. Verify:
- Page loads showing the Zigbee type from migration
- Create, edit, delete, reorder all work
- Color picker works (presets + custom)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/catalog/ItemTypeManagement.tsx frontend/src/components/items/ItemTypeFormModal.tsx frontend/src/App.tsx frontend/src/components/layout/Header.tsx
git commit -m "feat: add Item Type management page with CRUD"
```

---

## Task 14: Frontend — Item Management Type Filter & Badge

**Files:**
- Modify: `frontend/src/pages/catalog/ItemManagement.tsx`
- Modify: `frontend/src/components/items/ItemFormModal.tsx`
- Modify: `frontend/src/services/item.ts`

- [ ] **Step 1: Add type_id to item service filter**

In `frontend/src/services/item.ts`, add `type_id` to the `ItemFilter` interface and the `getAll` method:

```typescript
// In ItemFilter:
type_id?: number | null;

// In getAll, add:
if (filter?.type_id !== undefined && filter.type_id !== null) {
  params.append('type_id', filter.type_id.toString());
}
```

Update `syncCatalog` to accept and pass `typeId`:

```typescript
async syncCatalog(file: File, typeId: number, signal?: AbortSignal): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await api.post(`/items/sync-catalog?type_id=${typeId}`, formData, { signal });
  return response.data.data;
},
```

- [ ] **Step 2: Add type filter dropdown to ItemManagement**

In `frontend/src/pages/catalog/ItemManagement.tsx`:

Import `itemTypeService` and `ItemType`. Add state:

```typescript
const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
```

Fetch item types on mount. Pass `type_id: selectedTypeId` to the item fetch filter.

Add a Select dropdown before the category filter:

```tsx
<Select value={selectedTypeId?.toString() ?? 'all'} onValueChange={(v) => setSelectedTypeId(v === 'all' ? null : parseInt(v))}>
  <SelectTrigger className="w-40">
    <SelectValue placeholder="All Types" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">All Types</SelectItem>
    {itemTypes.map(t => (
      <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

- [ ] **Step 3: Show type badge on each item row**

In the item table rows, add an `ItemTypeBadge` component showing the item's type:

```tsx
<ItemTypeBadge abbreviation={item.type_abbreviation} color={item.type_color} />
```

- [ ] **Step 4: Add type_id to ItemFormModal**

In `frontend/src/components/items/ItemFormModal.tsx`, add a type dropdown (required on create):

```tsx
const [typeId, setTypeId] = useState<number>(itemTypes[0]?.id ?? 0);
```

Pass `type_id: typeId` in the submit data.

- [ ] **Step 5: Verify in browser**

Check that the type filter works, badges display, and item create/edit includes type selection.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/catalog/ItemManagement.tsx frontend/src/components/items/ItemFormModal.tsx frontend/src/services/item.ts
git commit -m "feat: add item type filter, badge, and form dropdown to item management"
```

---

## Task 15: Frontend — Import Modal Type Selection

**Files:**
- Modify: `frontend/src/components/items/ImportModal.tsx`

- [ ] **Step 1: Add type selector to ImportModal**

Add state for selected type and fetch item types:

```typescript
const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
```

Fetch types on mount. Before the file upload area (step "upload"), show a required type selector:

```tsx
<div className="space-y-2">
  <Label>Item Type</Label>
  <Select value={selectedTypeId?.toString() ?? ''} onValueChange={(v) => setSelectedTypeId(parseInt(v))}>
    <SelectTrigger>
      <SelectValue placeholder="Select item type..." />
    </SelectTrigger>
    <SelectContent>
      {itemTypes.map(t => (
        <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Disable the upload/sync button until a type is selected.

- [ ] **Step 2: Pass typeId to syncCatalog**

Update the sync call:

```typescript
const response = await itemService.syncCatalog(selectedFile, selectedTypeId!) as SyncResult;
```

- [ ] **Step 3: Verify in browser**

Open import modal, verify type must be selected before upload.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/items/ImportModal.tsx
git commit -m "feat: require item type selection in Excel import modal"
```

---

## Task 16: Frontend — Project Form Item Type Checkboxes

**Files:**
- Modify: `frontend/src/components/projects/ProjectFormModal.tsx`
- Modify: `frontend/src/services/project.ts`

- [ ] **Step 1: Update project service types**

In `frontend/src/services/project.ts`, add `item_type_ids` to the DTOs and response interface:

```typescript
// In CreateProjectDTO:
item_type_ids?: number[];

// In UpdateProjectDTO:
item_type_ids?: number[];

// In Project interface:
item_type_ids?: number[];
```

- [ ] **Step 2: Add checkboxes to ProjectFormModal**

Fetch item types on mount. Add state:

```typescript
const [selectedTypeIds, setSelectedTypeIds] = useState<Set<number>>(new Set());
```

On open: if editing, set from `project.item_type_ids`. If creating, select all active types.

Render checkbox list:

```tsx
<div className="space-y-2">
  <Label>Item Types</Label>
  <div className="flex flex-wrap gap-3">
    {itemTypes.map(t => (
      <label key={t.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={selectedTypeIds.has(t.id)}
          onChange={() => {
            const next = new Set(selectedTypeIds);
            if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
            if (next.size > 0) setSelectedTypeIds(next);
          }}
          className="rounded"
        />
        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
        {t.name}
      </label>
    ))}
  </div>
  {selectedTypeIds.size === 0 && <p className="text-xs text-destructive">Select at least one type</p>}
</div>
```

Include `item_type_ids: Array.from(selectedTypeIds)` in submit data.

- [ ] **Step 3: Verify in browser**

Create/edit a project, verify checkboxes appear and default to all selected.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/projects/ProjectFormModal.tsx frontend/src/services/project.ts
git commit -m "feat: add item type checkboxes to project create/edit form"
```

---

## Task 17: Frontend — Configurator Palette Type Filter

**Files:**
- Modify: `frontend/src/components/configurator/ItemPalette.tsx`

- [ ] **Step 1: Add type filter tabs to palette**

Accept `projectItemTypeIds` prop (enabled types for this project). Fetch item types. Add state:

```typescript
const [selectedTypeFilter, setSelectedTypeFilter] = useState<number | null>(null); // null = All
```

Filter items shown in the palette by the selected type. Render filter tabs:

```tsx
<div className="flex gap-1 mb-2 flex-wrap">
  <Button variant={selectedTypeFilter === null ? 'default' : 'outline'} size="xs"
    onClick={() => setSelectedTypeFilter(null)}>All</Button>
  {itemTypes.filter(t => projectItemTypeIds.includes(t.id)).map(t => (
    <Button key={t.id} variant={selectedTypeFilter === t.id ? 'default' : 'outline'} size="xs"
      onClick={() => setSelectedTypeFilter(t.id)}>
      <span className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: t.color }} />
      {t.name}
    </Button>
  ))}
</div>
```

- [ ] **Step 2: Show type badge on palette items**

Each item in the palette grid shows an `ItemTypeBadge` in the corner:

```tsx
<ItemTypeBadge abbreviation={item.type_abbreviation} color={item.type_color} />
```

- [ ] **Step 3: Verify in browser**

Open a project configurator, verify type filter tabs appear and filter items correctly.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/configurator/ItemPalette.tsx
git commit -m "feat: add item type filter tabs and badges to configurator palette"
```

---

## Task 18: Frontend — Configurator Color-Coded Placement Markers

**Files:**
- Modify: `frontend/src/components/configurator/ConfiguratorCanvas.tsx`

- [ ] **Step 1: Add color dot to placements**

In the DraggablePlacement component, after the placement image, render a small colored circle in the top-left corner using the item's type color. The type color needs to be available on the placement data (either from joined item data or passed down).

```tsx
{placement.type === 'item' && typeColor && (
  <div
    className="absolute top-0 left-0 w-3 h-3 rounded-full border border-white/80 -translate-x-1/4 -translate-y-1/4 z-10"
    style={{ backgroundColor: typeColor }}
    title={typeName}
  />
)}
```

The type color can be derived from the item's `type_color` field (joined in the item response) or from a type lookup map passed as a prop.

- [ ] **Step 2: Add type legend panel**

Add a collapsible legend in the bottom-left corner of the canvas:

```tsx
<div className="absolute bottom-2 left-2 bg-background/90 border rounded-md p-2 text-xs space-y-1 z-20">
  {itemTypes.map(t => (
    <div key={t.id} className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
      <span>{t.name}</span>
    </div>
  ))}
</div>
```

- [ ] **Step 3: Verify in browser**

Place items on a floorplan, verify colored dots appear and legend shows.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/configurator/ConfiguratorCanvas.tsx
git commit -m "feat: add color-coded markers and type legend to floorplan placements"
```

---

## Task 19: Frontend — Configurator Type Visibility Toggles

**Files:**
- Modify: `frontend/src/pages/projects/ProjectDashboard.tsx`
- Modify: `frontend/src/components/configurator/ConfiguratorCanvas.tsx`

- [ ] **Step 1: Add type visibility state to ProjectDashboard**

Follow the existing area visibility pattern:

```typescript
const [hiddenTypeIds, setHiddenTypeIds] = useState<Set<number>>(new Set());

const handleToggleTypeVisibility = useCallback((typeId: number) => {
  setHiddenTypeIds(prev => {
    const next = new Set(prev);
    if (next.has(typeId)) next.delete(typeId);
    else next.add(typeId);
    return next;
  });
}, []);

const handleToggleAllTypesVisibility = useCallback(() => {
  setHiddenTypeIds(prev => {
    if (prev.size === projectItemTypes.length) return new Set();
    return new Set(projectItemTypes.map(t => t.id));
  });
}, [projectItemTypes]);
```

Pass `hiddenTypeIds` down to ConfiguratorCanvas.

- [ ] **Step 2: Add type toggle UI**

In the visibility controls area (near the existing category and area toggles), add a section for type toggles:

```tsx
<div className="space-y-1">
  <div className="flex items-center justify-between">
    <span className="text-xs font-medium text-muted-foreground">Types</span>
    <Button variant="ghost" size="xs" onClick={handleToggleAllTypesVisibility}>
      {hiddenTypeIds.size === 0 ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
    </Button>
  </div>
  {projectItemTypes.map(t => (
    <div key={t.id} className="flex items-center justify-between">
      <div className="flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
        <span className="text-xs">{t.name}</span>
      </div>
      <Button variant="ghost" size="xs" onClick={() => handleToggleTypeVisibility(t.id)}
        className={hiddenTypeIds.has(t.id) ? 'opacity-50' : ''}>
        {hiddenTypeIds.has(t.id) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      </Button>
    </div>
  ))}
</div>
```

- [ ] **Step 3: Filter placements in ConfiguratorCanvas**

In ConfiguratorCanvas, filter out placements whose item type is in `hiddenTypeIds`. This requires knowing each placement's item type — derive from the item data that's already loaded.

```typescript
const visiblePlacements = placements.filter(p => {
  if (p.type !== 'item') return true;
  const item = items.find(i => i.id === p.item_id);
  return !item || !hiddenTypeIds.has(item.type_id);
});
```

- [ ] **Step 4: Verify in browser**

Toggle type visibility, verify placements hide/show correctly.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/projects/ProjectDashboard.tsx frontend/src/components/configurator/ConfiguratorCanvas.tsx
git commit -m "feat: add per-type visibility toggles in configurator"
```

---

## Task 20: Frontend — Invoice Export Type Selection Dialog

**Files:**
- Create: `frontend/src/components/invoice/ExportTypeDialog.tsx`
- Modify: `frontend/src/components/invoice/SummaryTab.tsx`
- Modify: `frontend/src/services/invoice-docx.ts`

- [ ] **Step 1: Write ExportTypeDialog component**

```tsx
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { ItemType } from '@/services/item-type';

interface ExportTypeDialogProps {
  open: boolean;
  onClose: () => void;
  onExport: (typeIds: number[]) => void;
  availableTypes: ItemType[];
  isGenerating: boolean;
}

const ExportTypeDialog = ({ open, onClose, onExport, availableTypes, isGenerating }: ExportTypeDialogProps) => {
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set(availableTypes.map(t => t.id)));

  const toggle = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export Proposals</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Select which item types to include. Each type generates a separate document.</p>
        <div className="space-y-2 py-2">
          {availableTypes.map(t => (
            <label key={t.id} className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} className="rounded" />
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
              <span className="text-sm">{t.name}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onExport(Array.from(selectedIds))} disabled={selectedIds.size === 0 || isGenerating}>
            {isGenerating ? 'Generating...' : `Export ${selectedIds.size} Proposal${selectedIds.size !== 1 ? 's' : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportTypeDialog;
```

- [ ] **Step 2: Update SummaryTab to use dialog**

In `frontend/src/components/invoice/SummaryTab.tsx`:

Determine which types have placements (from the BOM/items data). If only one type, generate directly. If multiple, open ExportTypeDialog.

```typescript
const typesWithPlacements = useMemo(() => {
  const typeIds = new Set<number>();
  items.forEach(item => {
    if (item.type_id) typeIds.add(item.type_id);
  });
  return itemTypes.filter(t => typeIds.has(t.id));
}, [items, itemTypes]);

const handleGenerateClick = () => {
  if (typesWithPlacements.length <= 1) {
    handleGenerateInvoice(); // existing behavior, no filter
  } else {
    setShowExportDialog(true);
  }
};

const handleExportByTypes = async (typeIds: number[]) => {
  setIsGenerating(true);
  try {
    for (const typeId of typeIds) {
      const type = itemTypes.find(t => t.id === typeId)!;
      await generateInvoiceDOCX({
        ...invoiceProps,
        filterTypeId: typeId,
        filenameSuffix: `_${type.name}`,
      });
    }
  } finally {
    setIsGenerating(false);
    setShowExportDialog(false);
  }
};
```

- [ ] **Step 3: Update invoice-docx.ts to filter by type**

In `frontend/src/services/invoice-docx.ts`, accept an optional `filterTypeId` parameter:

```typescript
interface GenerateInvoiceOptions {
  // ... existing fields
  filterTypeId?: number;
  filenameSuffix?: string;
}
```

In `transformToPivot`, when `filterTypeId` is set, skip items whose `type_id` doesn't match:

```typescript
floorplanData.items.forEach((item: FloorplanItem) => {
  if (filterTypeId && item.typeId !== filterTypeId) return;
  // ... rest of existing logic
});
```

Update the filename:

```typescript
const fileName = `${projectName}${filenameSuffix || ''}_Proposal.docx`;
```

- [ ] **Step 4: Verify in browser**

Place items of different types. Generate proposal. Verify dialog appears when multiple types have placements.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/invoice/ExportTypeDialog.tsx frontend/src/components/invoice/SummaryTab.tsx frontend/src/services/invoice-docx.ts
git commit -m "feat: add export type selection dialog and per-type DOCX generation"
```

---

## Task 21: Backend Lint & Full Test Run

- [ ] **Step 1: Run backend lint**

Run: `cd backend && deno lint`
Expected: No errors. Fix any that appear.

- [ ] **Step 2: Run all backend tests**

Run: `cd backend && deno task test`
Expected: All tests pass.

- [ ] **Step 3: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No errors. Fix any that appear.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests pass.

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A
git commit -m "fix: lint and test fixes for item types feature"
```

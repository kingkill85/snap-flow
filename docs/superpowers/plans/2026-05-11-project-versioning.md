# Project Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement project versioning allowing users to create multiple independent versions ("Save As") of a project, each with its own floorplans/placements, while sharing customer info through a project group.

**Architecture:** Introduce `project_groups` table for customer-level data. Projects become versions with `version_name` and `project_group_id`. Deep-copy transaction creates new versions with remapped IDs. Frontend shows grouped project list with expand/collapse.

**Tech Stack:** Deno + Hono + SQLite (backend), React + TypeScript + Vite + shadcn/ui (frontend)

---

## File Structure

### Backend - New Files
- `backend/src/models/project-group.ts` — ProjectGroup, ProjectVersion, CreateVersionDTO types
- `backend/src/repositories/project-group.ts` — CRUD + deep copy logic with ID remapping
- `backend/src/routes/project-groups.ts` — Hono routes for groups and version creation
- `backend/migrations/033_project_versioning.sql` — Schema migration

### Backend - Modified Files
- `backend/src/models/index.ts` — Update Project, CreateProjectDTO, UpdateProjectDTO types
- `backend/src/repositories/project.ts` — Adapt to new schema (drop customer fields, add version_name, add project_group_id joins)
- `backend/src/routes/projects.ts` — Adapt POST/PUT/DELETE for group/version split
- `backend/src/config/routes.ts` — Register new project-groups routes

### Frontend - New Files
- `frontend/src/services/projectGroup.ts` — API service for project groups
- `frontend/src/components/projects/CreateVersionModal.tsx` — Simple modal for version name
- `frontend/src/components/projects/EditGroupModal.tsx` — Edit group customer info

### Frontend - Modified Files
- `frontend/src/services/project.ts` — Update types (Project, DTOs), add `group` nesting
- `frontend/src/pages/projects/ProjectList.tsx` — Grouped table view with expand/collapse
- `frontend/src/pages/projects/ProjectDashboard.tsx` — Pass `project.group` to components
- `frontend/src/components/projects/ProjectHeader.tsx` — Show breadcrumb [Group] > [Version]
- `frontend/src/components/projects/ProjectFormModal.tsx` — Split: create mode (group+version) vs edit mode (version only)
- `frontend/src/hooks/useProjectData.ts` — Handle new API response shape

---

## Prerequisites

- Branch: `feature/project-versioning` (already created)
- Spec: `docs/superpowers/specs/2026-05-11-project-versioning-design.md`
- Database migrations run via: `cd backend && deno task migrate`

---

## Task 1: Database Migration

**Files:**
- Create: `backend/migrations/033_project_versioning.sql`

**Purpose:** Create `project_groups` table, backfill existing projects, modify `projects` table.

### Step 1.1: Write migration SQL

```sql
-- 033_project_versioning.sql

-- Step 1: Create project_groups table
CREATE TABLE IF NOT EXISTS project_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  tenant_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (name, customer_name, tenant_id)
);

-- Step 2: Add new columns to projects (temporary nullable to allow backfill)
ALTER TABLE projects ADD COLUMN project_group_id INTEGER;
ALTER TABLE projects ADD COLUMN version_name TEXT DEFAULT 'v1';
ALTER TABLE projects ADD COLUMN google_exchange_rate REAL DEFAULT 1.0;

-- Step 3: Backfill: create one group per existing project
INSERT INTO project_groups (name, customer_name, customer_email, customer_phone, customer_address, tenant_id)
SELECT 
  name,
  customer_name,
  customer_email,
  customer_phone,
  customer_address,
  tenant_id
FROM projects;

-- Step 4: Link projects to their new groups
UPDATE projects 
SET project_group_id = (
  SELECT pg.id 
  FROM project_groups pg 
  WHERE pg.name = projects.name 
    AND pg.customer_name = projects.customer_name
    AND pg.tenant_id = projects.tenant_id
);

-- Step 5: Make project_group_id NOT NULL now that backfill is complete
-- SQLite doesn't support ALTER COLUMN, so we recreate the table
-- (in SQLite with Deno, we can use a simpler approach: just ensure all rows have values)
-- Check if any rows still have NULL project_group_id
-- If they do, set them to a dummy group or the backfill failed

-- Step 6: Drop old columns from projects (migrated to project_groups)
-- SQLite doesn't support DROP COLUMN directly before v3.35.0
-- For compatibility, we recreate the projects table
CREATE TABLE projects_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_group_id INTEGER NOT NULL,
  version_name TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
  tenant_id INTEGER NOT NULL,
  discount_percentage REAL DEFAULT 0,
  discount_usd REAL DEFAULT 0,
  services_percentage REAL DEFAULT 0,
  services_usd REAL DEFAULT 0,
  local_currency_code TEXT,
  exchange_rate REAL DEFAULT 1.0,
  google_exchange_rate REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (project_group_id) REFERENCES project_groups(id) ON DELETE CASCADE
);

INSERT INTO projects_new (
  id, project_group_id, version_name, status, tenant_id,
  discount_percentage, discount_usd, services_percentage, services_usd,
  local_currency_code, exchange_rate, google_exchange_rate, created_at
)
SELECT 
  id, project_group_id, version_name, status, tenant_id,
  discount_percentage, discount_usd, services_percentage, services_usd,
  local_currency_code, exchange_rate, google_exchange_rate, created_at
FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

CREATE INDEX idx_projects_group ON projects(project_group_id);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);

-- Step 7: Update project_bom foreign key references
-- (project_bom already has project_id, stays the same)
```

**Note:** The migration is complex because SQLite lacks `ALTER TABLE DROP COLUMN`. Test thoroughly with existing data.

### Step 1.2: Test migration

Run: `cd backend && deno task migrate`

Expected: Migration succeeds, existing projects preserved with groups created.

### Step 1.3: Commit

```bash
git add backend/migrations/033_project_versioning.sql
git commit -m "feat: add project versioning migration\n\n- Create project_groups table\n- Backfill existing projects into groups\n- Add project_group_id, version_name to projects\n- Migrate customer fields to project_groups"
```

---

## Task 2: Backend Models

**Files:**
- Modify: `backend/src/models/index.ts`
- Create: `backend/src/models/project-group.ts`

### Step 2.1: Update Project types in models/index.ts

Replace the Project, CreateProjectDTO, UpdateProjectDTO interfaces:

```typescript
// Project (now a Version within a Group)
export interface Project {
  id: number;
  project_group_id: number;
  version_name: string;
  status: 'active' | 'completed' | 'cancelled';
  tenant_id: number;
  created_at: string;
  // Invoice settings
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  local_currency_code: string;
  exchange_rate: number;
  google_exchange_rate: number;
}

export interface CreateProjectDTO {
  group_name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  version_name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  item_type_ids?: number[];
  tenant_id: number;
}

export interface UpdateProjectDTO {
  version_name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  tenant_id?: number;
}
```

**Note:** Remove `customer_name`, `customer_email`, `customer_phone`, `customer_address`, and `name` from UpdateProjectDTO. Remove `name` from Project interface.

### Step 2.2: Create project-group.ts

```typescript
// backend/src/models/project-group.ts
import type { Project } from './index.ts';

export interface ProjectGroup {
  id: number;
  name: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tenant_id: number;
  created_at: string;
}

export interface ProjectGroupWithVersions extends ProjectGroup {
  versions: ProjectVersion[];
}

export interface ProjectVersion {
  id: number;
  version_name: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface CreateProjectGroupDTO {
  name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  tenant_id: number;
}

export interface UpdateProjectGroupDTO {
  name?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
}

export interface CreateVersionDTO {
  version_name: string;
}
```

### Step 2.3: Commit

```bash
git add backend/src/models/index.ts backend/src/models/project-group.ts
git commit -m "feat: add ProjectGroup and update Project models\n\n- Project now represents a version\n- Group holds customer info\n- Separate DTOs for group vs version"
```

---

## Task 3: Backend Repository - ProjectGroup

**Files:**
- Create: `backend/src/repositories/project-group.ts`

### Step 3.1: Write the repository

```typescript
// backend/src/repositories/project-group.ts
import { getDb, withTransactionAsync } from '../config/database.ts';
import type {
  ProjectGroup,
  ProjectGroupWithVersions,
  CreateProjectGroupDTO,
  UpdateProjectGroupDTO,
  CreateVersionDTO,
  Project,
} from '../models/project-group.ts';
import type { TenantContext } from './user.ts';

export class ProjectGroupRepository {
  findAll(search?: string, ctx?: TenantContext): Promise<ProjectGroupWithVersions[]> {
    let sql = `
      SELECT pg.id, pg.name, pg.customer_name, pg.customer_email, 
             pg.customer_phone, pg.customer_address, pg.tenant_id, pg.created_at
      FROM project_groups pg
    `;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (ctx && ctx.role !== 'admin') {
      conditions.push('pg.tenant_id = ?');
      params.push(ctx.tenantId);
    }

    if (search) {
      conditions.push('(pg.name LIKE ? OR pg.customer_name LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY pg.created_at DESC`;

    const groups = getDb().queryEntries(sql, params) as unknown as ProjectGroup[];
    const result: ProjectGroupWithVersions[] = [];

    for (const group of groups) {
      const versions = getDb().queryEntries(
        `SELECT id, version_name, status, created_at 
         FROM projects 
         WHERE project_group_id = ? 
         ORDER BY created_at DESC`,
        [group.id]
      ) as unknown as ProjectGroupWithVersions['versions'];

      result.push({ ...group, versions });
    }

    return Promise.resolve(result);
  }

  findById(id: number, ctx?: TenantContext): Promise<ProjectGroupWithVersions | null> {
    let sql = `SELECT * FROM project_groups WHERE id = ?`;
    const params: (string | number)[] = [id];

    if (ctx && ctx.role !== 'admin') {
      sql += ` AND tenant_id = ?`;
      params.push(ctx.tenantId);
    }

    const groups = getDb().queryEntries(sql, params) as unknown as ProjectGroup[];
    if (groups.length === 0) return Promise.resolve(null);

    const group = groups[0];
    const versions = getDb().queryEntries(
      `SELECT id, version_name, status, created_at 
       FROM projects 
       WHERE project_group_id = ? 
       ORDER BY created_at DESC`,
      [id]
    ) as unknown as ProjectGroupWithVersions['versions'];

    return Promise.resolve({ ...group, versions });
  }

  create(data: CreateProjectGroupDTO): Promise<ProjectGroup> {
    const result = getDb().queryEntries(`
      INSERT INTO project_groups (name, customer_name, customer_email, customer_phone, customer_address, tenant_id)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, name, customer_name, customer_email, customer_phone, customer_address, tenant_id, created_at
    `, [
      data.name,
      data.customer_name,
      data.customer_email || null,
      data.customer_phone || null,
      data.customer_address || null,
      data.tenant_id,
    ]);

    return Promise.resolve(result[0] as unknown as ProjectGroup);
  }

  update(id: number, data: UpdateProjectGroupDTO): Promise<ProjectGroup | null> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
    if (data.customer_name !== undefined) { sets.push('customer_name = ?'); values.push(data.customer_name); }
    if (data.customer_email !== undefined) { sets.push('customer_email = ?'); values.push(data.customer_email); }
    if (data.customer_phone !== undefined) { sets.push('customer_phone = ?'); values.push(data.customer_phone); }
    if (data.customer_address !== undefined) { sets.push('customer_address = ?'); values.push(data.customer_address); }

    if (sets.length === 0) return this.findById(id);

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE project_groups SET ${sets.join(', ')} WHERE id = ?
      RETURNING id, name, customer_name, customer_email, customer_phone, customer_address, tenant_id, created_at
    `, values);

    return Promise.resolve(result.length > 0 ? result[0] as unknown as ProjectGroup : null);
  }

  delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM project_groups WHERE id = ?`, [id]);
    // Cascades to projects via ON DELETE CASCADE (if set up)
    // Also need to cascade floorplans, placements manually or via triggers
    return Promise.resolve();
  }

  async createVersion(
    groupId: number, 
    data: CreateVersionDTO, 
    tenantId: number
  ): Promise<Project> {
    return withTransactionAsync(async () => {
      const db = getDb();

      // 1. Find latest version in group
      const latestVersions = db.queryEntries(`
        SELECT id, status, discount_percentage, discount_usd,
               services_percentage, services_usd, local_currency_code,
               exchange_rate, google_exchange_rate
        FROM projects WHERE project_group_id = ?
        ORDER BY created_at DESC LIMIT 1
      `, [groupId]) as unknown as Project[];

      if (latestVersions.length === 0) {
        throw new Error('No versions found in group');
      }

      const sourceProject = latestVersions[0];

      // 2. Create new project row
      const newProjectRows = db.queryEntries(`
        INSERT INTO projects (
          project_group_id, version_name, status, tenant_id,
          discount_percentage, discount_usd, services_percentage, services_usd,
          local_currency_code, exchange_rate, google_exchange_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `, [
        groupId, data.version_name, sourceProject.status, tenantId,
        sourceProject.discount_percentage, sourceProject.discount_usd,
        sourceProject.services_percentage, sourceProject.services_usd,
        sourceProject.local_currency_code, sourceProject.exchange_rate,
        sourceProject.google_exchange_rate,
      ]) as unknown as Project[];

      const newProject = newProjectRows[0];

      // 3. Copy floorplans and remap IDs
      const floorplans = db.queryEntries(`
        SELECT id, name, image_path, sort_order FROM floorplans WHERE project_id = ?
      `, [sourceProject.id]) as unknown as Array<{ id: number; name: string; image_path: string; sort_order: number }>;

      const floorplanIdMap = new Map<number, number>();

      for (const fp of floorplans) {
        // Copy image file (need fileStorageService)
        const newImagePath = await this._copyFloorplanImage(fp.image_path);

        const newFpRows = db.queryEntries(`
          INSERT INTO floorplans (project_id, name, image_path, sort_order)
          VALUES (?, ?, ?, ?)
          RETURNING id
        `, [newProject.id, fp.name, newImagePath, fp.sort_order]);

        const newFpId = (newFpRows[0] as Record<string, unknown>).id as number;
        floorplanIdMap.set(fp.id, newFpId);
      }

      // 4. Copy placements and remap IDs
      // placements: id, floorplan_id, item_id, x, y, width, height, rotation, type, area_id, bom_id
      const placements = db.queryEntries(`
        SELECT id, floorplan_id, item_id, x, y, width, height, rotation, type, area_id, bom_id
        FROM placements WHERE floorplan_id IN (${Array.from(floorplanIdMap.keys()).join(',')})
      `) as unknown as Array<{
        id: number; floorplan_id: number; item_id: number | null; x: number; y: number;
        width: number; height: number; rotation: number; type: string; area_id: number | null; bom_id: number | null;
      }>;

      const placementIdMap = new Map<number, number>();

      for (const p of placements) {
        const newFloorplanId = floorplanIdMap.get(p.floorplan_id);
        if (!newFloorplanId) continue;

        const newPlacementRows = db.queryEntries(`
          INSERT INTO placements (floorplan_id, item_id, x, y, width, height, rotation, type, area_id, bom_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          RETURNING id
        `, [
          newFloorplanId, p.item_id, p.x, p.y, p.width, p.height, p.rotation,
          p.type, null, null, // area_id and bom_id will be fixed in second pass
        ]);

        const newPlacementId = (newPlacementRows[0] as Record<string, unknown>).id as number;
        placementIdMap.set(p.id, newPlacementId);
      }

      // 5. Fix area_id references on placements
      for (const p of placements) {
        if (p.area_id && placementIdMap.has(p.area_id)) {
          const newId = placementIdMap.get(p.id)!;
          const newAreaId = placementIdMap.get(p.area_id);
          db.query(`UPDATE placements SET area_id = ? WHERE id = ?`, [newAreaId, newId]);
        }
      }

      // 6. Copy area_properties (for area placements)
      const areaProperties = db.queryEntries(`
        SELECT ap.placement_id, ap.name, ap.color, ap.opacity, ap.created_at
        FROM area_properties ap
        JOIN placements p ON p.id = ap.placement_id
        WHERE p.floorplan_id IN (${Array.from(floorplanIdMap.keys()).join(',')})
      `) as unknown as Array<{ placement_id: number; name: string; color: string; opacity: number; created_at: string }>;

      for (const ap of areaProperties) {
        const newPlacementId = placementIdMap.get(ap.placement_id);
        if (!newPlacementId) continue;

        db.query(`
          INSERT INTO area_properties (placement_id, name, color, opacity, created_at)
          VALUES (?, ?, ?, ?, ?)
        `, [newPlacementId, ap.name, ap.color, ap.opacity, ap.created_at]);
      }

      // 7. Copy area_vertices
      const areaVertices = db.queryEntries(`
        SELECT av.placement_id, av.vertex_index, av.x, av.y
        FROM area_vertices av
        JOIN placements p ON p.id = av.placement_id
        WHERE p.floorplan_id IN (${Array.from(floorplanIdMap.keys()).join(',')})
      `) as unknown as Array<{ placement_id: number; vertex_index: number; x: number; y: number }>;

      for (const av of areaVertices) {
        const newPlacementId = placementIdMap.get(av.placement_id);
        if (!newPlacementId) continue;

        db.query(`
          INSERT INTO area_vertices (placement_id, vertex_index, x, y)
          VALUES (?, ?, ?, ?)
        `, [newPlacementId, av.vertex_index, av.x, av.y]);
      }

      // 8. Copy placement_addons
      const addons = db.queryEntries(`
        SELECT pa.placement_id, pa.addon_variant_id, pa.is_required, pa.sort_order
        FROM placement_addons pa
        JOIN placements p ON p.id = pa.placement_id
        WHERE p.floorplan_id IN (${Array.from(floorplanIdMap.keys()).join(',')})
      `) as unknown as Array<{ placement_id: number; addon_variant_id: number; is_required: number; sort_order: number }>;

      for (const addon of addons) {
        const newPlacementId = placementIdMap.get(addon.placement_id);
        if (!newPlacementId) continue;

        db.query(`
          INSERT INTO placement_addons (placement_id, addon_variant_id, is_required, sort_order)
          VALUES (?, ?, ?, ?)
        `, [newPlacementId, addon.addon_variant_id, addon.is_required, addon.sort_order]);
      }

      // 9. Copy project_item_types
      const itemTypes = db.queryEntries(`
        SELECT item_type_id FROM project_item_types WHERE project_id = ?
      `, [sourceProject.id]) as unknown as Array<{ item_type_id: number }>;

      for (const it of itemTypes) {
        db.query(`
          INSERT INTO project_item_types (project_id, item_type_id)
          VALUES (?, ?)
        `, [newProject.id, it.item_type_id]);
      }

      return newProject;
    });
  }

  private async _copyFloorplanImage(imagePath: string): Promise<string> {
    const fileStorageService = (await import('../services/file-storage.ts')).fileStorageService;
    // Read existing file
    const exists = await fileStorageService.fileExists(imagePath);
    if (!exists) return imagePath;

    const data = await Deno.readFile(fileStorageService['getStorageDir']() + '/' + imagePath);
    const filename = imagePath.split('/').pop() || 'floorplan.jpg';
    const newPath = await fileStorageService.saveFile(data, filename, 'floorplans');
    return newPath;
  }

  countVersions(groupId: number): Promise<number> {
    const result = getDb().queryEntries(`SELECT COUNT(*) as count FROM projects WHERE project_group_id = ?`, [groupId]);
    return Promise.resolve((result[0] as Record<string, unknown>).count as number);
  }
}

export const projectGroupRepository = new ProjectGroupRepository();
```

**Note:** The `_copyFloorplanImage` method needs `fileStorageService` — adjust import/use based on actual export method.

### Step 3.2: Commit

```bash
git add backend/src/repositories/project-group.ts
git commit -m "feat: add ProjectGroupRepository with deep copy\n\n- CRUD for project groups\n- createVersion: transactional deep copy with ID remapping\n- Copies floorplans, placements, areas, addons, item types"
```

---

## Task 4: Backend Routes - Project Groups

**Files:**
- Create: `backend/src/routes/project-groups.ts`

### Step 4.1: Write routes

```typescript
// backend/src/routes/project-groups.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { projectGroupRepository } from '../repositories/project-group.ts';
import { projectRepository } from '../repositories/project.ts';
import { authMiddleware } from '../middleware/auth.ts';
import type { TenantContext } from '../repositories/user.ts';

const projectGroupRoutes = new Hono();

// Helper
function getTenantCtx(c: { get: (key: string) => unknown }): TenantContext {
  return {
    role: c.get('userRole') as TenantContext['role'],
    tenantId: c.get('tenantId') as number,
  };
}

// GET /project-groups
projectGroupRoutes.get('/', authMiddleware, async (c) => {
  try {
    const search = c.req.query('search');
    const ctx = getTenantCtx(c);
    const groups = await projectGroupRepository.findAll(search || undefined, ctx);
    return c.json({ data: groups });
  } catch (error) {
    console.error('List project groups error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /project-groups/:id
projectGroupRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  try {
    const ctx = getTenantCtx(c);
    const group = await projectGroupRepository.findById(id, ctx);
    if (!group) return c.json({ error: 'Project group not found' }, 404);
    return c.json({ data: group });
  } catch (error) {
    console.error('Get project group error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /project-groups/:id
const updateGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  customer_name: z.string().min(1).max(200).optional(),
  customer_email: z.string().email().optional().or(z.literal('')),
  customer_phone: z.string().max(50).optional().or(z.literal('')),
  customer_address: z.string().max(500).optional().or(z.literal('')),
});

projectGroupRoutes.put('/:id', authMiddleware, zValidator('json', updateGroupSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const data = c.req.valid('json');

  try {
    const ctx = getTenantCtx(c);
    const group = await projectGroupRepository.findById(id, ctx);
    if (!group) return c.json({ error: 'Project group not found' }, 404);

    const updateData: Record<string, string | null> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.customer_name !== undefined) updateData.customer_name = data.customer_name;
    if (data.customer_email !== undefined) updateData.customer_email = data.customer_email || null;
    if (data.customer_phone !== undefined) updateData.customer_phone = data.customer_phone || null;
    if (data.customer_address !== undefined) updateData.customer_address = data.customer_address || null;

    const updated = await projectGroupRepository.update(id, updateData);
    return c.json({ data: updated, message: 'Project group updated successfully' });
  } catch (error) {
    console.error('Update project group error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /project-groups/:id/versions
const createVersionSchema = z.object({
  version_name: z.string().min(1).max(100),
});

projectGroupRoutes.post('/:id/versions', authMiddleware, zValidator('json', createVersionSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const { version_name } = c.req.valid('json');
  const tenantId = c.get('tenantId') as number;

  try {
    const ctx = getTenantCtx(c);
    const group = await projectGroupRepository.findById(id, ctx);
    if (!group) return c.json({ error: 'Project group not found' }, 404);

    // Check for duplicate version name
    const existingVersions = group.versions || [];
    if (existingVersions.some(v => v.version_name.toLowerCase() === version_name.toLowerCase())) {
      return c.json({ error: `Version "${version_name}" already exists in this project` }, 400);
    }

    const newProject = await projectGroupRepository.createVersion(id, { version_name }, tenantId);

    return c.json({
      data: newProject,
      message: `Version "${version_name}" created successfully`,
    }, 201);
  } catch (error: unknown) {
    console.error('Create version error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json({ error: `Failed to create version: ${message}` }, 500);
  }
});

// DELETE /project-groups/:id
projectGroupRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  const callerRole = c.get('userRole') as string;
  if (callerRole === 'user') {
    return c.json({ error: 'Forbidden - Users cannot delete project groups' }, 403);
  }

  try {
    const ctx = getTenantCtx(c);
    const group = await projectGroupRepository.findById(id, ctx);
    if (!group) return c.json({ error: 'Project group not found' }, 404);

    // Get all versions and check if any have floorplans
    const hasFloorplans = await projectRepository.groupHasFloorplans(id);
    if (hasFloorplans) {
      return c.json({ error: 'Cannot delete project group with floorplans. Delete all floorplans first.' }, 400);
    }

    await projectGroupRepository.delete(id);
    return c.json({ message: 'Project group deleted successfully' });
  } catch (error) {
    console.error('Delete project group error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default projectGroupRoutes;
```

### Step 4.2: Add helper to projectRepository

Add to `backend/src/repositories/project.ts`:

```typescript
  groupHasFloorplans(groupId: number): Promise<boolean> {
    const result = getDb().queryEntries(`
      SELECT COUNT(*) as count 
      FROM floorplans f
      JOIN projects p ON p.id = f.project_id
      WHERE p.project_group_id = ?
    `, [groupId]);
    return Promise.resolve((result[0] as Record<string, unknown>).count as number > 0);
  }
```

### Step 4.3: Register routes

Modify `backend/src/config/routes.ts` to add:
```typescript
import projectGroupRoutes from '../routes/project-groups.ts';
// ...
app.route('/api/project-groups', projectGroupRoutes);
```

### Step 4.4: Commit

```bash
git add backend/src/routes/project-groups.ts backend/src/config/routes.ts backend/src/repositories/project.ts
git commit -m "feat: add ProjectGroup API routes\n\n- GET /project-groups (list)\n- GET /project-groups/:id\n- PUT /project-groups/:id (update)\n- POST /project-groups/:id/versions (create)\n- DELETE /project-groups/:id"
```

---

## Task 5: Adapt Project Routes

**Files:**
- Modify: `backend/src/routes/projects.ts`
- Modify: `backend/src/repositories/project.ts`

### Step 5.1: Update projectRepository

Replace `PROJECT_COLUMNS` and adapt queries:

```typescript
const PROJECT_COLUMNS = `id, project_group_id, version_name, status, tenant_id, created_at,
  discount_percentage, discount_usd, services_percentage, services_usd,
  local_currency_code, exchange_rate`;

// Update findAll to join with project_groups for backward compatibility
findAll(search?: string, ctx?: TenantContext): Promise<Project[]> {
  let sql = `
    SELECT ${PROJECT_COLUMNS}, 
           pg.name as group_name, pg.customer_name, pg.customer_email, 
           pg.customer_phone, pg.customer_address
    FROM projects p
    JOIN project_groups pg ON pg.id = p.project_group_id
  `;
  // ... rest adapted for JOIN
}
```

**Note:** The full implementation needs to adapt all repository methods. See spec for complete changes.

### Step 5.2: Update POST /projects

Adapt to create both group and version:

```typescript
projectRoutes.post('/', authMiddleware, zValidator('json', createProjectSchema), async (c) => {
  const { group_name, customer_name, customer_email, customer_phone, customer_address, version_name, status, item_type_ids } = c.req.valid('json');
  
  try {
    const tenantId = c.get('tenantId') as number;
    
    // Create group
    const group = await projectGroupRepository.create({
      name: group_name,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      tenant_id: tenantId,
    });

    // Create first version
    const project = await projectRepository.create({
      project_group_id: group.id,
      version_name: version_name || 'v1',
      status: status || 'active',
      tenant_id: tenantId,
    });

    // Set item types
    if (item_type_ids && item_type_ids.length > 0) {
      await projectRepository.setItemTypeIds(project.id, item_type_ids);
    }

    return c.json({
      data: { ...project, group },
      message: 'Project created successfully',
    }, 201);
  } catch (error) {
    // ... error handling
  }
});
```

### Step 5.3: Commit

```bash
git add backend/src/routes/projects.ts backend/src/repositories/project.ts
git commit -m "feat: adapt Project routes for versioning\n\n- POST /projects creates group + version\n- GET /projects joins with project_groups\n- PUT /projects only updates version fields"
```

---

## Task 6: Frontend Types and Services

**Files:**
- Modify: `frontend/src/services/project.ts`
- Create: `frontend/src/services/projectGroup.ts`

### Step 6.1: Update project.ts types

```typescript
export interface ProjectGroup {
  id: number;
  name: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tenant_id: number;
  created_at: string;
}

export interface Project {
  id: number;
  version_name: string;
  status: 'active' | 'completed' | 'cancelled';
  tenant_id: number;
  created_at: string;
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  local_currency_code: string;
  exchange_rate: number;
  google_exchange_rate: number;
  item_type_ids?: number[];
  group: ProjectGroup;
}

export interface CreateProjectDTO {
  group_name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  version_name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  item_type_ids?: number[];
}

export interface UpdateProjectDTO {
  version_name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  item_type_ids?: number[];
}
```

### Step 6.2: Create projectGroup.ts

```typescript
import api from './api';
import type { Project } from './project';

export interface ProjectGroup {
  id: number;
  name: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  tenant_id: number;
  created_at: string;
  versions: ProjectVersion[];
}

export interface ProjectVersion {
  id: number;
  version_name: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}

export interface UpdateProjectGroupDTO {
  name?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
}

export interface CreateVersionDTO {
  version_name: string;
}

export const projectGroupService = {
  async getAll(search?: string, signal?: AbortSignal): Promise<ProjectGroup[]> {
    const params = search ? { search } : undefined;
    const response = await api.get('/project-groups', { params, signal });
    return response.data.data;
  },

  async getById(id: number, signal?: AbortSignal): Promise<ProjectGroup> {
    const response = await api.get(`/project-groups/${id}`, { signal });
    return response.data.data;
  },

  async update(id: number, data: UpdateProjectGroupDTO, signal?: AbortSignal): Promise<ProjectGroup> {
    const response = await api.put(`/project-groups/${id}`, data, { signal });
    return response.data.data;
  },

  async createVersion(id: number, data: CreateVersionDTO, signal?: AbortSignal): Promise<Project> {
    const response = await api.post(`/project-groups/${id}/versions`, data, { signal });
    return response.data.data;
  },

  async delete(id: number, signal?: AbortSignal): Promise<void> {
    await api.delete(`/project-groups/${id}`, { signal });
  },
};
```

### Step 6.3: Commit

```bash
git add frontend/src/services/project.ts frontend/src/services/projectGroup.ts
git commit -m "feat: update frontend services for versioning\n\n- Project service: new types with group nesting\n- New ProjectGroup service with version management"
```

---

## Task 7: Frontend Modals

**Files:**
- Create: `frontend/src/components/projects/CreateVersionModal.tsx`
- Create: `frontend/src/components/projects/EditGroupModal.tsx`

### Step 7.1: CreateVersionModal

```tsx
import { useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, X } from 'lucide-react';
import { extractErrorMessage } from '@/utils';

interface CreateVersionModalProps {
  groupId: number;
  groupName: string;
  existingVersions: string[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (versionName: string) => Promise<void>;
}

export function CreateVersionModal({
  groupId, groupName, existingVersions, isOpen, onClose, onSubmit,
}: CreateVersionModalProps) {
  const [versionName, setVersionName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    const trimmed = versionName.trim();
    if (!trimmed) {
      setError('Version name is required');
      return;
    }
    
    if (existingVersions.some(v => v.toLowerCase() === trimmed.toLowerCase())) {
      setError(`Version "${trimmed}" already exists`);
      return;
    }
    
    setIsSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
      setVersionName('');
    } catch (err: unknown) {
      setError(extractErrorMessage(err, 'Failed to create version'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Create Version</DialogTitle>
          <DialogDescription>
            Create a new version of <strong>{groupName}</strong>
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="version_name">Version Name *</Label>
            <Input
              id="version_name"
              placeholder="e.g., Budget, Premium"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              autoFocus
            />
          </div>
          
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

### Step 7.2: EditGroupModal

Similar pattern to ProjectFormModal but only group fields.

### Step 7.3: Commit

```bash
git add frontend/src/components/projects/CreateVersionModal.tsx frontend/src/components/projects/EditGroupModal.tsx
git commit -m "feat: add CreateVersion and EditGroup modals"
```

---

## Task 8: Frontend ProjectList

**Files:**
- Modify: `frontend/src/pages/projects/ProjectList.tsx`

### Step 8.1: Grouped table view

- Import `projectGroupService` and new modals
- Fetch groups instead of flat projects
- Add expand/collapse state
- Group row shows: number, name, customer, version count, status
- Expand shows version rows
- Actions per group: Open (latest), Create Version, Edit Group, Delete Group
- Actions per version: Open, Edit Version, Delete Version

### Step 8.2: Commit

```bash
git add frontend/src/pages/projects/ProjectList.tsx
git commit -m "feat: update ProjectList for grouped versions\n\n- Expandable group rows\n- Version rows inside group\n- Open navigates to latest version"
```

---

## Task 9: Frontend Project Dashboard

**Files:**
- Modify: `frontend/src/components/projects/ProjectHeader.tsx`
- Modify: `frontend/src/pages/projects/ProjectDashboard.tsx`

### Step 9.1: Update ProjectHeader

```tsx
// Show: [Group Name] > [Version Name]
<div className="flex items-center gap-2">
  <span className="text-lg font-semibold">{project.group.name}</span>
  <span className="text-muted-foreground">{'>'}</span>
  <span className="text-lg">{project.version_name}</span>
  <span className={`ml-2 px-2 py-0.5 rounded text-xs ${statusColor}`}>
    {project.status}
  </span>
</div>
```

### Step 9.2: Update ProjectDashboard

- Pass `project.group` to components that need customer info
- Fix `generateProjectNumber` to use `project.group.customer_name` and `project.group.customer_address`

### Step 9.3: Commit

```bash
git add frontend/src/components/projects/ProjectHeader.tsx frontend/src/pages/projects/ProjectDashboard.tsx
git commit -m "feat: update ProjectHeader with group > version breadcrumb"
```

---

## Task 10: Frontend ProjectFormModal

**Files:**
- Modify: `frontend/src/components/projects/ProjectFormModal.tsx`

### Step 10.1: Split create vs edit modes

**Create mode:** Show group name + customer info + version name inputs
**Edit mode:** Show only version name + status (no customer fields)

### Step 10.2: Commit

```bash
git add frontend/src/components/projects/ProjectFormModal.tsx
git commit -m "feat: split ProjectFormModal for create vs edit modes\n\n- Create: group + version + customer info\n- Edit: version name + status only"
```

---

## Task 11: useProjectData Hook

**Files:**
- Modify: `frontend/src/hooks/useProjectData.ts`

### Step 11.1: Handle new API shape

- API now returns `project` with nested `group`
- Ensure `project.group` is available after fetch

### Step 11.2: Commit

```bash
git add frontend/src/hooks/useProjectData.ts
git commit -m "feat: update useProjectData hook for nested group data"
```

---

## Task 12: Backend Tests

**Files:**
- Create: `backend/tests/routes/project-groups_test.ts`

### Step 12.1: Write tests

Cover:
1. Create project group
2. Create version from group
3. Duplicate version name rejection
4. Delete version (allowed with 2+)
5. Delete last version (rejected)
6. Update group customer info
7. Tenant isolation

### Step 12.2: Commit

```bash
git add backend/tests/routes/project-groups_test.ts
git commit -m "test: add ProjectGroup route tests"
```

---

## Task 13: Frontend Tests

**Files:**
- Create: `frontend/tests/ProjectList.test.tsx`
- Create: `frontend/tests/CreateVersionModal.test.tsx`

### Step 13.1: Write tests

Cover:
1. Grouped list renders
2. Expand shows versions
3. Create version modal validates
4. Open button navigates to latest

### Step 13.2: Commit

```bash
git add frontend/tests
git commit -m "test: add frontend tests for versioning UI"
```

---

## Task 14: Final Verification

### Step 14.1: Run backend tests

```bash
cd backend && deno task test
# Expected: All tests pass
```

### Step 14.2: Run frontend lint

```bash
cd frontend && npm run lint
# Expected: No lint errors
```

### Step 14.3: Run frontend tests

```bash
cd frontend && npm run test:run
# Expected: All tests pass
```

### Step 14.4: Commit

```bash
git add --all
git commit -m "test: verification pass - all tests green"
```

---

## Spec Coverage Check

| Spec Requirement | Task | Status |
|---|---|---|
| `project_groups` table | Task 1 | |
| Backfill migration | Task 1 | |
| Deep copy with ID remapping | Task 3 | |
| Area vertices copy chain | Task 3 | |
| No duplicate version names | Task 4 | |
| Last version protection | Task 4 | |
| Group-level customer info | Task 3, 4 | |
| POST /projects creates group+version | Task 5 | |
| GET /project-groups with nested versions | Task 3, 4 | |
| POST /project-groups/:id/versions | Task 4 | |
| Grouped project list UI | Task 8 | |
| Create Version modal | Task 7 | |
| Edit Group modal | Task 7 | |
| ProjectHeader breadcrumb | Task 9 | |
| Split ProjectFormModal | Task 10 | |
| Backend tests | Task 12 | |
| Frontend tests | Task 13 | |

---

*Plan complete. Ready for implementation.*

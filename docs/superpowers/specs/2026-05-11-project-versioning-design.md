# Design: Project Versioning (Save As)

## Overview

Introduce native versioning for projects. A project becomes a **version** within a **project group**. Users can create multiple independent versions of the same project ("Save As" / "Create Version"), each with its own floorplans, placements, BOM, and settings. All versions share the same customer information through the project group.

## Terminology

| UI Term | Database / Code Term |
|---------|---------------------|
| Project Group | `project_group` |
| Project / Version | `project` (a row in the `projects` table) |
| Create Version | Backend: `POST /project-groups/:id/versions` |

---

## Data Model Changes

### New Table: `project_groups`

```sql
CREATE TABLE project_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- e.g. "Smith House"
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  tenant_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (name, customer_name, tenant_id)
);
```

### Modified Table: `projects`

```sql
-- Migration: add project_group_id, version_name; remove migrated customer fields
ALTER TABLE projects ADD COLUMN project_group_id INTEGER NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN version_name TEXT NOT NULL DEFAULT 'v1';
ALTER TABLE projects ADD COLUMN google_exchange_rate REAL DEFAULT 1.0;

-- After backfill: remove old customer/name columns (handled by migration)
-- name, customer_name, customer_email, customer_phone, customer_address → moved to project_groups
```

**Columns remaining on `projects`:**
- `id`, `project_group_id`, `version_name`, `status`, `tenant_id`
- `discount_percentage`, `discount_usd`, `services_percentage`, `services_usd`, `local_currency_code`, `exchange_rate`, `google_exchange_rate`
- `created_at`

### Migration Strategy

Since `project_group_id` is `NOT NULL`, we need a backfill approach:
1. Create `project_groups` table
2. Run migration that:
   - Creates one group per existing project, copying `name`, `customer_name`, `customer_email`, `customer_phone`, `customer_address`, `tenant_id`
   - Updates existing project rows to link to their new group
   - Drops old columns from `projects`, adds `version_name`
3. Migrate is idempotent and preserves all existing data

### Deep Copy ID Remapping

When creating a version, the backend performs a transactional deep copy with explicit ID remapping. **This is critical** because foreign keys between tables are integer PKs.

**Copy chain (in transaction):**
1. **Project** → new `project` row (new ID, same `project_group_id`, new `version_name`)
2. **Floorplans** → copy each floorplan (new row), copy image file to new path, map: `old_floorplan_id → new_floorplan_id`
3. **Placements** → copy placements for each floorplan, remap `floorplan_id` using the map from step 2
4. **Placement Addons** → copy addons, remap `placement_id` using the map from step 3
5. **Areas** → copy areas (standalone entities, not from placements), remap `floorplan_id` using the map from step 2
6. **Area Vertices** → copy vertices, remap `placement_id` using the map from step 3 (since areas use placement_id referencing, or directly remap `id` if standalone) → **verify schema**
7. **Project Item Types** → copy junction records with new `project_id`

**Tables NOT copied (group level):**
- `project_groups` (already exists)
- `project_bom_entries` (rebuilt on demand per version)

### Table Relationships

```
project_groups (1) ────< (N) projects
projects (1) ────< (N) floorplans
projects (1) ────< (N) placements
floorplans (1) ────< (N) placements
placements (1) ────< (N) placement_addons
placements (1) ────< (N) area_vertices
areas (1) ────< (N) ???  [verify area relationship]
```

---

## API Design

### New Endpoints

```typescript
/////////////////////
// PROJECT GROUPS
/////////////////////

GET /api/project-groups
// Returns: ProjectGroup[] with nested versions
// Response: {
//   data: [
//     {
//       id: 1,
//       name: "Smith House",
//       customer_name: "J. Smith",
//       customer_email: "j@smith.com",
//       customer_phone: "+1234567890",
//       customer_address: "123 Main St",
//       tenant_id: 1,
//       created_at: "2026-05-11T10:00:00Z",
//       versions: [
//         { id: 3, version_name: "Budget", status: "active", created_at: "..." },
//         { id: 4, version_name: "Premium", status: "active", created_at: "..." }
//       ]
//     }
//   ]
// }
// Filterable by search (matches group name or customer name)
// Query param: ?search=smith

GET /api/project-groups/:id
// Returns: single group with versions
// Response: { data: ProjectGroup }

PUT /api/project-groups/:id
// Update group-level customer info
// Body: { name?, customer_name?, customer_email?, customer_phone?, customer_address? }
// Response: { data: ProjectGroup, message: "..." }

POST /api/project-groups/:id/versions
// Create new version from the group's latest version
// Body: { version_name: string }
// Validates: version_name unique within group
// Response: { data: Project, message: "Version 'X' created" }

DELETE /api/project-groups/:id
// Delete entire group + all versions + all floorplans + all placements
// Only if all versions have no floorplans (same constraint as current delete)
// Response: { message: "..." }

/////////////////////
// PROJECTS (VERSIONS)
/////////////////////

GET /api/projects
// Returns: flat list of projects with group info joined
// Each project includes: { ...project, group: { id, name, customer_name, ... } }
// This maintains backward compat for components expecting flat list

GET /api/projects/:id
// Returns: single project with group info joined

PUT /api/projects/:id
// Update version-level fields
// Body: { version_name?, status?, item_type_ids?, tenant_id? (admin) }
// Does NOT accept customer fields — those are on the group

DELETE /api/projects/:id
// Delete a single version
// Cannot delete if it's the last version remaining in the group (return 400)
// Cascades: floorplans, placements, areas, project_item_types

// Existing endpoints remain functional, behavior adapted:
// POST /api/projects → creates BOTH group and first version
```

### Modified Endpoints: `POST /api/projects`

**Old behavior:** Create project row with name + customer info.

**New behavior:**
1. Create `project_group` row with group name + customer info
2. Create `project` row linked to group with `version_name = "v1"` (or user-provided)
3. Return the project with nested `group` info

**Request body updated:**
```typescript
{
  // Group level
  group_name: string,          // was "name"
  customer_name: string,
  customer_email?: string,
  customer_phone?: string,
  customer_address?: string,
  // Version level
  version_name?: string,       // optional, defaults to "v1"
  status?: 'active' | 'completed' | 'cancelled',
  item_type_ids?: number[],
}
```

---

## Frontend Changes

### New / Updated Interfaces

```typescript
// services/project.ts

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

export interface Project {
  id: number;
  version_name: string;
  status: 'active' | 'completed' | 'cancelled';
  tenant_id: number;
  created_at: string;
  // Invoice settings (version-level)
  discount_percentage: number;
  discount_usd: number;
  services_percentage: number;
  services_usd: number;
  local_currency_code: string;
  exchange_rate: number;
  google_exchange_rate: number;
  item_type_ids?: number[];
  // Joined group info
  group: ProjectGroup;
}

export interface CreateProjectDTO {
  group_name: string;
  customer_name: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  version_name?: string;  // defaults to "v1"
  status?: 'active' | 'completed' | 'cancelled';
  item_type_ids?: number[];
}

export interface UpdateProjectDTO {
  version_name?: string;
  status?: 'active' | 'completed' | 'cancelled';
  tenant_id?: number;
  item_type_ids?: number[];
}

// New: Group update DTO
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

### New Service: `services/projectGroup.ts`

```typescript
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

### Component Changes

#### 1. `ProjectList` — Grouped Table View

**Row structure:**
- Group row (expandable): shows group name, customer, version count, latest status
  - Actions: "Open" (latest), "Create Version", "Edit Group", "Delete Group"
- Expanded: version rows with name, status, created date
  - Each version: "Open", "Edit Version", "Delete Version"

**New modals needed:**
- `CreateVersionModal` — simple input for version name
- `EditGroupModal` — edit customer info + group name
- `EditVersionModal` — edit version name + status (reuse existing project form but customer fields removed)

```tsx
// ProjectList table row (collapsed)
<TableRow>
  <TableCell>2026-05-11_Smith_123Main</TableCell>
  <TableCell className="font-medium">
    Smith House <span className="text-muted-foreground text-xs">(3 versions)</span>
  </TableCell>
  <TableCell>J. Smith</TableCell>
  <TableCell>
    <Badge variant="outline">Active</Badge>
  </TableCell>
  <TableCell>
    <div className="flex gap-2">
      <Button size="sm" onClick={() => openLatest(group)}>
        <Eye className="mr-1 h-3 w-3" /> Open
      </Button>
      <Button size="sm" variant="outline" onClick={() => openCreateVersion(group)}>
        <Copy className="mr-1 h-3 w-3" /> Create Version
      </Button>
      <Button size="sm" variant="outline" onClick={() => openEditGroup(group)}>
        <Pencil className="mr-1 h-3 w-3" /> Edit
      </Button>
      <Button size="sm" variant="destructive" onClick={() => openDeleteGroup(group)}>
        <Trash2 className="mr-1 h-3 w-3" /> Delete
      </Button>
    </div>
  </TableCell>
</TableRow>

// Expanded version rows
<TableRow>
  <TableCell className="pl-8">Budget</TableCell>
  <TableCell>Active</TableCell>
  <TableCell>May 10, 2026</TableCell>
  <TableCell>
    <div className="flex gap-2">
      <Button size="xs" onClick={() => navigate(`/projects/${v.id}`)}>Open</Button>
      <Button size="xs" variant="outline" onClick={() => openEditVersion(v)}>Edit</Button>
      <Button size="xs" variant="destructive" onClick={() => openDeleteVersion(v)}>Delete</Button>
    </div>
  </TableCell>
</TableRow>
```

#### 2. `ProjectDashboard` — Version Header

`ProjectHeader` component updated:
```tsx
// Shows: [Group Name] > [Version Name]
// e.g. "Smith House > Budget"
// Includes "Create Version" button in header actions
```

#### 3. `ProjectFormModal` — Split into Two Modals

**Create Project Modal (NEW):**
- Group name
- Customer info (name*, email, phone, address)
- First version name (optional, defaults to "v1")
- Status
- Item types

**Edit Version Modal (reuses ProjectFormModal, simplified):**
- Version name
- Status
- Item types
- NO customer fields

**Edit Group Modal (NEW):**
- Group name
- Customer name*, email, phone, address
- NO version or status fields

### Route Changes

Routes stay the same for version navigation:
- `/projects` → ProjectList
- `/projects/:id` → ProjectDashboard (for a version)
- No new routes needed

---

## Business Rules

### Validation
1. **Version name uniqueness:** Within a project group, `version_name` must be unique. If already exists, return `400` with error message.
2. **Last version protection:** Cannot delete a version if it's the only remaining version in the group. Must delete the entire group instead.
3. **Group deletion:** Can only delete a group if all its versions have no floorplans (same constraint as current project deletion: "delete all floorplans first").
4. **Status propagation:** Group row shows `active` if any version is `active`; otherwise shows latest version's status.
5. **Tenant isolation:** All endpoints respect tenant_id filtering (same as current).

### Data Integrity
- Project group and first version creation are atomic (transaction).
- Version creation (deep copy) is atomic (transaction).
- `google_exchange_rate` defaults to `1.0` if not set.

---

## UI/UX Patterns

### Project List View
- Default view: grouped rows, collapsed
- Sort order: by group creation date (descending), same as current
- "Version" column in group row shows count
- Click chevron to expand and see all versions

### Create Version Flow
1. User clicks "Create Version" on group row
2. Modal prompts for `version_name` (e.g., "Premium", "Budget")
3. Validation: ensure name is unique within the group
4. Backend deep-copies latest version in transaction
5. Modal closes, toast shows "Version 'Premium' created"
6. Optionally navigate to new version, or stay in list

### Generate Invoice / Proposal
- Invoice generation operates on the **version** level (existing behavior — no change needed)
- Each version generates its own proposal independently

---

## Testing Notes

### Backend Tests Needed
1. Create project group + first version
2. Create version from existing group (deep copy verification)
3. Duplicate version name rejection
4. Delete version (allowed with 2+ versions)
5. Delete last version (rejected → must delete group)
6. Update group customer info (affects all versions' display)
7. Update version (does not affect other versions)
8. Tenant isolation for groups
9. Transaction rollback on copy failure

### Frontend Tests Needed
1. ProjectList renders grouped rows
2. Expand/collapse group shows versions
3. Create version modal validates uniqueness
4. Edit group modal updates customer info
5. Open button navigates to latest version
6. ProjectHeader shows breadcrumb [Group] > [Version]

---

## Open Questions / TODOs

1. [ ] **Verify area_vertices relationship:** `area_vertices` references `placement_id` (areas as placements) or `area_id` (standalone)? Need to check schema before implementing deep copy.
2. [ ] **GU C exchange rate:** New `google_exchange_rate` column exists on `projects` but needs to be included in the deep copy (this is version-level data).
3. [ ] **Migration safety:** Need to verify the migration handles existing production data without data loss — specifically the `UNIQUE` constraint on `project_groups` (name + customer_name + tenant_id).
4. [ ] **Project number generation:** The `generateProjectNumber` helper uses `project.customer_name` and `project.customer_address` — after migration, these come from `project.group`. Frontend will need `group` joined.

---

## Files to Create / Modify

### Backend
**New:**
- `backend/src/models/project-group.ts` — ProjectGroup types
- `backend/src/repositories/project-group.ts` — CRUD + deep copy logic
- `backend/src/routes/project-groups.ts` — API routes
- `backend/migrations/033_project_versioning.sql` — Schema migration

**Modify:**
- `backend/src/models/index.ts` — Update Project, CreateProjectDTO, UpdateProjectDTO types
- `backend/src/repositories/project.ts` — Adapt to new schema, add version_name
- `backend/src/routes/projects.ts` — Adapt POST/PUT to new structure, remove customer fields from version update

### Frontend
**New:**
- `frontend/src/services/projectGroup.ts` — API service for groups
- `frontend/src/components/projects/CreateVersionModal.tsx` — Version creation modal
- `frontend/src/components/projects/EditGroupModal.tsx` — Group edit modal

**Modify:**
- `frontend/src/services/project.ts` — Update types (DTOs, Project interface), add `group` nesting
- `frontend/src/pages/projects/ProjectList.tsx` — Grouped table with expand/collapse
- `frontend/src/pages/projects/ProjectDashboard.tsx` — Pass `project.group` to components
- `frontend/src/components/projects/ProjectHeader.tsx` — Show breadcrumb
- `frontend/src/components/projects/ProjectFormModal.tsx` — Split into create (group+version) vs edit (version only)
- `frontend/src/hooks/useProjectData.ts` — Handle new API response shape with `group`

---

*Design approved by user on 2026-05-11. Next step: invoke **writing-plans** skill to create implementation plan.*

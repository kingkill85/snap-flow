# Multi-Tenancy Design Spec

**Date:** 2026-03-26
**Status:** Draft

## Overview

SnapFlow currently operates as a single-tenant, single-workspace system where all users share the same projects and catalog. This design adds multi-tenancy to support the stakeholder's business model: a **distributor** who sells hardware and manages the product catalog, and **partner companies** who use SnapFlow to create their own projects/proposals.

### Business Model

- The **distributor** is the hardware supplier. They maintain the shared product catalog and also create their own projects.
- **Partner companies** are the distributor's customers. Each partner has their own admins, users, and projects — fully isolated from other partners.
- The distributor has full visibility and edit access across all tenants for oversight and support.

## Architecture: Row-Level Tenant Isolation via BaseRepository

Tenant filtering is enforced at the repository layer. The `BaseRepository` class automatically appends `WHERE tenant_id = ?` to all CRUD operations on tenant-scoped tables. Routes do not need manual filtering — isolation is automatic and cannot be accidentally skipped.

- **Distributor role** bypasses the tenant filter (cross-tenant visibility).
- **Catalog tables** (items, categories, variants, addons) are exempt — they have no `tenant_id` and are shared across all tenants.

## Data Model

### New Table: `tenants`

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PRIMARY KEY | Auto-increment |
| name | TEXT NOT NULL | Company name |
| is_distributor | BOOLEAN DEFAULT FALSE | Only one tenant is the distributor |
| is_active | BOOLEAN DEFAULT TRUE | Soft delete flag |
| created_at | DATETIME | Default CURRENT_TIMESTAMP |

### Modified Table: `users`

| Change | Column | Details |
|--------|--------|---------|
| ADD | tenant_id | INTEGER NOT NULL REFERENCES tenants(id) |
| ALTER | role | CHECK(role IN ('distributor', 'admin', 'user')) — was ('admin', 'user') |

- Email remains globally unique (no duplicate emails across tenants).

### Modified Table: `projects`

| Change | Column | Details |
|--------|--------|---------|
| ADD | tenant_id | INTEGER NOT NULL REFERENCES tenants(id) |

- Unique index changes from `(name, customer_name)` to `(name, customer_name, tenant_id)` so partners can reuse project/customer names independently.

### Unchanged Tables

- `categories`, `items`, `item_variants`, `variant_addons` — shared catalog, no tenant_id.
- `floorplans`, `placements`, `project_bom`, `areas` — isolated implicitly via their parent `project` which has `tenant_id`. No direct `tenant_id` column needed.

## Role System

Three roles replace the current binary (admin/user) system:

### distributor

- Belongs to the distributor tenant (is_distributor = true)
- Manage product catalog (CRUD items, categories, variants, addons, Excel import)
- Create and manage tenants (partner companies)
- View and edit ALL projects across all tenants (oversight + support)
- Manage users in any tenant
- Access via distributor bypass in BaseRepository (no tenant filter applied)

### admin

- Belongs to a specific partner tenant
- Manage users within own tenant only
- View and edit projects within own tenant only
- Read-only catalog access (browse items, no edit/delete/import)
- Cannot see other tenants' data

### user

- Belongs to a specific partner tenant
- Create and edit projects within own tenant only
- Read-only catalog access
- Cannot manage users
- Cannot see other tenants' data

## Backend Changes

### JWT Payload

```typescript
interface JWTPayload {
  sub: string;        // user id
  email: string;
  role: 'distributor' | 'admin' | 'user';
  tenantId: number;   // tenant the user belongs to
  exp: number;
  iat: number;
}
```

### Middleware

- **Auth middleware update:** Extracts `tenantId` and `role` from JWT, sets both on Hono context.
- **New `distributorMiddleware`:** Checks `role === 'distributor'`, returns 403 otherwise. Used on catalog write routes and tenant management routes.
- **Existing `adminMiddleware` update:** Allows both `distributor` and `admin` roles (for user management within a tenant).

### BaseRepository Changes

The base CRUD class gains tenant-awareness:

- Constructor accepts a `tenantScoped: boolean` flag (default false for catalog repos, true for project/user repos).
- When `tenantScoped` is true, all query methods (`findAll`, `findById`, `create`, `update`, `delete`) automatically include `tenant_id` in their WHERE clause.
- A `tenantId` is passed to repository methods via the Hono context.
- When the caller's role is `distributor`, the tenant filter is bypassed.
- Catalog repositories (`ItemRepository`, `CategoryRepository`, etc.) remain unscoped.

### New Routes: Tenant Management

All require `distributorMiddleware`:

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/tenants | Create a new partner company |
| GET | /api/tenants | List all tenants |
| PUT | /api/tenants/:id | Update tenant (name, is_active) |
| DELETE | /api/tenants/:id | Soft delete (sets is_active = false) |

### Modified Routes: Catalog

- Read routes (GET): No change — all authenticated users can browse.
- Write routes (POST, PUT, DELETE, Excel import): Add `distributorMiddleware` to restrict to distributor only.

### Modified Routes: Projects

- All project queries filtered by `tenant_id` via BaseRepository.
- Distributor sees all projects (bypass). Can optionally filter by `?tenantId=X` query param.

### Modified Routes: Users

- Partner admins see only users in their own tenant.
- Distributor sees all users, can filter by `?tenantId=X`, and can create users in any tenant.

### Cross-Tenant Access for Distributor

When the distributor uses a tenant switcher to view a specific partner's data, the frontend sends `?tenantId=X` as a query parameter. The backend:

1. Checks that the caller's role is `distributor`.
2. Uses the provided `tenantId` for filtering instead of the caller's own `tenantId`.
3. Returns 403 if a non-distributor tries to use this parameter.

## Frontend Changes

### Auth Context

`AuthContext` expands to include:

```typescript
interface AuthUser {
  id: number;
  email: string;
  role: 'distributor' | 'admin' | 'user';
  tenantId: number;
  tenantName: string;
  fullName?: string;
}
```

### Navigation & Routing

**Distributor sees:**
- Catalog management (existing pages, unchanged)
- Tenants page (new — list/create/edit partner companies)
- Tenant switcher in header (dropdown: "All Tenants" + list of partners)
- Users page (with tenant filter)
- Projects page (with tenant column and filter)

**Partner admin sees:**
- Projects (own tenant only)
- Users management (own tenant only)
- Catalog (read-only — action buttons hidden)

**Partner user sees:**
- Projects (own tenant only)
- Catalog (read-only)

### Key UI Changes

1. **Header:** Displays tenant name for partner users. Distributor gets a tenant switcher dropdown.
2. **Catalog pages:** Conditionally hide add/edit/delete/import buttons based on `role !== 'distributor'`.
3. **Users page:** Partner admin sees own tenant's users. Distributor gets tenant filter dropdown.
4. **Projects page:** Partner users see own projects. Distributor sees all with tenant column/filter.
5. **New Tenants page:** Simple CRUD table (distributor only), following existing UI patterns (modal for create/edit, table with action buttons).

### API Service

No major changes. The JWT carries tenant context automatically. The frontend only adds `?tenantId=X` when the distributor uses the tenant switcher.

## Migration Plan

A single migration that:

1. Creates the `tenants` table.
2. Inserts the distributor tenant (id=1, name from env or default, is_distributor=true).
3. Adds `tenant_id` column to `users` with default 1 (all existing users become distributor tenant).
4. Adds `tenant_id` column to `projects` with default 1 (all existing projects become distributor tenant).
5. Updates existing users with `role='admin'` to `role='distributor'`.
6. Drops and recreates the unique index on projects: `(name, customer_name)` → `(name, customer_name, tenant_id)`.

This is backwards-compatible — existing data is assigned to the distributor tenant, existing admins become distributors.

## Edge Cases

- **Tenant deletion:** Soft delete only (set `is_active = false`). Users of deactivated tenants cannot log in. Projects are preserved for historical reference.
- **Email uniqueness:** Globally unique. A person cannot have accounts in two tenants with the same email. This avoids login ambiguity.
- **Distributor tenant protection:** The distributor tenant (is_distributor=true) cannot be deactivated or deleted.
- **At least one distributor:** The system must always have at least one user with `role='distributor'`. Prevent deletion/demotion of the last distributor user.
- **Branding:** Out of scope for now. The `tenants` table can later gain columns like `logo_path`, `primary_color` for per-tenant branding on proposals.

## Out of Scope

- Per-tenant branding/logos on proposals
- Per-tenant catalog customization (all partners see the full catalog)
- Partner-to-partner collaboration
- Billing/subscription management

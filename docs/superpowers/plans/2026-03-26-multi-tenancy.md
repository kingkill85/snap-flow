# Multi-Tenancy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-tenancy with distributor/partner isolation so partner companies get their own users and projects while sharing a centrally-managed catalog.

**Architecture:** Row-level tenant isolation enforced in `BaseRepository`. A `tenants` table tracks companies. `users` and `projects` gain a `tenant_id` column. The `distributor` role bypasses tenant filtering for cross-tenant oversight. Catalog tables remain shared and unscoped.

**Tech Stack:** Deno + Hono + SQLite (backend), React 18 + TypeScript + Vite + shadcn/ui (frontend)

**Spec:** `docs/superpowers/specs/2026-03-26-multi-tenancy-design.md`

---

## File Structure

### New Files
- `backend/src/repositories/tenant.ts` — Tenant CRUD repository
- `backend/src/routes/tenants.ts` — Tenant management API routes
- `backend/tests/routes/tenants_test.ts` — Tenant route tests
- `backend/tests/middleware/auth_test_tenancy.ts` — Middleware tenancy tests
- `frontend/src/services/tenants.ts` — Tenant API service
- `frontend/src/pages/settings/TenantManagement.tsx` — Tenant admin page
- `frontend/src/components/settings/TenantFormModal.tsx` — Create/edit tenant modal
- `frontend/src/components/layout/TenantSwitcher.tsx` — Distributor tenant switcher dropdown

### Modified Files
- `backend/src/scripts/migrate.ts` — Add migration 031
- `backend/src/models/index.ts` — Add Tenant types, update User/role types
- `backend/src/repositories/base.ts` — Add tenant-scoped filtering
- `backend/src/repositories/user.ts` — Add tenant_id to queries
- `backend/src/repositories/project.ts` — Add tenant_id to queries
- `backend/src/middleware/auth.ts` — Add tenantId to context, add distributorMiddleware, update adminMiddleware
- `backend/src/services/jwt.ts` — Add tenantId to JWT payload
- `backend/src/routes/auth.ts` — Include tenantId in login response
- `backend/src/routes/users.ts` — Add tenant filtering, allow distributor cross-tenant
- `backend/src/routes/projects.ts` — Add tenant filtering
- `backend/src/routes/items.ts` — Replace adminMiddleware with distributorMiddleware on write routes
- `backend/src/routes/categories.ts` — Replace adminMiddleware with distributorMiddleware on write routes
- `backend/src/main.ts` — Mount tenant routes
- `backend/tests/test-utils.ts` — Update seed data for tenancy
- `frontend/src/context/AuthContext.tsx` — Add tenantId, tenantName to user type
- `frontend/src/services/auth.ts` — Handle tenantId in login response
- `frontend/src/components/auth/ProtectedRoute.tsx` — Add distributor role check
- `frontend/src/components/layout/Header.tsx` — Add tenant switcher, conditional nav
- `frontend/src/App.tsx` — Add tenant routes, update admin routing
- `frontend/src/pages/projects/ProjectList.tsx` — Add tenant column for distributor
- `frontend/src/pages/settings/UserManagement.tsx` — Add tenant filter for distributor

---

## Task 1: Database Migration

**Files:**
- Modify: `backend/src/scripts/migrate.ts`

- [ ] **Step 1: Write migration 031_multi_tenancy**

Add this migration to the `migrations` array in `backend/src/scripts/migrate.ts`, after migration 030:

```typescript
{
  id: 31,
  name: '031_multi_tenancy',
  sql: `
    -- Create tenants table
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_distributor INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_name ON tenants(name);

    -- Seed the distributor tenant
    INSERT INTO tenants (id, name, is_distributor, is_active)
    VALUES (1, 'Distributor', 1, 1);

    -- Add tenant_id to users (default 1 = distributor for existing users)
    ALTER TABLE users ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

    -- Update role check constraint: SQLite doesn't support ALTER CHECK,
    -- but the CHECK was defined as TEXT CHECK(role IN (...)).
    -- We handle this by updating existing admin users to 'distributor'.
    -- New role values are enforced at the application layer.
    UPDATE users SET role = 'distributor' WHERE role = 'admin';

    -- Add tenant_id to projects (default 1 = distributor for existing projects)
    ALTER TABLE projects ADD COLUMN tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id);
    CREATE INDEX IF NOT EXISTS idx_projects_tenant ON projects(tenant_id);

    -- Recreate unique index to include tenant_id
    DROP INDEX IF EXISTS idx_projects_unique_name_customer;
    CREATE UNIQUE INDEX idx_projects_unique_name_customer ON projects(name, customer_name, tenant_id);
  `,
},
```

- [ ] **Step 2: Run migration**

```bash
cd backend && deno task migrate
```

Expected: Migration 031 applied successfully. No errors.

- [ ] **Step 3: Verify migration**

```bash
cd backend && deno eval "
import { Database } from 'https://deno.land/x/sqlite3@0.12.0/mod.ts';
const db = new Database('snapflow.db');
console.log('tenants:', db.prepare('SELECT * FROM tenants').all());
console.log('users tenant_id:', db.prepare('SELECT id, email, role, tenant_id FROM users').all());
console.log('projects tenant_id:', db.prepare('SELECT id, name, tenant_id FROM projects LIMIT 3').all());
db.close();
"
```

Expected: Tenants table has 1 row (Distributor). All users have `tenant_id=1` and `role='distributor'` (previously admin). All projects have `tenant_id=1`.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/migrate.ts
git commit -m "feat: add migration 031 — tenants table, tenant_id on users/projects"
```

---

## Task 2: Type Definitions

**Files:**
- Modify: `backend/src/models/index.ts`

- [ ] **Step 1: Add Tenant types and update User role type**

In `backend/src/models/index.ts`, add at the top of the file (after imports, before the User interface):

```typescript
// === Tenants ===

export type UserRole = 'distributor' | 'admin' | 'user';

export interface Tenant {
  id: number;
  name: string;
  is_distributor: number; // SQLite boolean: 0 or 1
  is_active: number;      // SQLite boolean: 0 or 1
  created_at: string;
}

export interface CreateTenantDTO {
  name: string;
}

export interface UpdateTenantDTO {
  name?: string;
  is_active?: number;
}
```

Then update the existing `User` interface — add `tenant_id` field and change `role`:

```typescript
export interface User {
  id: number;
  email: string;
  full_name: string | null;
  password_hash: string;
  role: UserRole;
  tenant_id: number;
  created_at: string;
}
```

Update `CreateUserDTO` — add `tenant_id`:

```typescript
export interface CreateUserDTO {
  email: string;
  full_name?: string;
  password?: string;
  password_hash?: string;
  role?: UserRole;
  tenant_id: number;
}
```

Update `UpdateUserDTO` — add optional `tenant_id`:

```typescript
export interface UpdateUserDTO {
  email?: string;
  full_name?: string;
  password?: string;
  password_hash?: string;
  role?: UserRole;
  tenant_id?: number;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd backend && deno check src/models/index.ts
```

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/models/index.ts
git commit -m "feat: add Tenant types, add tenant_id to User, update role to distributor/admin/user"
```

---

## Task 3: JWT Service — Add tenantId

**Files:**
- Modify: `backend/src/services/jwt.ts`
- Test: `backend/tests/services/jwt_test.ts` (existing)

- [ ] **Step 1: Write test for tenantId in JWT**

Add a test to `backend/tests/services/jwt_test.ts`:

```typescript
Deno.test('JWT - should include tenantId in token payload', async () => {
  const token = await generateToken(1, 'test@test.com', 'distributor', 1);
  const payload = await verifyToken(token);
  assertEquals(payload.tenantId, 1);
  assertEquals(payload.role, 'distributor');
});

Deno.test('JWT - should include tenantId for partner user', async () => {
  const token = await generateToken(5, 'partner@co.com', 'admin', 3);
  const payload = await verifyToken(token);
  assertEquals(payload.tenantId, 3);
  assertEquals(payload.role, 'admin');
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && deno test --allow-all tests/services/jwt_test.ts
```

Expected: FAIL — `generateToken` doesn't accept 4 arguments yet.

- [ ] **Step 3: Update jwt.ts to include tenantId**

In `backend/src/services/jwt.ts`:

Update the `JWTPayload` interface:

```typescript
export interface JWTPayload {
  sub: string;
  email: string;
  role: 'distributor' | 'admin' | 'user';
  tenantId: number;
  exp: number;
  iat: number;
}
```

Update the `generateToken` function signature and payload:

```typescript
export async function generateToken(
  userId: number,
  email: string,
  role: 'distributor' | 'admin' | 'user',
  tenantId: number
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: userId.toString(),
    email,
    role,
    tenantId,
    exp: now + ACCESS_TOKEN_EXPIRY,
    iat: now,
  };
```

- [ ] **Step 4: Fix all existing callers of generateToken**

Search for all callers of `generateToken` and add the `tenantId` parameter. The main caller is in `backend/src/routes/auth.ts` — the login and refresh routes. Update them:

In `backend/src/routes/auth.ts`, find the `generateToken` call in the login route and add the user's `tenant_id`:

```typescript
const accessToken = await generateToken(user.id, user.email, user.role, user.tenant_id);
```

Do the same for the refresh route's `generateToken` call:

```typescript
const accessToken = await generateToken(user.id, user.email, user.role, user.tenant_id);
```

- [ ] **Step 5: Run tests**

```bash
cd backend && deno test --allow-all tests/services/jwt_test.ts
```

Expected: All JWT tests pass, including the new tenantId tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/jwt.ts backend/src/routes/auth.ts backend/tests/services/jwt_test.ts
git commit -m "feat: add tenantId to JWT payload and generateToken"
```

---

## Task 4: Auth Middleware — tenantId Context & distributorMiddleware

**Files:**
- Modify: `backend/src/middleware/auth.ts`
- Create: `backend/tests/middleware/auth_test_tenancy.ts`

- [ ] **Step 1: Write tests for middleware changes**

Create `backend/tests/middleware/auth_test_tenancy.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
import { Hono } from 'hono';
import { authMiddleware, adminMiddleware, distributorMiddleware } from '../../src/middleware/auth.ts';
import { generateToken } from '../../src/services/jwt.ts';

// Helper to create a test app with a protected route
function createTestApp(middleware: Function[]) {
  const app = new Hono();
  for (const mw of middleware) {
    app.use('/*', mw as any);
  }
  app.get('/test', (c) => {
    return c.json({
      userId: c.get('userId'),
      userRole: c.get('userRole'),
      tenantId: c.get('tenantId'),
    });
  });
  return app;
}

Deno.test('authMiddleware - should set tenantId on context', async () => {
  const app = createTestApp([authMiddleware]);
  const token = await generateToken(1, 'admin@dist.com', 'distributor', 1);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.tenantId, 1);
  assertEquals(body.userRole, 'distributor');
});

Deno.test('authMiddleware - should set partner tenantId on context', async () => {
  const app = createTestApp([authMiddleware]);
  const token = await generateToken(5, 'user@partner.com', 'user', 3);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.tenantId, 3);
  assertEquals(body.userRole, 'user');
});

Deno.test('distributorMiddleware - should allow distributor role', async () => {
  const app = createTestApp([authMiddleware, distributorMiddleware]);
  const token = await generateToken(1, 'admin@dist.com', 'distributor', 1);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
});

Deno.test('distributorMiddleware - should reject admin role', async () => {
  const app = createTestApp([authMiddleware, distributorMiddleware]);
  const token = await generateToken(2, 'admin@partner.com', 'admin', 2);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 403);
});

Deno.test('distributorMiddleware - should reject user role', async () => {
  const app = createTestApp([authMiddleware, distributorMiddleware]);
  const token = await generateToken(3, 'user@partner.com', 'user', 2);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 403);
});

Deno.test('adminMiddleware - should allow distributor role', async () => {
  const app = createTestApp([authMiddleware, adminMiddleware]);
  const token = await generateToken(1, 'admin@dist.com', 'distributor', 1);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
});

Deno.test('adminMiddleware - should allow admin role', async () => {
  const app = createTestApp([authMiddleware, adminMiddleware]);
  const token = await generateToken(2, 'admin@partner.com', 'admin', 2);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
});

Deno.test('adminMiddleware - should reject user role', async () => {
  const app = createTestApp([authMiddleware, adminMiddleware]);
  const token = await generateToken(3, 'user@partner.com', 'user', 2);
  const res = await app.request('/test', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 403);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && deno test --allow-all tests/middleware/auth_test_tenancy.ts
```

Expected: FAIL — `distributorMiddleware` doesn't exist, `tenantId` not set on context.

- [ ] **Step 3: Update auth middleware**

Replace `backend/src/middleware/auth.ts`:

```typescript
import type { Context, Next } from 'hono';
import { verifyToken } from '../services/jwt.ts';

/**
 * Auth middleware - verifies JWT token from Authorization header
 * Sets userId, userEmail, userRole, tenantId on Hono context
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token);

    c.set('userId', parseInt(payload.sub));
    c.set('userEmail', payload.email);
    c.set('userRole', payload.role);
    c.set('tenantId', payload.tenantId);

    await next();
  } catch (_error) {
    return c.json({ error: 'Unauthorized - Invalid token' }, 401);
  }
}

/**
 * Admin middleware - checks if user has admin or distributor role
 * Must be used after authMiddleware
 */
export async function adminMiddleware(c: Context, next: Next): Promise<Response | void> {
  const userRole = c.get('userRole');

  if (userRole !== 'admin' && userRole !== 'distributor') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  await next();
}

/**
 * Distributor middleware - checks if user has distributor role
 * Must be used after authMiddleware
 */
export async function distributorMiddleware(c: Context, next: Next): Promise<Response | void> {
  const userRole = c.get('userRole');

  if (userRole !== 'distributor') {
    return c.json({ error: 'Forbidden - Distributor access required' }, 403);
  }

  await next();
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && deno test --allow-all tests/middleware/auth_test_tenancy.ts
```

Expected: All 8 tests pass.

- [ ] **Step 5: Run full backend tests to check nothing broke**

```bash
cd backend && deno task test
```

Expected: All existing tests pass. Some tests that relied on `role === 'admin'` may need updating since existing admin users are now `distributor`. Fix any failures.

- [ ] **Step 6: Commit**

```bash
git add backend/src/middleware/auth.ts backend/tests/middleware/auth_test_tenancy.ts
git commit -m "feat: add tenantId to auth context, add distributorMiddleware, update adminMiddleware"
```

---

## Task 5: Update Test Utilities

**Files:**
- Modify: `backend/tests/test-utils.ts`

- [ ] **Step 1: Update test-utils to seed tenants table**

In `backend/tests/test-utils.ts`, update `clearDatabase()` to also clear the `tenants` table, and ensure setup seeds it. Add `tenants` to the list of tables cleared:

```typescript
// In clearDatabase(), add 'tenants' to the DELETE list, BEFORE users/projects (foreign key order)
db.exec('DELETE FROM tenants');
```

Also add a re-seed of the distributor tenant after clearing:

```typescript
// After all DELETE statements, re-seed the distributor tenant
db.exec("INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (1, 'Distributor', 1, 1)");
```

- [ ] **Step 2: Update any test helpers that create users**

Find test helpers or test files that call `INSERT INTO users` or `userRepository.create()` and ensure they include `tenant_id: 1` in the data. Check:
- `backend/tests/routes/users_test.ts`
- `backend/tests/routes/auth_test.ts`
- Any test that registers/creates test users

For direct SQL inserts, add `tenant_id` column:
```sql
INSERT INTO users (email, password_hash, role, tenant_id) VALUES (?, ?, 'distributor', 1)
```

For repository calls, add `tenant_id: 1` to the DTO.

- [ ] **Step 3: Update test user roles from 'admin' to 'distributor'**

In all test files, replace `role: 'admin'` with `role: 'distributor'` for test users that need admin-level access. Search for `role.*admin` in test files and update.

- [ ] **Step 4: Run all backend tests**

```bash
cd backend && deno task test
```

Expected: All tests pass with the updated test utilities.

- [ ] **Step 5: Commit**

```bash
git add backend/tests/
git commit -m "fix: update test utilities and test data for multi-tenancy"
```

---

## Task 6: BaseRepository — Tenant-Scoped Queries

**Files:**
- Modify: `backend/src/repositories/base.ts`

- [ ] **Step 1: Write tests for tenant-scoped repository**

Create `backend/tests/repositories/base_tenant_test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
import { setupTestDatabase, clearDatabase, teardownTestDatabase } from '../test-utils.ts';
import { BaseRepository } from '../../src/repositories/base.ts';
import { getDb } from '../../src/config/database.ts';

// Concrete test repository
class TestTenantRepo extends BaseRepository<any, any, any> {
  protected tableName = 'projects';
  protected tenantScoped = true;

  create(data: any): Promise<any> {
    const db = getDb();
    db.exec(
      `INSERT INTO projects (name, customer_name, tenant_id) VALUES ('${data.name}', '${data.customer_name}', ${data.tenant_id})`
    );
    const result = db.prepare('SELECT * FROM projects WHERE id = last_insert_rowid()').all();
    return Promise.resolve(result[0]);
  }

  update(id: number, data: any): Promise<any> {
    const db = getDb();
    db.exec(`UPDATE projects SET name = '${data.name}' WHERE id = ${id}`);
    const result = db.prepare('SELECT * FROM projects WHERE id = ?').all(id);
    return Promise.resolve(result[0]);
  }
}

Deno.test({
  name: 'BaseRepository tenant-scoped - findAll filters by tenantId',
  async fn() {
    await setupTestDatabase();
    clearDatabase();
    const db = getDb();

    // Create a second tenant
    db.exec("INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (2, 'Partner A', 0, 1)");

    // Create projects in different tenants
    db.exec("INSERT INTO projects (name, customer_name, tenant_id) VALUES ('P1', 'C1', 1)");
    db.exec("INSERT INTO projects (name, customer_name, tenant_id) VALUES ('P2', 'C2', 2)");
    db.exec("INSERT INTO projects (name, customer_name, tenant_id) VALUES ('P3', 'C3', 1)");

    const repo = new TestTenantRepo();

    // Partner user should only see their tenant's projects
    const tenant2Projects = await repo.findAll({ tenantId: 2, role: 'admin' });
    assertEquals(tenant2Projects.length, 1);
    assertEquals(tenant2Projects[0].name, 'P2');

    // Distributor should see all projects
    const allProjects = await repo.findAll({ tenantId: 1, role: 'distributor' });
    assertEquals(allProjects.length, 3);

    teardownTestDatabase();
  },
});

Deno.test({
  name: 'BaseRepository tenant-scoped - findById respects tenantId',
  async fn() {
    await setupTestDatabase();
    clearDatabase();
    const db = getDb();

    db.exec("INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (2, 'Partner A', 0, 1)");
    db.exec("INSERT INTO projects (id, name, customer_name, tenant_id) VALUES (10, 'P1', 'C1', 2)");

    const repo = new TestTenantRepo();

    // Same tenant can find it
    const found = await repo.findById(10, { tenantId: 2, role: 'admin' });
    assertEquals(found?.name, 'P1');

    // Different tenant cannot find it
    const notFound = await repo.findById(10, { tenantId: 1, role: 'user' });
    assertEquals(notFound, null);

    // Distributor can find it (bypass)
    const distributorFound = await repo.findById(10, { tenantId: 1, role: 'distributor' });
    assertEquals(distributorFound?.name, 'P1');

    teardownTestDatabase();
  },
});

Deno.test({
  name: 'BaseRepository tenant-scoped - delete respects tenantId',
  async fn() {
    await setupTestDatabase();
    clearDatabase();
    const db = getDb();

    db.exec("INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (2, 'Partner A', 0, 1)");
    db.exec("INSERT INTO projects (id, name, customer_name, tenant_id) VALUES (10, 'P1', 'C1', 2)");

    const repo = new TestTenantRepo();

    // Different tenant cannot delete it
    await repo.delete(10, { tenantId: 1, role: 'user' });
    const stillExists = db.prepare('SELECT * FROM projects WHERE id = 10').all();
    assertEquals(stillExists.length, 1);

    // Same tenant can delete it
    await repo.delete(10, { tenantId: 2, role: 'admin' });
    const deleted = db.prepare('SELECT * FROM projects WHERE id = 10').all();
    assertEquals(deleted.length, 0);

    teardownTestDatabase();
  },
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && deno test --allow-all tests/repositories/base_tenant_test.ts
```

Expected: FAIL — `findAll` doesn't accept a context argument, `tenantScoped` property doesn't exist.

- [ ] **Step 3: Update BaseRepository**

Replace `backend/src/repositories/base.ts`:

```typescript
import { getDb } from '../config/database.ts';

export interface TenantContext {
  tenantId: number;
  role: 'distributor' | 'admin' | 'user';
}

/**
 * Base Repository class
 * Provides common CRUD operations with optional tenant scoping
 */
export abstract class BaseRepository<T, CreateDTO, UpdateDTO> {
  protected abstract tableName: string;
  protected tenantScoped = false;

  private shouldFilter(ctx?: TenantContext): boolean {
    if (!this.tenantScoped) return false;
    if (!ctx) return false;
    return ctx.role !== 'distributor';
  }

  private tenantFilter(ctx?: TenantContext): { where: string; params: unknown[] } {
    if (this.shouldFilter(ctx)) {
      return { where: ' WHERE tenant_id = ?', params: [ctx!.tenantId] };
    }
    return { where: '', params: [] };
  }

  findAll(ctx?: TenantContext): Promise<T[]> {
    const { where, params } = this.tenantFilter(ctx);
    const result = getDb().prepare(`SELECT * FROM ${this.tableName}${where}`).all(...params);
    return Promise.resolve(result as T[]);
  }

  findById(id: number, ctx?: TenantContext): Promise<T | null> {
    if (this.shouldFilter(ctx)) {
      const result = getDb().prepare(
        `SELECT * FROM ${this.tableName} WHERE id = ? AND tenant_id = ?`
      ).all(id, ctx!.tenantId);
      return Promise.resolve(result.length > 0 ? (result[0] as T) : null);
    }
    const result = getDb().prepare(`SELECT * FROM ${this.tableName} WHERE id = ?`).all(id);
    return Promise.resolve(result.length > 0 ? (result[0] as T) : null);
  }

  abstract create(data: CreateDTO): Promise<T>;
  abstract update(id: number, data: UpdateDTO): Promise<T>;

  delete(id: number, ctx?: TenantContext): Promise<void> {
    if (this.shouldFilter(ctx)) {
      getDb().exec(
        `DELETE FROM ${this.tableName} WHERE id = ${id} AND tenant_id = ${ctx!.tenantId}`
      );
    } else {
      getDb().exec(`DELETE FROM ${this.tableName} WHERE id = ${id}`);
    }
    return Promise.resolve();
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && deno test --allow-all tests/repositories/base_tenant_test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Run full backend tests**

```bash
cd backend && deno task test
```

Expected: All tests pass. The new `ctx` parameter is optional, so existing callers still work.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/base.ts backend/tests/repositories/base_tenant_test.ts
git commit -m "feat: add tenant-scoped filtering to BaseRepository"
```

---

## Task 7: Tenant Repository

**Files:**
- Create: `backend/src/repositories/tenant.ts`

- [ ] **Step 1: Write tests**

Create `backend/tests/repositories/tenant_test.ts`:

```typescript
import { assertEquals, assertNotEquals } from 'https://deno.land/std/assert/mod.ts';
import { setupTestDatabase, clearDatabase, teardownTestDatabase } from '../test-utils.ts';
import { TenantRepository } from '../../src/repositories/tenant.ts';

const tenantRepo = new TenantRepository();

Deno.test({
  name: 'TenantRepository - create a tenant',
  async fn() {
    await setupTestDatabase();
    clearDatabase();

    const tenant = await tenantRepo.create({ name: 'Partner A' });
    assertNotEquals(tenant.id, undefined);
    assertEquals(tenant.name, 'Partner A');
    assertEquals(tenant.is_distributor, 0);
    assertEquals(tenant.is_active, 1);

    teardownTestDatabase();
  },
});

Deno.test({
  name: 'TenantRepository - list all tenants',
  async fn() {
    await setupTestDatabase();
    clearDatabase();

    await tenantRepo.create({ name: 'Partner A' });
    await tenantRepo.create({ name: 'Partner B' });

    const tenants = await tenantRepo.findAll();
    // 3 total: 1 distributor (seeded) + 2 partners
    assertEquals(tenants.length, 3);

    teardownTestDatabase();
  },
});

Deno.test({
  name: 'TenantRepository - update a tenant',
  async fn() {
    await setupTestDatabase();
    clearDatabase();

    const tenant = await tenantRepo.create({ name: 'Partner A' });
    const updated = await tenantRepo.update(tenant.id, { name: 'Partner A Renamed' });
    assertEquals(updated.name, 'Partner A Renamed');

    teardownTestDatabase();
  },
});

Deno.test({
  name: 'TenantRepository - soft delete a tenant',
  async fn() {
    await setupTestDatabase();
    clearDatabase();

    const tenant = await tenantRepo.create({ name: 'Partner A' });
    const deactivated = await tenantRepo.update(tenant.id, { is_active: 0 });
    assertEquals(deactivated.is_active, 0);

    teardownTestDatabase();
  },
});

Deno.test({
  name: 'TenantRepository - cannot delete distributor tenant',
  async fn() {
    await setupTestDatabase();
    clearDatabase();

    // The distributor tenant (id=1) is seeded by clearDatabase
    const tenants = await tenantRepo.findAll();
    const distributor = tenants.find((t: any) => t.is_distributor === 1);
    assertNotEquals(distributor, undefined);

    // Attempting to soft-delete distributor should be blocked (tested at route level)
    teardownTestDatabase();
  },
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && deno test --allow-all tests/repositories/tenant_test.ts
```

Expected: FAIL — `TenantRepository` doesn't exist.

- [ ] **Step 3: Create TenantRepository**

Create `backend/src/repositories/tenant.ts`:

```typescript
import { getDb } from '../config/database.ts';
import { BaseRepository } from './base.ts';
import type { Tenant, CreateTenantDTO, UpdateTenantDTO } from '../models/index.ts';

export class TenantRepository extends BaseRepository<Tenant, CreateTenantDTO, UpdateTenantDTO> {
  protected tableName = 'tenants';

  create(data: CreateTenantDTO): Promise<Tenant> {
    const db = getDb();
    db.prepare(
      'INSERT INTO tenants (name) VALUES (?)'
    ).run(data.name);

    const result = db.prepare(
      'SELECT * FROM tenants WHERE id = last_insert_rowid()'
    ).all();
    return Promise.resolve(result[0] as Tenant);
  }

  update(id: number, data: UpdateTenantDTO): Promise<Tenant> {
    const db = getDb();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active);
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(
        `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values);
    }

    const result = db.prepare('SELECT * FROM tenants WHERE id = ?').all(id);
    return Promise.resolve(result[0] as Tenant);
  }

  findByName(name: string): Promise<Tenant | null> {
    const result = getDb().prepare(
      'SELECT * FROM tenants WHERE name = ?'
    ).all(name);
    return Promise.resolve(result.length > 0 ? (result[0] as Tenant) : null);
  }

  findDistributor(): Promise<Tenant | null> {
    const result = getDb().prepare(
      'SELECT * FROM tenants WHERE is_distributor = 1'
    ).all();
    return Promise.resolve(result.length > 0 ? (result[0] as Tenant) : null);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && deno test --allow-all tests/repositories/tenant_test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/tenant.ts backend/tests/repositories/tenant_test.ts
git commit -m "feat: add TenantRepository with CRUD operations"
```

---

## Task 8: Tenant API Routes

**Files:**
- Create: `backend/src/routes/tenants.ts`
- Create: `backend/tests/routes/tenants_test.ts`
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Write route tests**

Create `backend/tests/routes/tenants_test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
import { setupTestDatabase, clearDatabase, teardownTestDatabase } from '../test-utils.ts';
import { Hono } from 'hono';
import { authMiddleware, distributorMiddleware } from '../../src/middleware/auth.ts';
import { generateToken } from '../../src/services/jwt.ts';
import tenantRoutes from '../../src/routes/tenants.ts';

const app = new Hono();
app.route('/tenants', tenantRoutes);

let distributorToken: string;
let partnerAdminToken: string;

async function setup() {
  await setupTestDatabase();
  clearDatabase();
  distributorToken = await generateToken(1, 'dist@test.com', 'distributor', 1);
  partnerAdminToken = await generateToken(2, 'admin@partner.com', 'admin', 2);
}

Deno.test('Tenants - POST /tenants creates a partner', async () => {
  await setup();
  const res = await app.request('/tenants', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${distributorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Partner A' }),
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.data.name, 'Partner A');
  assertEquals(body.data.is_distributor, 0);
  teardownTestDatabase();
});

Deno.test('Tenants - GET /tenants lists all tenants', async () => {
  await setup();
  // Create a partner
  await app.request('/tenants', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${distributorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Partner A' }),
  });

  const res = await app.request('/tenants', {
    headers: { Authorization: `Bearer ${distributorToken}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.length, 2); // Distributor + Partner A
  teardownTestDatabase();
});

Deno.test('Tenants - PUT /tenants/:id updates a tenant', async () => {
  await setup();
  const createRes = await app.request('/tenants', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${distributorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Partner A' }),
  });
  const { data: created } = await createRes.json();

  const res = await app.request(`/tenants/${created.id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${distributorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Partner A Updated' }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.name, 'Partner A Updated');
  teardownTestDatabase();
});

Deno.test('Tenants - DELETE /tenants/:id soft-deletes a tenant', async () => {
  await setup();
  const createRes = await app.request('/tenants', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${distributorToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'Partner A' }),
  });
  const { data: created } = await createRes.json();

  const res = await app.request(`/tenants/${created.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${distributorToken}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.is_active, 0);
  teardownTestDatabase();
});

Deno.test('Tenants - DELETE /tenants/:id rejects deleting distributor tenant', async () => {
  await setup();
  const res = await app.request('/tenants/1', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${distributorToken}` },
  });
  assertEquals(res.status, 403);
  teardownTestDatabase();
});

Deno.test('Tenants - non-distributor cannot access tenant routes', async () => {
  await setup();
  const res = await app.request('/tenants', {
    headers: { Authorization: `Bearer ${partnerAdminToken}` },
  });
  assertEquals(res.status, 403);
  teardownTestDatabase();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && deno test --allow-all tests/routes/tenants_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create tenant routes**

Create `backend/src/routes/tenants.ts`:

```typescript
import { Hono } from 'hono';
import { authMiddleware, distributorMiddleware } from '../middleware/auth.ts';
import { TenantRepository } from '../repositories/tenant.ts';

const tenantRoutes = new Hono();
const tenantRepo = new TenantRepository();

// All tenant routes require distributor role
tenantRoutes.use('/*', authMiddleware, distributorMiddleware);

// GET /tenants - List all tenants
tenantRoutes.get('/', async (c) => {
  const tenants = await tenantRepo.findAll();
  return c.json({ data: tenants });
});

// GET /tenants/:id - Get single tenant
tenantRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const tenant = await tenantRepo.findById(id);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  return c.json({ data: tenant });
});

// POST /tenants - Create a new partner tenant
tenantRoutes.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json({ error: 'Tenant name is required' }, 400);
  }

  const existing = await tenantRepo.findByName(body.name.trim());
  if (existing) {
    return c.json({ error: 'A tenant with this name already exists' }, 409);
  }

  const tenant = await tenantRepo.create({ name: body.name.trim() });
  return c.json({ data: tenant }, 201);
});

// PUT /tenants/:id - Update a tenant
tenantRoutes.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const tenant = await tenantRepo.findById(id);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  const body = await c.req.json();
  const updated = await tenantRepo.update(id, {
    name: body.name?.trim(),
    is_active: body.is_active,
  });
  return c.json({ data: updated });
});

// DELETE /tenants/:id - Soft delete a tenant
tenantRoutes.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  const tenant = await tenantRepo.findById(id);

  if (!tenant) {
    return c.json({ error: 'Tenant not found' }, 404);
  }

  if (tenant.is_distributor) {
    return c.json({ error: 'Cannot deactivate the distributor tenant' }, 403);
  }

  const deactivated = await tenantRepo.update(id, { is_active: 0 });
  return c.json({ data: deactivated });
});

export default tenantRoutes;
```

- [ ] **Step 4: Mount tenant routes in main.ts**

In `backend/src/main.ts`, add the import and route mounting:

Add import at top:
```typescript
import tenantRoutes from './routes/tenants.ts';
```

Add route mounting alongside other routes (before `app.route('/api', api)`):
```typescript
api.route('/tenants', tenantRoutes);
```

- [ ] **Step 5: Run tests**

```bash
cd backend && deno test --allow-all tests/routes/tenants_test.ts
```

Expected: All 6 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/tenants.ts backend/src/main.ts backend/tests/routes/tenants_test.ts
git commit -m "feat: add tenant management API routes (distributor only)"
```

---

## Task 9: Update Project Routes — Tenant Filtering

**Files:**
- Modify: `backend/src/repositories/project.ts`
- Modify: `backend/src/routes/projects.ts`

- [ ] **Step 1: Write tests for tenant-scoped projects**

Create `backend/tests/routes/projects_tenant_test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
import { setupTestDatabase, clearDatabase, teardownTestDatabase } from '../test-utils.ts';
import { getDb } from '../../src/config/database.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { Hono } from 'hono';
import projectRoutes from '../../src/routes/projects.ts';

const app = new Hono();
app.route('/projects', projectRoutes);

async function setup() {
  await setupTestDatabase();
  clearDatabase();
  const db = getDb();
  // Create partner tenant
  db.exec("INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (2, 'Partner A', 0, 1)");
  // Create projects in different tenants
  db.exec("INSERT INTO projects (name, customer_name, tenant_id) VALUES ('Dist Project', 'Cust A', 1)");
  db.exec("INSERT INTO projects (name, customer_name, tenant_id) VALUES ('Partner Project', 'Cust B', 2)");
}

Deno.test('Projects tenant - partner user sees only own tenant projects', async () => {
  await setup();
  const token = await generateToken(2, 'user@partner.com', 'user', 2);
  const res = await app.request('/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.length, 1);
  assertEquals(body.data[0].name, 'Partner Project');
  teardownTestDatabase();
});

Deno.test('Projects tenant - distributor sees all projects', async () => {
  await setup();
  const token = await generateToken(1, 'dist@test.com', 'distributor', 1);
  const res = await app.request('/projects', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.length, 2);
  teardownTestDatabase();
});

Deno.test('Projects tenant - distributor can filter by tenantId', async () => {
  await setup();
  const token = await generateToken(1, 'dist@test.com', 'distributor', 1);
  const res = await app.request('/projects?tenantId=2', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.length, 1);
  assertEquals(body.data[0].name, 'Partner Project');
  teardownTestDatabase();
});

Deno.test('Projects tenant - non-distributor cannot use tenantId param', async () => {
  await setup();
  const token = await generateToken(2, 'user@partner.com', 'user', 2);
  const res = await app.request('/projects?tenantId=1', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  // Should ignore the tenantId param and only show own tenant
  assertEquals(body.data.length, 1);
  assertEquals(body.data[0].name, 'Partner Project');
  teardownTestDatabase();
});

Deno.test('Projects tenant - new project gets callers tenantId', async () => {
  await setup();
  const token = await generateToken(2, 'user@partner.com', 'user', 2);
  const res = await app.request('/projects', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'New Partner Project', customer_name: 'Cust C' }),
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.data.tenant_id, 2);
  teardownTestDatabase();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && deno test --allow-all tests/routes/projects_tenant_test.ts
```

Expected: FAIL — projects not filtered by tenant.

- [ ] **Step 3: Update ProjectRepository**

In `backend/src/repositories/project.ts`, add `protected tenantScoped = true;` to the class. Update the `create` method to include `tenant_id` from the DTO, and update `findAll` and other query methods to use the tenant context from the base class.

The key changes:
- Add `protected tenantScoped = true;`
- Update `create()` to include `tenant_id` in INSERT
- Override `findAll()` to support search while respecting tenant filtering — build the WHERE clause to include both search and tenant_id conditions
- Ensure `findById`, `update`, `delete` pass through the `ctx` parameter to base class methods

- [ ] **Step 4: Update project routes to pass tenant context**

In `backend/src/routes/projects.ts`, update each route handler to build a `TenantContext` from the Hono context and pass it to repository methods:

```typescript
import type { TenantContext } from '../repositories/base.ts';

// In each route handler:
const tenantCtx: TenantContext = {
  tenantId: c.get('tenantId'),
  role: c.get('userRole'),
};

// For distributor with ?tenantId query param:
const queryTenantId = c.req.query('tenantId');
if (queryTenantId && tenantCtx.role === 'distributor') {
  tenantCtx.tenantId = parseInt(queryTenantId);
  tenantCtx.role = 'admin'; // Force filtering by the specified tenant
}
```

For project creation, set `tenant_id` from the caller's context:
```typescript
const project = await projectRepo.create({ ...body, tenant_id: c.get('tenantId') });
```

- [ ] **Step 5: Run tests**

```bash
cd backend && deno test --allow-all tests/routes/projects_tenant_test.ts
```

Expected: All 5 tests pass.

- [ ] **Step 6: Run full backend tests**

```bash
cd backend && deno task test
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/repositories/project.ts backend/src/routes/projects.ts backend/tests/routes/projects_tenant_test.ts
git commit -m "feat: add tenant filtering to project routes and repository"
```

---

## Task 10: Update User Routes — Tenant Filtering

**Files:**
- Modify: `backend/src/repositories/user.ts`
- Modify: `backend/src/routes/users.ts`

- [ ] **Step 1: Write tests for tenant-scoped users**

Create `backend/tests/routes/users_tenant_test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
import { setupTestDatabase, clearDatabase, teardownTestDatabase } from '../test-utils.ts';
import { getDb } from '../../src/config/database.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { Hono } from 'hono';
import userRoutes from '../../src/routes/users.ts';
import * as bcrypt from 'https://deno.land/x/bcrypt/mod.ts';

const app = new Hono();
app.route('/users', userRoutes);

async function setup() {
  await setupTestDatabase();
  clearDatabase();
  const db = getDb();
  const hash = await bcrypt.hash('password123');

  // Create tenants
  db.exec("INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (2, 'Partner A', 0, 1)");

  // Create users in different tenants
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)"
  ).run(1, 'dist@test.com', hash, 'distributor', 1);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)"
  ).run(2, 'admin@partner.com', hash, 'admin', 2);
  db.prepare(
    "INSERT INTO users (id, email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)"
  ).run(3, 'user@partner.com', hash, 'user', 2);
}

Deno.test('Users tenant - partner admin sees only own tenant users', async () => {
  await setup();
  const token = await generateToken(2, 'admin@partner.com', 'admin', 2);
  const res = await app.request('/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.length, 2); // admin + user in tenant 2
  teardownTestDatabase();
});

Deno.test('Users tenant - distributor sees all users', async () => {
  await setup();
  const token = await generateToken(1, 'dist@test.com', 'distributor', 1);
  const res = await app.request('/users', {
    headers: { Authorization: `Bearer ${token}` },
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.length, 3); // all users
  teardownTestDatabase();
});

Deno.test('Users tenant - partner admin creates user in own tenant', async () => {
  await setup();
  const token = await generateToken(2, 'admin@partner.com', 'admin', 2);
  const res = await app.request('/users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'new@partner.com',
      password: 'password123',
      role: 'user',
    }),
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.data.tenant_id, 2);
  teardownTestDatabase();
});

Deno.test('Users tenant - distributor creates user in any tenant', async () => {
  await setup();
  const token = await generateToken(1, 'dist@test.com', 'distributor', 1);
  const res = await app.request('/users', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'new@partner.com',
      password: 'password123',
      role: 'user',
      tenant_id: 2,
    }),
  });
  assertEquals(res.status, 201);
  const body = await res.json();
  assertEquals(body.data.tenant_id, 2);
  teardownTestDatabase();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && deno test --allow-all tests/routes/users_tenant_test.ts
```

Expected: FAIL — users not filtered by tenant.

- [ ] **Step 3: Update UserRepository**

In `backend/src/repositories/user.ts`:
- Add `protected tenantScoped = true;`
- Update `create()` to include `tenant_id`
- Update `findAll()` to accept and use `TenantContext`

- [ ] **Step 4: Update user routes**

In `backend/src/routes/users.ts`:
- Build `TenantContext` in each handler from Hono context
- Pass context to repository methods
- On create: use caller's `tenantId` unless distributor specifies `tenant_id` in body
- Support `?tenantId=X` query param for distributor on GET /users
- Prevent partner admin from creating users with `distributor` role
- Prevent partner admin from assigning users to other tenants

- [ ] **Step 5: Run tests**

```bash
cd backend && deno test --allow-all tests/routes/users_tenant_test.ts
```

Expected: All 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/user.ts backend/src/routes/users.ts backend/tests/routes/users_tenant_test.ts
git commit -m "feat: add tenant filtering to user routes and repository"
```

---

## Task 11: Update Catalog Routes — Distributor-Only Writes

**Files:**
- Modify: `backend/src/routes/items.ts`
- Modify: `backend/src/routes/categories.ts`

- [ ] **Step 1: Write test for catalog access control**

Create `backend/tests/routes/catalog_access_test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
import { setupTestDatabase, clearDatabase, teardownTestDatabase } from '../test-utils.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { Hono } from 'hono';
import categoryRoutes from '../../src/routes/categories.ts';

const app = new Hono();
app.route('/categories', categoryRoutes);

Deno.test('Catalog - partner admin cannot create category', async () => {
  await setupTestDatabase();
  clearDatabase();
  const token = await generateToken(2, 'admin@partner.com', 'admin', 2);
  const res = await app.request('/categories', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'New Category' }),
  });
  assertEquals(res.status, 403);
  teardownTestDatabase();
});

Deno.test('Catalog - distributor can create category', async () => {
  await setupTestDatabase();
  clearDatabase();
  const token = await generateToken(1, 'dist@test.com', 'distributor', 1);
  const res = await app.request('/categories', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: 'New Category' }),
  });
  assertEquals(res.status, 201);
  teardownTestDatabase();
});

Deno.test('Catalog - partner user can read categories', async () => {
  await setupTestDatabase();
  clearDatabase();
  const token = await generateToken(3, 'user@partner.com', 'user', 2);
  const res = await app.request('/categories', {
    headers: { Authorization: `Bearer ${token}` },
  });
  // Categories GET is public (no auth), so this should work
  assertEquals(res.status, 200);
  teardownTestDatabase();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && deno test --allow-all tests/routes/catalog_access_test.ts
```

Expected: FAIL — partner admin can still create categories (currently uses `adminMiddleware` which allows `admin` role).

- [ ] **Step 3: Replace adminMiddleware with distributorMiddleware on catalog write routes**

In `backend/src/routes/items.ts`:
- Add import: `import { authMiddleware, distributorMiddleware } from '../middleware/auth.ts';`
- Replace every `adminMiddleware` with `distributorMiddleware` on write routes (POST, PUT, DELETE, PATCH)
- Keep read routes (GET) unchanged — no auth needed

In `backend/src/routes/categories.ts`:
- Same change: replace `adminMiddleware` with `distributorMiddleware` on write routes

- [ ] **Step 4: Run tests**

```bash
cd backend && deno test --allow-all tests/routes/catalog_access_test.ts
```

Expected: All 3 tests pass.

- [ ] **Step 5: Run full backend tests**

```bash
cd backend && deno task test
```

Expected: All tests pass (existing tests that used `admin` role for catalog writes need updating to `distributor`).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/items.ts backend/src/routes/categories.ts backend/tests/routes/catalog_access_test.ts
git commit -m "feat: restrict catalog writes to distributor role only"
```

---

## Task 12: Update Auth Route — Include tenantId in Login Response

**Files:**
- Modify: `backend/src/routes/auth.ts`

- [ ] **Step 1: Write test for login response tenantId**

Add to the existing auth tests or create `backend/tests/routes/auth_tenant_test.ts`:

```typescript
import { assertEquals } from 'https://deno.land/std/assert/mod.ts';
import { setupTestDatabase, clearDatabase, teardownTestDatabase } from '../test-utils.ts';
import { getDb } from '../../src/config/database.ts';
import { Hono } from 'hono';
import authRoutes from '../../src/routes/auth.ts';
import * as bcrypt from 'https://deno.land/x/bcrypt/mod.ts';

const app = new Hono();
app.route('/auth', authRoutes);

Deno.test('Auth - login response includes tenantId and tenantName', async () => {
  await setupTestDatabase();
  clearDatabase();
  const db = getDb();
  const hash = await bcrypt.hash('password123');
  db.prepare(
    "INSERT INTO users (email, password_hash, role, tenant_id, full_name) VALUES (?, ?, ?, ?, ?)"
  ).run('dist@test.com', hash, 'distributor', 1, 'Distributor Admin');

  const res = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dist@test.com', password: 'password123' }),
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.data.user.tenantId, 1);
  assertEquals(body.data.user.tenantName, 'Distributor');
  assertEquals(body.data.user.role, 'distributor');
  teardownTestDatabase();
});

Deno.test('Auth - login blocked for deactivated tenant', async () => {
  await setupTestDatabase();
  clearDatabase();
  const db = getDb();
  const hash = await bcrypt.hash('password123');
  db.exec("INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (2, 'Partner A', 0, 0)");
  db.prepare(
    "INSERT INTO users (email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?)"
  ).run('user@partner.com', hash, 'user', 2);

  const res = await app.request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@partner.com', password: 'password123' }),
  });
  assertEquals(res.status, 403);
  teardownTestDatabase();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && deno test --allow-all tests/routes/auth_tenant_test.ts
```

Expected: FAIL — login response doesn't include tenantId/tenantName, and deactivated tenant check doesn't exist.

- [ ] **Step 3: Update auth routes**

In `backend/src/routes/auth.ts`, update the login handler:

1. After verifying the user's password, look up the user's tenant:
```typescript
import { TenantRepository } from '../repositories/tenant.ts';
const tenantRepo = new TenantRepository();

// In login handler, after user is verified:
const tenant = await tenantRepo.findById(user.tenant_id);
if (!tenant || !tenant.is_active) {
  return c.json({ error: 'Account disabled - contact your distributor' }, 403);
}
```

2. Include tenantId and tenantName in the login response user object:
```typescript
return c.json({
  data: {
    accessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      tenantId: user.tenant_id,
      tenantName: tenant.name,
    },
  },
});
```

3. Update the `/auth/me` endpoint similarly — look up tenant and include tenantId/tenantName.

4. Update the refresh token endpoint — include tenantId in the new access token (already done in Task 3).

- [ ] **Step 4: Run tests**

```bash
cd backend && deno test --allow-all tests/routes/auth_tenant_test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Run full backend tests**

```bash
cd backend && deno task test
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/auth.ts backend/tests/routes/auth_tenant_test.ts
git commit -m "feat: include tenantId/tenantName in login, block deactivated tenants"
```

---

## Task 13: Backend Lint & Full Test Pass

**Files:** All backend files

- [ ] **Step 1: Run deno lint**

```bash
cd backend && deno lint
```

Expected: No lint errors. Fix any that appear.

- [ ] **Step 2: Run full backend tests**

```bash
cd backend && deno task test
```

Expected: All tests pass (existing + new).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A backend/
git commit -m "fix: resolve lint errors and test failures from multi-tenancy backend"
```

---

## Task 14: Frontend — Update Auth Types & Context

**Files:**
- Modify: `frontend/src/context/AuthContext.tsx`
- Modify: `frontend/src/services/auth.ts`

- [ ] **Step 1: Update auth service types**

In `frontend/src/services/auth.ts`, update the user type in the login response to include tenantId and tenantName. Find where the login response user object is typed and add:

```typescript
export interface AuthUser {
  id: number;
  email: string;
  role: 'distributor' | 'admin' | 'user';
  fullName?: string;
  tenantId: number;
  tenantName: string;
}
```

Update `getCurrentUser()` return type to include `tenantId` and `tenantName`.

- [ ] **Step 2: Update AuthContext**

In `frontend/src/context/AuthContext.tsx`:

Update the `User` type/interface to include `tenantId` and `tenantName`:

```typescript
interface User {
  id: number;
  email: string;
  role: 'distributor' | 'admin' | 'user';
  fullName?: string;
  tenantId: number;
  tenantName: string;
}
```

- [ ] **Step 3: Update ProtectedRoute**

In `frontend/src/components/auth/ProtectedRoute.tsx`:

Update the admin check to also allow `distributor`:

```typescript
if (requireAdmin && user?.role !== 'admin' && user?.role !== 'distributor') {
  return <Navigate to="/" replace />;
}
```

Add a new `requireDistributor` prop:

```typescript
interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireDistributor?: boolean;
}

// Add distributor check:
if (requireDistributor && user?.role !== 'distributor') {
  return <Navigate to="/" replace />;
}
```

- [ ] **Step 4: Verify frontend compiles**

```bash
cd frontend && npm run build
```

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/context/AuthContext.tsx frontend/src/services/auth.ts frontend/src/components/auth/ProtectedRoute.tsx
git commit -m "feat: add tenantId/tenantName to frontend auth types, update ProtectedRoute"
```

---

## Task 15: Frontend — Tenant Service

**Files:**
- Create: `frontend/src/services/tenants.ts`

- [ ] **Step 1: Create tenant API service**

Create `frontend/src/services/tenants.ts`:

```typescript
import api from './api';

export interface Tenant {
  id: number;
  name: string;
  is_distributor: number;
  is_active: number;
  created_at: string;
}

export interface CreateTenantDTO {
  name: string;
}

export interface UpdateTenantDTO {
  name?: string;
  is_active?: number;
}

export const tenantService = {
  async getAll(): Promise<Tenant[]> {
    const response = await api.get('/tenants');
    return response.data.data;
  },

  async getById(id: number): Promise<Tenant> {
    const response = await api.get(`/tenants/${id}`);
    return response.data.data;
  },

  async create(data: CreateTenantDTO): Promise<Tenant> {
    const response = await api.post('/tenants', data);
    return response.data.data;
  },

  async update(id: number, data: UpdateTenantDTO): Promise<Tenant> {
    const response = await api.put(`/tenants/${id}`, data);
    return response.data.data;
  },

  async deactivate(id: number): Promise<Tenant> {
    const response = await api.delete(`/tenants/${id}`);
    return response.data.data;
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/services/tenants.ts
git commit -m "feat: add tenant API service"
```

---

## Task 16: Frontend — Tenant Management Page

**Files:**
- Create: `frontend/src/pages/settings/TenantManagement.tsx`
- Create: `frontend/src/components/settings/TenantFormModal.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create TenantFormModal**

Create `frontend/src/components/settings/TenantFormModal.tsx` following the existing modal pattern (like UserFormModal). Props:

```typescript
interface TenantFormModalProps {
  tenant: Tenant | null;  // null = create, object = edit
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateTenantDTO | UpdateTenantDTO) => Promise<void>;
}
```

Form fields:
- Name (text input, required)

Buttons: "Create" / "Update" + "Cancel"

- [ ] **Step 2: Create TenantManagement page**

Create `frontend/src/pages/settings/TenantManagement.tsx` following the `UserManagement.tsx` pattern:

- State: `tenants[]`, `isLoading`, `error`, modal state
- Fetch tenants on mount
- Table columns: Name, Status (Active/Inactive badge), Type (Distributor/Partner badge), Created, Actions
- Distributor tenant row has disabled delete button
- Actions: Edit, Deactivate/Activate
- Modals: TenantFormModal, ConfirmDeleteModal (for deactivation)

- [ ] **Step 3: Add route in App.tsx**

In `frontend/src/App.tsx`, add the tenant management route inside the admin routes section. Wrap with `<ProtectedRoute requireDistributor>`:

```tsx
import TenantManagement from './pages/settings/TenantManagement';

// Inside Route definitions, in the admin section:
<Route
  path="settings/tenants"
  element={
    <ProtectedRoute requireDistributor>
      <TenantManagement />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 4: Verify it renders**

```bash
cd frontend && npm run build
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/settings/TenantManagement.tsx frontend/src/components/settings/TenantFormModal.tsx frontend/src/App.tsx
git commit -m "feat: add Tenant Management page (distributor only)"
```

---

## Task 17: Frontend — Header & Navigation Updates

**Files:**
- Modify: `frontend/src/components/layout/Header.tsx`
- Create: `frontend/src/components/layout/TenantSwitcher.tsx`

- [ ] **Step 1: Create TenantSwitcher component**

Create `frontend/src/components/layout/TenantSwitcher.tsx`:

A dropdown component that:
- Fetches tenants list on mount (distributor only)
- Shows "All Tenants" as default + list of tenant names
- Stores selected tenant ID in state (or URL query param)
- Passes selected tenant to a context or callback so ProjectList/UserManagement can filter

```typescript
interface TenantSwitcherProps {
  selectedTenantId: number | null;  // null = all
  onTenantChange: (tenantId: number | null) => void;
}
```

Uses shadcn/ui Select or DropdownMenu component, consistent with existing header dropdowns.

- [ ] **Step 2: Update Header navigation**

In `frontend/src/components/layout/Header.tsx`:

1. Show "Catalog" dropdown for all authenticated users (not just admin). Items inside are read-only for non-distributors (handled at page level).
2. Show "Settings" dropdown:
   - "User Management" — visible to `distributor` and `admin`
   - "Tenant Management" — visible to `distributor` only
3. Show tenant name badge next to user info for partner users
4. Show TenantSwitcher for distributor role (in the header bar)

Conditional logic based on `user.role`:
```typescript
const isDistributor = user?.role === 'distributor';
const isAdmin = user?.role === 'admin' || isDistributor;
```

- [ ] **Step 3: Verify it renders**

```bash
cd frontend && npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Header.tsx frontend/src/components/layout/TenantSwitcher.tsx
git commit -m "feat: update header navigation for multi-tenancy roles, add TenantSwitcher"
```

---

## Task 18: Frontend — Update ProjectList for Tenant Awareness

**Files:**
- Modify: `frontend/src/pages/projects/ProjectList.tsx`

- [ ] **Step 1: Add tenant column for distributor**

In `frontend/src/pages/projects/ProjectList.tsx`:

1. If user is distributor, show a "Tenant" column in the table
2. Pass `?tenantId=X` to the API when the TenantSwitcher has a selection
3. Read the selected tenant from URL search params or a shared state

Add to fetch call:
```typescript
const params: Record<string, string> = {};
if (searchQuery) params.search = searchQuery;
if (selectedTenantId && user?.role === 'distributor') {
  params.tenantId = selectedTenantId.toString();
}
```

Add tenant column (only for distributor):
```tsx
{user?.role === 'distributor' && <th>Tenant</th>}
// ...
{user?.role === 'distributor' && <td>{project.tenant_name}</td>}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npm run build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/projects/ProjectList.tsx
git commit -m "feat: add tenant column and filtering to ProjectList for distributor"
```

---

## Task 19: Frontend — Update UserManagement for Tenant Awareness

**Files:**
- Modify: `frontend/src/pages/settings/UserManagement.tsx`

- [ ] **Step 1: Add tenant filtering for distributor**

In `frontend/src/pages/settings/UserManagement.tsx`:

1. If user is distributor, show a tenant filter dropdown at the top
2. Pass `?tenantId=X` to the API when filtering
3. Show tenant column in the table for distributor
4. When distributor creates a user, allow selecting which tenant to add them to
5. Hide `distributor` role option for partner admins in the create/edit form

- [ ] **Step 2: Update role options in user form**

In the user create/edit form (UserFormModal or inline):
- Distributor can assign: `distributor`, `admin`, `user`
- Partner admin can assign: `admin`, `user` (within own tenant only)

- [ ] **Step 3: Verify it compiles**

```bash
cd frontend && npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/settings/UserManagement.tsx
git commit -m "feat: add tenant filtering to UserManagement for distributor"
```

---

## Task 20: Frontend — Hide Catalog Write Actions for Non-Distributors

**Files:**
- Modify: `frontend/src/pages/catalog/ItemManagement.tsx`
- Modify: `frontend/src/pages/catalog/CategoryManagement.tsx`

- [ ] **Step 1: Conditionally hide action buttons**

In both `ItemManagement.tsx` and `CategoryManagement.tsx`:

```typescript
const { user } = useAuth();
const isDistributor = user?.role === 'distributor';
```

Then wrap action buttons with the condition:
- Hide "Add Product" / "Add Category" buttons if `!isDistributor`
- Hide "Import Catalog" button if `!isDistributor`
- Hide Edit/Delete action buttons in table rows if `!isDistributor`
- Keep the pages accessible (read-only browsing) for all roles

- [ ] **Step 2: Update App.tsx routing**

In `frontend/src/App.tsx`, change catalog routes from `requireAdmin` to just `ProtectedRoute` (no admin requirement) — all authenticated users can browse the catalog:

```tsx
<Route path="catalog/products" element={<ProtectedRoute><ItemManagement /></ProtectedRoute>} />
<Route path="catalog/categories" element={<ProtectedRoute><CategoryManagement /></ProtectedRoute>} />
```

Keep user management routes as `requireAdmin`:
```tsx
<Route path="settings/users" element={<ProtectedRoute requireAdmin><UserManagement /></ProtectedRoute>} />
```

- [ ] **Step 3: Verify it compiles**

```bash
cd frontend && npm run build
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/catalog/ItemManagement.tsx frontend/src/pages/catalog/CategoryManagement.tsx frontend/src/App.tsx
git commit -m "feat: make catalog read-only for non-distributors, hide write actions"
```

---

## Task 21: Frontend Lint & Build

**Files:** All frontend files

- [ ] **Step 1: Run ESLint**

```bash
cd frontend && npm run lint
```

Expected: No errors. Fix any that appear.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npm run test:run
```

Expected: All tests pass. Update any that fail due to role changes (`admin` → `distributor`).

- [ ] **Step 3: Run build**

```bash
cd frontend && npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A frontend/
git commit -m "fix: resolve lint errors and test failures from multi-tenancy frontend"
```

---

## Task 22: End-to-End Smoke Test

- [ ] **Step 1: Start backend and frontend**

```bash
npm run dev
```

- [ ] **Step 2: Test distributor flow**

1. Log in as existing admin (now distributor)
2. Verify catalog management works (create/edit/delete items)
3. Navigate to Settings > Tenants — create a new partner "Partner A"
4. Navigate to Settings > Users — create a user in Partner A (role: admin)
5. Verify projects show all projects, tenant column visible

- [ ] **Step 3: Test partner admin flow**

1. Log out, log in as the Partner A admin
2. Verify they see only Partner A's projects (initially empty)
3. Create a project — verify it's associated with Partner A
4. Navigate to catalog — verify browse works but no edit/delete buttons
5. Navigate to Users — verify they only see Partner A users

- [ ] **Step 4: Test isolation**

1. Log in as distributor, create another partner "Partner B" with a user
2. Log in as Partner B user, create a project
3. Log in as Partner A admin — verify they cannot see Partner B's project
4. Log in as distributor — verify they see both projects

- [ ] **Step 5: Commit any fixes found during smoke testing**

```bash
git add -A
git commit -m "fix: address issues found during multi-tenancy smoke testing"
```

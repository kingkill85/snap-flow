import { assertEquals, assertExists } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { getDb } from '../../src/config/database.ts';
import { generateToken } from '../../src/services/jwt.ts';
import tenantRoutes from '../../src/routes/tenants.ts';

const app = new Hono();
app.route('/tenants', tenantRoutes);

// Setup test database before all tests
await setupTestDatabase();

/** Helper: generate an admin token for tenant_id=1 */
async function adminToken(userId = 1): Promise<string> {
  return await generateToken(userId, 'admin@example.com', 'admin', 1);
}

/** Helper: generate a tenant_admin token */
async function tenantAdminToken(userId = 50): Promise<string> {
  return await generateToken(userId, 'tenantadmin@example.com', 'tenant_admin', 2);
}

/** Helper: generate a regular user token */
async function userToken(userId = 60): Promise<string> {
  return await generateToken(userId, 'user@example.com', 'user', 1);
}

/** Helper: make a request to the Hono app */
async function request(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
  } = {},
): Promise<Response> {
  const url = `http://localhost:8000${path}`;
  const req = new Request(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body ?? null,
  });
  return await app.fetch(req);
}

/** Helper: create a partner tenant via direct SQL and return its id */
function createPartnerTenant(name: string, isActive = 1): number {
  const db = getDb();
  db.query(
    'INSERT INTO tenants (name, is_distributor, is_active) VALUES (?, 0, ?)',
    [name, isActive],
  );
  const rows = db.queryEntries<{ id: number }>(
    'SELECT id FROM tenants WHERE name = ?',
    [name],
  );
  return rows[0].id;
}

/** Helper: create a user via direct SQL */
function createUser(email: string, tenantId: number, role = 'user'): number {
  const db = getDb();
  db.query(
    'INSERT INTO users (email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?)',
    [email, 'hash', role, tenantId],
  );
  const rows = db.queryEntries<{ id: number }>(
    'SELECT id FROM users WHERE email = ?',
    [email],
  );
  return rows[0].id;
}

/** Helper: create a project via direct SQL */
function createProject(name: string, tenantId: number): number {
  const db = getDb();
  db.query(
    'INSERT INTO projects (name, customer_name, tenant_id) VALUES (?, ?, ?)',
    [name, 'Test Customer', tenantId],
  );
  const rows = db.queryEntries<{ id: number }>(
    'SELECT id FROM projects WHERE name = ? AND tenant_id = ?',
    [name, tenantId],
  );
  return rows[0].id;
}

// ──────────────────────────────────────────────
// POST /tenants
// ──────────────────────────────────────────────

Deno.test('Tenants - admin can create a partner tenant', async () => {
  clearDatabase();
  const token = await adminToken();

  const res = await request('/tenants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Partner A' }),
  });

  const data = await res.json();

  assertEquals(res.status, 201);
  assertEquals(data.data.name, 'Partner A');
  assertEquals(data.data.is_distributor, 0);
  assertExists(data.data.id);
});

Deno.test('Tenants - admin can create a distributor tenant', async () => {
  clearDatabase();
  const token = await adminToken();

  const res = await request('/tenants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Distro Corp', is_distributor: 1 }),
  });

  const data = await res.json();

  assertEquals(res.status, 201);
  assertEquals(data.data.name, 'Distro Corp');
  assertEquals(data.data.is_distributor, 1);
});

Deno.test('Tenants - rejects duplicate tenant name (409)', async () => {
  clearDatabase();
  const token = await adminToken();

  // Create first tenant
  await request('/tenants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Unique Partner' }),
  });

  // Try to create duplicate
  const res = await request('/tenants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Unique Partner' }),
  });

  const data = await res.json();

  assertEquals(res.status, 409);
  assertEquals(data.error, 'A tenant with this name already exists');
});

Deno.test('Tenants - rejects empty name (400)', async () => {
  clearDatabase();
  const token = await adminToken();

  const res = await request('/tenants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: '' }),
  });

  const data = await res.json();

  assertEquals(res.status, 400);
  assertEquals(data.error, 'Tenant name is required');
});

// ──────────────────────────────────────────────
// GET /tenants
// ──────────────────────────────────────────────

Deno.test('Tenants - admin can list all tenants', async () => {
  clearDatabase();
  const token = await adminToken();

  // Distributor already seeded as id=1 by clearDatabase()
  createPartnerTenant('Partner X');
  createPartnerTenant('Partner Y');

  const res = await request('/tenants', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();

  assertEquals(res.status, 200);
  assertEquals(Array.isArray(data.data), true);
  // At least the distributor + 2 partners
  assertEquals(data.data.length >= 3, true);
});

// ──────────────────────────────────────────────
// GET /tenants/:id
// ──────────────────────────────────────────────

Deno.test('Tenants - admin can get single tenant', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Solo Partner');

  const res = await request(`/tenants/${tenantId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();

  assertEquals(res.status, 200);
  assertEquals(data.data.name, 'Solo Partner');
  assertEquals(data.data.id, tenantId);
});

Deno.test('Tenants - returns 404 for non-existent tenant', async () => {
  clearDatabase();
  const token = await adminToken();

  const res = await request('/tenants/99999', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();

  assertEquals(res.status, 404);
  assertEquals(data.error, 'Tenant not found');
});

// ──────────────────────────────────────────────
// PUT /tenants/:id
// ──────────────────────────────────────────────

Deno.test('Tenants - admin can update tenant name', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Old Name');

  const res = await request(`/tenants/${tenantId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'New Name' }),
  });

  const data = await res.json();

  assertEquals(res.status, 200);
  assertEquals(data.data.name, 'New Name');
});

Deno.test('Tenants - admin can set is_active to 0', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Deactivate Me');

  const res = await request(`/tenants/${tenantId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ is_active: 0 }),
  });

  const data = await res.json();

  assertEquals(res.status, 200);
  assertEquals(data.data.is_active, 0);
});

// ──────────────────────────────────────────────
// DELETE /tenants/:id
// ──────────────────────────────────────────────

Deno.test('Tenants - deletes tenant with no projects (hard delete)', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Delete Me');

  const res = await request(`/tenants/${tenantId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();

  assertEquals(res.status, 200);
  assertEquals(data.message, 'Tenant deleted successfully');

  // Verify it is gone
  const db = getDb();
  const rows = db.queryEntries('SELECT * FROM tenants WHERE id = ?', [tenantId]);
  assertEquals(rows.length, 0);
});

Deno.test('Tenants - rejects deleting tenant with projects', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Has Projects');
  createProject('Test Project', tenantId);

  const res = await request(`/tenants/${tenantId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();

  assertEquals(res.status, 400);
  assertEquals(data.error.includes('Cannot delete tenant with'), true);
});

Deno.test('Tenants - rejects deleting distributor tenant (403)', async () => {
  clearDatabase();
  const token = await adminToken();

  // Distributor tenant is seeded as id=1
  const res = await request('/tenants/1', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await res.json();

  assertEquals(res.status, 403);
  assertEquals(data.error, 'Cannot delete a distributor tenant');
});

Deno.test('Tenants - deleting tenant also deletes its users', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Tenant With Users');

  // Create users in that tenant
  createUser('alice@partner.com', tenantId);
  createUser('bob@partner.com', tenantId);

  // Verify users exist
  const db = getDb();
  let users = db.queryEntries('SELECT * FROM users WHERE tenant_id = ?', [tenantId]);
  assertEquals(users.length, 2);

  // Delete the tenant
  const res = await request(`/tenants/${tenantId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  assertEquals(res.status, 200);

  // Verify users are gone
  users = db.queryEntries('SELECT * FROM users WHERE tenant_id = ?', [tenantId]);
  assertEquals(users.length, 0);
});

// ──────────────────────────────────────────────
// Authorization: tenant_admin gets 403
// ──────────────────────────────────────────────

Deno.test('Tenants - tenant_admin role gets 403 on all routes', async () => {
  clearDatabase();
  const token = await tenantAdminToken();

  const getAll = await request('/tenants', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getAll.status, 403);

  const getOne = await request('/tenants/1', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getOne.status, 403);

  const post = await request('/tenants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Nope' }),
  });
  assertEquals(post.status, 403);

  const put = await request('/tenants/1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Nope' }),
  });
  assertEquals(put.status, 403);

  const del = await request('/tenants/1', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(del.status, 403);
});

// ──────────────────────────────────────────────
// Authorization: user role gets 403
// ──────────────────────────────────────────────

Deno.test('Tenants - user role gets 403 on all routes', async () => {
  clearDatabase();
  const token = await userToken();

  const getAll = await request('/tenants', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getAll.status, 403);

  const getOne = await request('/tenants/1', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getOne.status, 403);

  const post = await request('/tenants', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Nope' }),
  });
  assertEquals(post.status, 403);

  const put = await request('/tenants/1', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'Nope' }),
  });
  assertEquals(put.status, 403);

  const del = await request('/tenants/1', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(del.status, 403);
});

// ──────────────────────────────────────────────
// PUT /tenants/:id — is_distributor flag
// ──────────────────────────────────────────────

Deno.test('Tenants - admin can change is_distributor flag', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Promote Me');

  // Verify it starts as a non-distributor
  const before = await request(`/tenants/${tenantId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const beforeData = await before.json();
  assertEquals(beforeData.data.is_distributor, 0);

  // Set is_distributor to 1
  const res = await request(`/tenants/${tenantId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ is_distributor: 1 }),
  });

  const data = await res.json();

  assertEquals(res.status, 200);
  assertEquals(data.data.is_distributor, 1);
});

// ──────────────────────────────────────────────
// PUT /tenants/:id — is_active flag
// ──────────────────────────────────────────────

Deno.test('Tenants - admin can change is_active flag from 1 to 0 and back', async () => {
  clearDatabase();
  const token = await adminToken();
  const tenantId = createPartnerTenant('Toggle Active');

  // Starts active (is_active = 1)
  const before = await request(`/tenants/${tenantId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const beforeData = await before.json();
  assertEquals(beforeData.data.is_active, 1);

  // Deactivate
  const deactivateRes = await request(`/tenants/${tenantId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ is_active: 0 }),
  });
  const deactivateData = await deactivateRes.json();

  assertEquals(deactivateRes.status, 200);
  assertEquals(deactivateData.data.is_active, 0);

  // Re-activate
  const reactivateRes = await request(`/tenants/${tenantId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ is_active: 1 }),
  });
  const reactivateData = await reactivateRes.json();

  assertEquals(reactivateRes.status, 200);
  assertEquals(reactivateData.data.is_active, 1);
});

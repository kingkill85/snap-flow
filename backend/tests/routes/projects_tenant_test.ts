import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { getDb } from '../../src/config/database.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

/** Helper: create a partner tenant via direct SQL and return its id */
function createTenant(name: string, isActive = 1): number {
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

/** Helper: create a user with a known password via direct SQL */
function createUser(
  email: string,
  password: string,
  tenantId: number,
  role = 'user',
): number {
  const db = getDb();
  const hash = hashPassword(password);
  db.query(
    'INSERT INTO users (email, password_hash, role, tenant_id) VALUES (?, ?, ?, ?)',
    [email, hash, role, tenantId],
  );
  const rows = db.queryEntries<{ id: number }>(
    'SELECT id FROM users WHERE email = ?',
    [email],
  );
  return rows[0].id;
}

/** Helper: login and return the access token */
async function login(email: string, password: string): Promise<string> {
  const res = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await parseJSON(res);
  return data.data.accessToken;
}

// ──────────────────────────────────────────────
// Admin can change project tenant_id via PUT
// ──────────────────────────────────────────────

Deno.test('Projects tenant - admin can change project tenant_id via PUT', async () => {
  clearDatabase();
  const tenantA = createTenant('Tenant A');
  const tenantB = createTenant('Tenant B');

  // Create admin in distributor tenant (id=1)
  createUser('admin@example.com', 'password123', 1, 'admin');
  const adminToken = await login('admin@example.com', 'password123');

  // Create a project in tenant A
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
     
      customer_name: 'Customer X',
    }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Admin updates tenant_id of the project
  // First update to tenantA so it has a known tenant
  await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ tenant_id: tenantA }),
  });

  // Now move from tenantA to tenantB
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ tenant_id: tenantB }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 200);
  assertEquals(data.data.tenant_id, tenantB);
});

// ──────────────────────────────────────────────
// Tenant admin cannot change project tenant_id
// ──────────────────────────────────────────────

Deno.test('Projects tenant - tenant admin cannot change project tenant_id (ignored)', async () => {
  clearDatabase();
  const tenantId = createTenant('TA Tenant');
  const otherTenant = createTenant('Other Tenant');

  // Create tenant_admin
  createUser('ta@example.com', 'password123', tenantId, 'tenant_admin');
  const taToken = await login('ta@example.com', 'password123');

  // Create a project as tenant_admin
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${taToken}`,
    },
    body: JSON.stringify({
     
      customer_name: 'Customer Y',
    }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Attempt to change tenant_id — should be ignored
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${taToken}`,
    },
    body: JSON.stringify({ tenant_id: otherTenant, version_name: 'Renamed Version' }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 200);
  // tenant_id should remain the original
  assertEquals(data.data.tenant_id, tenantId);
  // version_name should still be updated
  assertEquals(data.data.version_name, 'Renamed Version');
});

// ──────────────────────────────────────────────
// New project gets caller's tenant_id
// ──────────────────────────────────────────────

Deno.test('Projects tenant - new project gets caller tenant_id', async () => {
  clearDatabase();
  const tenantId = createTenant('Project Tenant');
  createUser('creator@example.com', 'password123', tenantId, 'user');
  const userToken = await login('creator@example.com', 'password123');

  const res = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({
     
      customer_name: 'My Customer',
    }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 201);
  assertEquals(data.data.tenant_id, tenantId);
  assertExists(data.data.id);
});

// ──────────────────────────────────────────────
// Tenant user only sees own tenant's projects
// ──────────────────────────────────────────────

Deno.test('Projects tenant - tenant user only sees own tenant projects', async () => {
  clearDatabase();
  const tenantA = createTenant('Tenant A');
  const tenantB = createTenant('Tenant B');

  // Create users in each tenant
  createUser('userA@example.com', 'password123', tenantA, 'user');
  createUser('userB@example.com', 'password123', tenantB, 'user');

  const tokenA = await login('userA@example.com', 'password123');
  const tokenB = await login('userB@example.com', 'password123');

  // Create projects in each tenant
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`,
    },
    body: JSON.stringify({ customer_name: 'Cust A1' }),
  });
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`,
    },
    body: JSON.stringify({ customer_name: 'Cust A2' }),
  });
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`,
    },
    body: JSON.stringify({ customer_name: 'Cust B1' }),
  });

  // User A should only see their 2 projects
  const resA = await testRequest('/api/projects', {
    headers: { 'Authorization': `Bearer ${tokenA}` },
  });
  const dataA = await parseJSON(resA);
  assertEquals(resA.status, 200);
  assertEquals(dataA.data.length, 2);
  for (const project of dataA.data) {
    assertEquals(project.tenant_id, tenantA);
  }

  // User B should only see their 1 project
  const resB = await testRequest('/api/projects', {
    headers: { 'Authorization': `Bearer ${tokenB}` },
  });
  const dataB = await parseJSON(resB);
  assertEquals(resB.status, 200);
  assertEquals(dataB.data.length, 1);
  assertEquals(dataB.data[0].tenant_id, tenantB);
});

// ──────────────────────────────────────────────
// Admin sees all projects
// ──────────────────────────────────────────────

Deno.test('Projects tenant - admin sees all projects across tenants', async () => {
  clearDatabase();
  const tenantA = createTenant('Tenant A');
  const tenantB = createTenant('Tenant B');

  // Create users
  createUser('userA@example.com', 'password123', tenantA, 'user');
  createUser('userB@example.com', 'password123', tenantB, 'user');
  createUser('admin@example.com', 'password123', 1, 'admin');

  const tokenA = await login('userA@example.com', 'password123');
  const tokenB = await login('userB@example.com', 'password123');
  const adminToken = await login('admin@example.com', 'password123');

  // Create projects in different tenants
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenA}`,
    },
    body: JSON.stringify({ customer_name: 'Cust A' }),
  });
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokenB}`,
    },
    body: JSON.stringify({ customer_name: 'Cust B' }),
  });

  // Admin should see all projects
  const res = await testRequest('/api/projects', {
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });
  const data = await parseJSON(res);

  assertEquals(res.status, 200);
  assertEquals(data.data.length >= 2, true);

  // Verify projects from both tenants are present
  const tenantIds = data.data.map((p: { tenant_id: number }) => p.tenant_id);
  assertEquals(tenantIds.includes(tenantA), true);
  assertEquals(tenantIds.includes(tenantB), true);
});

// ──────────────────────────────────────────────
// User cannot delete projects (403)
// ──────────────────────────────────────────────

Deno.test('Projects tenant - user cannot delete projects (403)', async () => {
  clearDatabase();
  const tenantId = createTenant('Delete Tenant');
  createUser('user@example.com', 'password123', tenantId, 'user');
  const userToken = await login('user@example.com', 'password123');

  // Create a project
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ customer_name: 'Cust' }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Attempt to delete — should be forbidden (user role, not admin/tenant_admin)
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${userToken}` },
  });

  assertEquals(res.status, 403);
});

// ──────────────────────────────────────────────
// Tenant admin cannot delete the only version in a group (400)
// ──────────────────────────────────────────────

Deno.test('Projects tenant - tenant admin cannot delete only version (400)', async () => {
  clearDatabase();
  const tenantId = createTenant('TA Delete Tenant');
  createUser('ta@example.com', 'password123', tenantId, 'tenant_admin');
  const taToken = await login('ta@example.com', 'password123');

  // Create a project
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${taToken}`,
    },
    body: JSON.stringify({ customer_name: 'Cust' }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Delete — should fail (only version in group)
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${taToken}` },
  });

  assertEquals(res.status, 400);
  const data = await parseJSON(res);
  assertEquals(data.error.includes('only version'), true);
});

// ──────────────────────────────────────────────
// Admin cannot delete the only version in a group (400)
// ──────────────────────────────────────────────

Deno.test('Projects tenant - admin cannot delete only version (400)', async () => {
  clearDatabase();
  createUser('admin@example.com', 'password123', 1, 'admin');
  const adminToken = await login('admin@example.com', 'password123');

  // Create a project
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ customer_name: 'Cust' }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Delete — should fail (only version in group)
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });

  assertEquals(res.status, 400);
  const data = await parseJSON(res);
  assertEquals(data.error.includes('only version'), true);
});

// ──────────────────────────────────────────────
// User cannot edit projects (403)
// ──────────────────────────────────────────────

Deno.test('Projects tenant - user cannot edit projects (403)', async () => {
  clearDatabase();
  const tenantId = createTenant('Status Tenant');
  createUser('user@example.com', 'password123', tenantId, 'user');
  const userToken = await login('user@example.com', 'password123');

  // Create a project
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ customer_name: 'Cust' }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Attempt to edit — should be forbidden (user role)
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ version_name: 'Renamed' }),
  });

  assertEquals(res.status, 200);
  const data = await parseJSON(res);
  assertEquals(data.data.version_name, 'Renamed');
});

// ──────────────────────────────────────────────
// User can edit projects
// ──────────────────────────────────────────────

Deno.test('Projects tenant - user can edit projects', async () => {
  clearDatabase();
  const tenantId = createTenant('Active Tenant');
  createUser('user@example.com', 'password123', tenantId, 'user');
  const userToken = await login('user@example.com', 'password123');

  // Create a project
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ customer_name: 'Cust' }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Edit — should succeed
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({ version_name: 'Renamed Active' }),
  });

  const data = await parseJSON(res);
  assertEquals(res.status, 200);
  assertEquals(data.data.version_name, 'Renamed Active');
});

// ──────────────────────────────────────────────
// Tenant admin can edit projects
// ──────────────────────────────────────────────

Deno.test('Projects tenant - tenant admin can edit projects', async () => {
  clearDatabase();
  const tenantId = createTenant('TA Status Tenant');
  createUser('ta@example.com', 'password123', tenantId, 'tenant_admin');
  const taToken = await login('ta@example.com', 'password123');

  // Create a project
  const createRes = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${taToken}`,
    },
    body: JSON.stringify({ customer_name: 'Cust' }),
  });
  const createData = await parseJSON(createRes);
  assertEquals(createRes.status, 201);
  const projectId = createData.data.id;

  // Tenant admin edits project — should succeed
  const res = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${taToken}`,
    },
    body: JSON.stringify({ version_name: 'TA Renamed Completed' }),
  });

  const data = await parseJSON(res);
  assertEquals(res.status, 200);
  assertEquals(data.data.version_name, 'TA Renamed Completed');
});

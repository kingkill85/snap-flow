import { assertEquals } from '@std/assert';
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
// Deactivating users
// ──────────────────────────────────────────────

Deno.test('Users tenant - cannot deactivate admin users (403)', async () => {
  clearDatabase();
  // Create an admin user who will be the caller
  createUser('caller-admin@example.com', 'password123', 1, 'admin');
  const callerToken = await login('caller-admin@example.com', 'password123');

  // Create another admin user to attempt deactivation on
  const targetId = createUser('target-admin@example.com', 'password123', 1, 'admin');

  const res = await testRequest(`/api/users/${targetId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${callerToken}`,
    },
    body: JSON.stringify({ is_active: 0 }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 403);
  assertEquals(data.error, 'Cannot deactivate admin users');
});

Deno.test('Users tenant - can deactivate tenant_admin users (200)', async () => {
  clearDatabase();
  // Create admin caller
  createUser('admin@example.com', 'password123', 1, 'admin');
  const adminToken = await login('admin@example.com', 'password123');

  // Create a tenant_admin user in a partner tenant
  const tenantId = createTenant('Partner Corp');
  const tenantAdminId = createUser('ta@example.com', 'password123', tenantId, 'tenant_admin');

  const res = await testRequest(`/api/users/${tenantAdminId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ is_active: 0 }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 200);
  assertEquals(data.data.is_active, 0);
});

// ──────────────────────────────────────────────
// Changing user tenant_id
// ──────────────────────────────────────────────

Deno.test('Users tenant - admin can change user tenant_id', async () => {
  clearDatabase();
  // Create admin
  createUser('admin@example.com', 'password123', 1, 'admin');
  const adminToken = await login('admin@example.com', 'password123');

  // Create two tenants and a user in the first
  const tenantA = createTenant('Tenant A');
  const tenantB = createTenant('Tenant B');
  const userId = createUser('moveme@example.com', 'password123', tenantA, 'user');

  const res = await testRequest(`/api/users/${userId}`, {
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

Deno.test('Users tenant - tenant admin cannot change user tenant_id (ignored)', async () => {
  clearDatabase();
  // Create a partner tenant with a tenant_admin
  const tenantId = createTenant('My Tenant');
  createUser('ta@example.com', 'password123', tenantId, 'tenant_admin');
  const taToken = await login('ta@example.com', 'password123');

  // Create a regular user in the same tenant
  const userId = createUser('regular@example.com', 'password123', tenantId, 'user');

  // Create another tenant to try moving to
  const otherTenant = createTenant('Other Tenant');

  // Attempt to change tenant_id — should be ignored by backend
  const res = await testRequest(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${taToken}`,
    },
    body: JSON.stringify({ tenant_id: otherTenant, full_name: 'Updated Name' }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 200);
  // tenant_id should remain the original tenant
  assertEquals(data.data.tenant_id, tenantId);
  // But other fields should still update
  assertEquals(data.data.full_name, 'Updated Name');
});

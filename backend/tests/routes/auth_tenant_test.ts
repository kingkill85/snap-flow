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

// ──────────────────────────────────────────────
// Login with tenant checks
// ──────────────────────────────────────────────

Deno.test('Auth tenant - login succeeds for user in active tenant', async () => {
  clearDatabase();
  const tenantId = createTenant('Active Corp');
  createUser('active@example.com', 'password123', tenantId);

  const res = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'active@example.com',
      password: 'password123',
    }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 200);
  assertExists(data.data.accessToken);
  assertExists(data.data.refreshToken);
  assertEquals(data.data.user.email, 'active@example.com');
});

Deno.test('Auth tenant - login blocked for user in inactive tenant (403)', async () => {
  clearDatabase();
  const tenantId = createTenant('Inactive Corp', 0);
  createUser('blocked@example.com', 'password123', tenantId);

  const res = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'blocked@example.com',
      password: 'password123',
    }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 403);
  assertEquals(data.error, 'Account disabled - contact your administrator');
});

Deno.test('Auth tenant - token refresh blocked for user in inactive tenant (403)', async () => {
  clearDatabase();
  // Start with active tenant so we can log in and get a refresh token
  const tenantId = createTenant('Soon Inactive', 1);
  createUser('refresh@example.com', 'password123', tenantId);

  // Login while tenant is still active
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'refresh@example.com',
      password: 'password123',
    }),
  });

  const loginData = await parseJSON(loginRes);
  assertEquals(loginRes.status, 200);
  const refreshToken = loginData.data.refreshToken;

  // Now deactivate the tenant
  const db = getDb();
  db.query('UPDATE tenants SET is_active = 0 WHERE id = ?', [tenantId]);

  // Attempt to refresh — should be blocked
  const refreshRes = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const refreshData = await parseJSON(refreshRes);

  assertEquals(refreshRes.status, 403);
  assertEquals(refreshData.error, 'Account disabled - contact your administrator');
});

Deno.test('Auth tenant - login response includes tenantId and tenantName', async () => {
  clearDatabase();
  const tenantId = createTenant('Acme Homes');
  createUser('acme@example.com', 'password123', tenantId);

  const res = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'acme@example.com',
      password: 'password123',
    }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 200);
  assertEquals(data.data.user.tenantId, tenantId);
  assertEquals(data.data.user.tenantName, 'Acme Homes');
});

Deno.test('Auth tenant - /auth/me response includes tenantId and tenantName', async () => {
  clearDatabase();
  const tenantId = createTenant('Me Tenant');
  createUser('metest@example.com', 'password123', tenantId);

  // Login first to get access token
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'metest@example.com',
      password: 'password123',
    }),
  });

  const loginData = await parseJSON(loginRes);
  assertEquals(loginRes.status, 200);
  const accessToken = loginData.data.accessToken;

  // Call /auth/me
  const meRes = await testRequest('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  const meData = await parseJSON(meRes);

  assertEquals(meRes.status, 200);
  assertEquals(meData.data.tenantId, tenantId);
  assertEquals(meData.data.tenantName, 'Me Tenant');
  assertExists(meData.data.tenant_id);
});

// ──────────────────────────────────────────────
// Login blocked for inactive user (is_active = 0)
// ──────────────────────────────────────────────

Deno.test('Auth tenant - login blocked for inactive user (403)', async () => {
  clearDatabase();
  const tenantId = createTenant('Active Tenant');
  const userId = createUser('deactivated@example.com', 'password123', tenantId);

  // Deactivate user directly via SQL
  const db = getDb();
  db.query('UPDATE users SET is_active = 0 WHERE id = ?', [userId]);

  const res = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'deactivated@example.com',
      password: 'password123',
    }),
  });

  const data = await parseJSON(res);

  assertEquals(res.status, 403);
  assertEquals(data.error, 'Account disabled - contact your administrator');
});

// ──────────────────────────────────────────────
// Token refresh blocked for inactive user
// ──────────────────────────────────────────────

Deno.test('Auth tenant - token refresh blocked for inactive user (403)', async () => {
  clearDatabase();
  const tenantId = createTenant('Refresh Tenant');
  createUser('soon-inactive@example.com', 'password123', tenantId);

  // Login while user is active
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'soon-inactive@example.com',
      password: 'password123',
    }),
  });

  const loginData = await parseJSON(loginRes);
  assertEquals(loginRes.status, 200);
  const refreshToken = loginData.data.refreshToken;

  // Deactivate user via SQL
  const db = getDb();
  db.query("UPDATE users SET is_active = 0 WHERE email = 'soon-inactive@example.com'");

  // Attempt to refresh — should be blocked
  const refreshRes = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  const refreshData = await parseJSON(refreshRes);

  assertEquals(refreshRes.status, 403);
  assertEquals(refreshData.error, 'Account disabled - contact your administrator');
});

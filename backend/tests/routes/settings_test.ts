import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';
import { generateToken } from '../../src/services/jwt.ts';

await setupTestDatabase();

const { userRepository } = await import('../../src/repositories/user.ts');
const { settingsRepository } = await import('../../src/repositories/settings.ts');

// ---------------------------------------------------------------------------
// Helper: create a test user and return a valid access token
// ---------------------------------------------------------------------------
async function createUserAndToken(
  email: string,
  role: 'admin' | 'user' = 'user',
): Promise<{ token: string; userId: number }> {
  const user = await userRepository.create({
    email,
    password_hash: hashPassword('password123'),
    role,
  });
  const token = await generateToken(user.id, email, role);
  return { token, userId: user.id };
}

Deno.test('Settings routes - GET /api/settings/last-sync-timestamp returns 401 without auth', async () => {
  clearDatabase();

  const res = await testRequest('/api/settings/last-sync-timestamp');
  assertEquals(res.status, 401);
});

Deno.test('Settings routes - GET /api/settings/last-sync-timestamp returns 0 when never synced', async () => {
  clearDatabase();

  const { token } = await createUserAndToken('settings-notsync@example.com');

  const res = await testRequest('/api/settings/last-sync-timestamp', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);

  const body = await parseJSON<{ success: boolean; data: { timestamp: number } }>(res);
  assertEquals(body.success, true);
  assertExists(body.data);
  assertEquals(body.data.timestamp, 0);
});

Deno.test('Settings routes - GET /api/settings/last-sync-timestamp returns set timestamp', async () => {
  clearDatabase();

  const { token } = await createUserAndToken('settings-synced@example.com');

  // Set a known timestamp via repository
  const knownTimestamp = 1700000000;
  await settingsRepository.setLastSyncTimestamp(knownTimestamp);

  const res = await testRequest('/api/settings/last-sync-timestamp', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);

  const body = await parseJSON<{ success: boolean; data: { timestamp: number } }>(res);
  assertEquals(body.success, true);
  assertEquals(body.data.timestamp, knownTimestamp);
});

Deno.test('Settings routes - GET /api/settings/last-sync-timestamp works for admin users', async () => {
  clearDatabase();

  const { token } = await createUserAndToken('settings-admin@example.com', 'admin');

  const res = await testRequest('/api/settings/last-sync-timestamp', {
    headers: { Authorization: `Bearer ${token}` },
  });

  assertEquals(res.status, 200);

  const body = await parseJSON<{ success: boolean; data: { timestamp: number } }>(res);
  assertEquals(body.success, true);
  assertExists(body.data);
});

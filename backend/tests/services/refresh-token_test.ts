import { assertEquals, assertExists, assertNotEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import {
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  cleanupExpiredTokens,
} from '../../src/services/refresh-token.ts';
import { getDb } from '../../src/config/database.ts';
import { hashPassword } from '../../src/services/password.ts';

await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');

/**
 * Helper: create a real user in the DB and return its id.
 * Required because refresh_tokens has a foreign key on users.
 */
async function createTestUser(email: string): Promise<number> {
  const user = await userRepository.create({
    email,
    password_hash: hashPassword('testpass'),
    role: 'user',
    tenant_id: 1,
  });
  return user.id;
}

Deno.test('Refresh token service - createRefreshToken returns a non-empty string', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-create@example.com');
  const token = await createRefreshToken(userId);

  assertExists(token);
  assertEquals(typeof token, 'string');
  assertEquals(token.length > 0, true);
});

Deno.test('Refresh token service - createRefreshToken generates unique tokens', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-unique@example.com');
  const token1 = await createRefreshToken(userId);
  const token2 = await createRefreshToken(userId);

  assertNotEquals(token1, token2);
});

Deno.test('Refresh token service - verifyRefreshToken returns userId for valid token', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-verify@example.com');
  const token = await createRefreshToken(userId);
  const result = await verifyRefreshToken(token);

  assertEquals(result, userId);
});

Deno.test('Refresh token service - verifyRefreshToken returns null for invalid token', async () => {
  clearDatabase();

  const result = await verifyRefreshToken('completelyfaketoken');

  assertEquals(result, null);
});

Deno.test('Refresh token service - verifyRefreshToken returns null for unknown token', async () => {
  clearDatabase();

  // Create a real-looking token (base64 random bytes) that was never stored
  const fakeBytes = new Uint8Array(32);
  crypto.getRandomValues(fakeBytes);
  const fakeToken = btoa(String.fromCharCode(...fakeBytes));

  const result = await verifyRefreshToken(fakeToken);
  assertEquals(result, null);
});

Deno.test('Refresh token service - revokeRefreshToken makes token fail verification', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-revoke@example.com');
  const token = await createRefreshToken(userId);

  // Confirm it's valid first
  const beforeRevoke = await verifyRefreshToken(token);
  assertEquals(beforeRevoke, userId);

  // Revoke it
  await revokeRefreshToken(token);

  // Should now return null
  const afterRevoke = await verifyRefreshToken(token);
  assertEquals(afterRevoke, null);
});

Deno.test('Refresh token service - revokeRefreshToken returns true', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-revoke-bool@example.com');
  const token = await createRefreshToken(userId);
  const result = await revokeRefreshToken(token);

  assertEquals(result, true);
});

Deno.test('Refresh token service - revokeAllUserTokens revokes all tokens for a user', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-revoke-all@example.com');
  const otherId = await createTestUser('rt-other@example.com');

  const token1 = await createRefreshToken(userId);
  const token2 = await createRefreshToken(userId);
  // Also create a token for a different user
  const otherToken = await createRefreshToken(otherId);

  // Revoke all for userId
  await revokeAllUserTokens(userId);

  // Both tokens for userId should now be invalid
  assertEquals(await verifyRefreshToken(token1), null);
  assertEquals(await verifyRefreshToken(token2), null);

  // The other user's token should still be valid
  assertEquals(await verifyRefreshToken(otherToken), otherId);
});

Deno.test('Refresh token service - cleanupExpiredTokens removes expired tokens', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-cleanup-exp@example.com');

  // Insert a token that is already expired directly into the database
  const db = getDb();
  const encoder = new TextEncoder();
  const data = encoder.encode('expiredtoken');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  // Use SQLite datetime format (no T, no Z) so that comparison with datetime('now') works
  const expiredAt = new Date(Date.now() - 1000); // 1 second in the past
  const sqliteExpiredAt = expiredAt.toISOString().replace('T', ' ').replace('Z', '');
  db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, sqliteExpiredAt],
  );

  // Verify it was inserted
  const beforeCleanup = db.query<[number]>(
    `SELECT COUNT(*) FROM refresh_tokens WHERE token_hash = ?`,
    [tokenHash],
  );
  assertEquals(beforeCleanup[0][0], 1);

  // Run cleanup
  cleanupExpiredTokens();

  // Expired token should be removed
  const afterCleanup = db.query<[number]>(
    `SELECT COUNT(*) FROM refresh_tokens WHERE token_hash = ?`,
    [tokenHash],
  );
  assertEquals(afterCleanup[0][0], 0);
});

Deno.test('Refresh token service - cleanupExpiredTokens preserves valid tokens', async () => {
  clearDatabase();

  const userId = await createTestUser('rt-cleanup-valid@example.com');
  await createRefreshToken(userId);

  // Count valid tokens before cleanup
  const db = getDb();
  const beforeCount = db.query<[number]>(`SELECT COUNT(*) FROM refresh_tokens`);

  cleanupExpiredTokens();

  // Count after cleanup — valid token should still be there
  const afterCount = db.query<[number]>(`SELECT COUNT(*) FROM refresh_tokens`);
  assertEquals(afterCount[0][0], beforeCount[0][0]);
});

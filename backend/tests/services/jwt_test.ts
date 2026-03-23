import { assertEquals, assertExists, assertRejects } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { generateToken, verifyToken } from '../../src/services/jwt.ts';

await setupTestDatabase();

Deno.test('JWT service - generateToken returns a non-empty string', async () => {
  clearDatabase();

  const token = await generateToken(1, 'test@example.com', 'user');

  assertExists(token);
  assertEquals(typeof token, 'string');
  assertEquals(token.length > 0, true);
  // JWT format: three base64url segments separated by dots
  const parts = token.split('.');
  assertEquals(parts.length, 3);
});

Deno.test('JWT service - verifyToken returns correct payload', async () => {
  clearDatabase();

  const userId = 42;
  const email = 'payload@example.com';
  const role = 'admin' as const;

  const token = await generateToken(userId, email, role);
  const payload = await verifyToken(token);

  assertEquals(payload.sub, userId.toString());
  assertEquals(payload.email, email);
  assertEquals(payload.role, role);
  assertExists(payload.iat);
  assertExists(payload.exp);
  // exp should be greater than iat (access token has a positive duration)
  assertEquals(payload.exp > payload.iat, true);
});

Deno.test('JWT service - verifyToken works for user role', async () => {
  clearDatabase();

  const token = await generateToken(7, 'user@example.com', 'user');
  const payload = await verifyToken(token);

  assertEquals(payload.sub, '7');
  assertEquals(payload.role, 'user');
});

Deno.test('JWT service - verifyToken rejects an invalid token', async () => {
  clearDatabase();

  await assertRejects(
    async () => {
      await verifyToken('this.is.notavalidtoken');
    },
  );
});

Deno.test('JWT service - verifyToken rejects a token with tampered payload', async () => {
  clearDatabase();

  const token = await generateToken(1, 'tamper@example.com', 'user');
  // Replace the payload segment with a different base64 string
  const parts = token.split('.');
  const fakePayload = btoa(JSON.stringify({ sub: '999', email: 'hacker@evil.com', role: 'admin' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const tamperedToken = `${parts[0]}.${fakePayload}.${parts[2]}`;

  await assertRejects(
    async () => {
      await verifyToken(tamperedToken);
    },
  );
});

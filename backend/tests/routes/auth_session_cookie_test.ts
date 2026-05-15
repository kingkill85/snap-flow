import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { hashPassword } from '../../src/services/password.ts';
import app from '../../src/main.ts';
import { verifySessionCookie } from '../../src/services/oauth/session-cookie.ts';

Deno.test('POST /api/auth/login sets oauth_session cookie', async () => {
  await setupTestDatabase();
  await clearDatabase();

  const tenant = await tenantRepository.create({ name: 'T' } as any);
  await userRepository.create({
    email: 'user@test.com', password_hash: hashPassword('password123'),
    role: 'user', full_name: 'U', tenant_id: tenant.id,
  } as any);

  const res = await app.fetch(new Request('http://x/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'user@test.com', password: 'password123' }),
  }));
  assertEquals(res.status, 200);

  const setCookie = res.headers.get('set-cookie') ?? '';
  assert(setCookie.includes('oauth_session='), `expected oauth_session cookie, got: ${setCookie}`);
  assert(setCookie.includes('HttpOnly'), 'cookie must be HttpOnly');
  assert(setCookie.includes('SameSite=Lax'), 'cookie must be SameSite=Lax');

  const cookieValue = setCookie.split('oauth_session=')[1]?.split(';')[0] ?? '';
  const userId = await verifySessionCookie(cookieValue);
  assert(userId !== null && userId > 0);
});

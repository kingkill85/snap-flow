import { assertEquals, assert } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthConsentRoutes } from '../../src/routes/oauth-consent.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';
import { signSessionCookie } from '../../src/services/oauth/session-cookie.ts';
import type { CreateTenantDTO, CreateUserDTO } from '../../src/models/index.ts';

function buildApp(): Hono {
  const app = new Hono();
  app.route('/oauth', oauthConsentRoutes);
  return app;
}

async function seed() {
  const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
  const user = await userRepository.create({
    email: 'consent@example.com', password_hash: 'x', role: 'user',
    full_name: 'C', tenant_id: tenant.id,
  } as CreateUserDTO & { password_hash: string });
  const client = await oauthClientRepository.create({
    redirect_uris: ['https://c/cb'], client_name: 'Claude',
  });
  const cookie = await signSessionCookie(user.id);
  return { user, client, cookie };
}

Deno.test('OAuth consent', async (t) => {
  await setupTestDatabase();

  await t.step('GET /oauth/consent renders HTML with allow/deny form', async () => {
    await clearDatabase();
    const { client, cookie } = await seed();
    const app = buildApp();
    const url = `https://x/oauth/consent?client_id=${client.id}&redirect_uri=${encodeURIComponent('https://c/cb')}&code_challenge=abc&state=xyz&scope=read`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: `oauth_session=${cookie}` } }));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('content-type')?.startsWith('text/html'), true);
    const body = await res.text();
    assert(body.includes('Claude'), 'must show client name');
    assert(body.includes('Allow'), 'must have Allow button');
    assert(body.includes('Deny'), 'must have Deny button');
  });

  await t.step('GET /oauth/consent redirects to login when no cookie', async () => {
    await clearDatabase();
    const { client } = await seed();
    const app = buildApp();
    const url = `https://x/oauth/consent?client_id=${client.id}&redirect_uri=https://c/cb&code_challenge=abc&state=xyz`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 302);
    assert((res.headers.get('location') ?? '').includes('/login'));
  });

  await t.step('POST /oauth/consent (Allow) issues code and redirects to client', async () => {
    await clearDatabase();
    const { client, cookie } = await seed();
    const app = buildApp();
    const body = new URLSearchParams({
      action: 'allow',
      client_id: client.id,
      redirect_uri: 'https://c/cb',
      code_challenge: 'abc',
      state: 'xyz',
      scope: 'read',
    });
    const res = await app.fetch(new Request('https://x/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', Cookie: `oauth_session=${cookie}` },
      body: body.toString(),
    }));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.startsWith('https://c/cb?'), `expected redirect to client, got: ${location}`);
    const cb = new URL(location);
    assert((cb.searchParams.get('code') ?? '').length > 0);
    assertEquals(cb.searchParams.get('state'), 'xyz');
  });

  await t.step('POST /oauth/consent (Deny) redirects to client with error', async () => {
    await clearDatabase();
    const { client, cookie } = await seed();
    const app = buildApp();
    const body = new URLSearchParams({
      action: 'deny',
      client_id: client.id,
      redirect_uri: 'https://c/cb',
      code_challenge: 'abc',
      state: 'xyz',
    });
    const res = await app.fetch(new Request('https://x/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', Cookie: `oauth_session=${cookie}` },
      body: body.toString(),
    }));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.startsWith('https://c/cb?'));
    const cb = new URL(location);
    assertEquals(cb.searchParams.get('error'), 'access_denied');
  });
});

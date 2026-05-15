import { assertEquals, assert } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthRoutes } from '../../src/routes/oauth.ts';
import { signSessionCookie } from '../../src/services/oauth/session-cookie.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';

function buildApp(): Hono {
  const app = new Hono();
  app.route('/oauth', oauthRoutes);
  return app;
}

Deno.test('POST /oauth/register', async (t) => {
  await setupTestDatabase();

  await t.step('returns 201 with client_id when given valid body', async () => {
    await clearDatabase();
    const app = buildApp();
    const res = await app.fetch(new Request('https://x/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        client_name: 'Claude',
      }),
    }));
    assertEquals(res.status, 201);
    const body = await res.json();
    assert(typeof body.client_id === 'string' && body.client_id.length > 0);
    assertEquals(body.redirect_uris, ['https://claude.ai/api/mcp/auth_callback']);
    assertEquals(body.client_name, 'Claude');
    assertEquals(body.token_endpoint_auth_method, 'none');
  });

  await t.step('rejects missing redirect_uris', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://x/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'X' }),
    }));
    assertEquals(res.status, 400);
  });
});

Deno.test('GET /oauth/authorize', async (t) => {
  await setupTestDatabase();

  await t.step('redirects to login when no session cookie', async () => {
    await clearDatabase();
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=${client.id}&redirect_uri=${encodeURIComponent('https://c/cb')}&code_challenge=abc&code_challenge_method=S256&state=xyz`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.includes('/login'), `expected /login, got: ${location}`);
    assert(location.includes('return_to='), 'must encode return_to');
  });

  await t.step('redirects to /oauth/consent when session cookie valid', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'authtest@example.com', password_hash: 'x', role: 'user',
      full_name: 'A', tenant_id: tenant.id,
    } as any);
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const cookie = await signSessionCookie(user.id);

    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=${client.id}&redirect_uri=${encodeURIComponent('https://c/cb')}&code_challenge=abc&code_challenge_method=S256&state=xyz`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: `oauth_session=${cookie}` } }));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.startsWith('/oauth/consent?'), `expected /oauth/consent, got: ${location}`);
  });

  await t.step('rejects unknown client_id', async () => {
    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=nope&redirect_uri=https://c/cb&code_challenge=abc&code_challenge_method=S256`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 400);
  });

  await t.step('rejects redirect_uri not in client allowlist', async () => {
    await clearDatabase();
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=${client.id}&redirect_uri=${encodeURIComponent('https://evil/cb')}&code_challenge=abc&code_challenge_method=S256`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 400);
  });
});

import { assertEquals, assert } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthRoutes } from '../../src/routes/oauth.ts';
import { signSessionCookie } from '../../src/services/oauth/session-cookie.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';
import { oauthCodeRepository } from '../../src/repositories/oauth-code.ts';
import { verifyToken } from '../../src/services/jwt.ts';

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

Deno.test('POST /oauth/token (authorization_code)', async (t) => {
  await setupTestDatabase();

  await t.step('exchanges valid code + verifier for access + refresh tokens', async () => {
    await clearDatabase();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'tokenuser@example.com', password_hash: 'x', role: 'user',
      full_name: 'Z', tenant_id: tenant.id,
    } as any);
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge, scope: 'read',
    });

    const app = buildApp();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: created.code,
      redirect_uri: 'https://c/cb',
      client_id: client.id,
      code_verifier: verifier,
    });
    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }));
    assertEquals(res.status, 200);
    const tok = await res.json();
    assertEquals(tok.token_type, 'Bearer');
    assert(typeof tok.access_token === 'string' && tok.access_token.length > 0);
    assert(typeof tok.refresh_token === 'string' && tok.refresh_token.length > 0);

    const payload = await verifyToken(tok.access_token);
    assertEquals(payload.sub, String(user.id));
    assertEquals(payload.tenantId, tenant.id);
  });

  await t.step('rejects wrong verifier', async () => {
    await clearDatabase();
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'wrongver@example.com', password_hash: 'x', role: 'user',
      full_name: 'Y', tenant_id: tenant.id,
    } as any);
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge,
    });

    const app = buildApp();
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code: created.code,
      redirect_uri: 'https://c/cb', client_id: client.id,
      code_verifier: 'wrong',
    });
    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }));
    assertEquals(res.status, 400);
    const err = await res.json();
    assertEquals(err.error, 'invalid_grant');
  });

  await t.step('rejects reused code', async () => {
    await clearDatabase();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'reuser@example.com', password_hash: 'x', role: 'user',
      full_name: 'R', tenant_id: tenant.id,
    } as any);
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge,
    });

    const app = buildApp();
    const makeBody = () => new URLSearchParams({
      grant_type: 'authorization_code', code: created.code,
      redirect_uri: 'https://c/cb', client_id: client.id,
      code_verifier: verifier,
    }).toString();

    const first = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: makeBody(),
    }));
    assertEquals(first.status, 200);

    const second = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: makeBody(),
    }));
    assertEquals(second.status, 400);
  });
});

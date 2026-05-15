import { assertEquals, assert, assertNotEquals } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthRoutes } from '../../src/routes/oauth.ts';
import { signSessionCookie } from '../../src/services/oauth/session-cookie.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';
import { oauthCodeRepository } from '../../src/repositories/oauth-code.ts';
import { verifyToken } from '../../src/services/jwt.ts';
import type { CreateTenantDTO, CreateUserDTO } from '../../src/models/index.ts';

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
    assert(typeof body.client_secret === 'string' && body.client_secret.length > 0);
    assertEquals(body.redirect_uris, ['https://claude.ai/api/mcp/auth_callback']);
    assertEquals(body.client_name, 'Claude');
    assertEquals(body.token_endpoint_auth_method, 'client_secret_post');
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
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'authtest@example.com', password_hash: 'x', role: 'user',
      full_name: 'A', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
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

    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'tokenuser@example.com', password_hash: 'x', role: 'user',
      full_name: 'Z', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
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
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'wrongver@example.com', password_hash: 'x', role: 'user',
      full_name: 'Y', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
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
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'reuser@example.com', password_hash: 'x', role: 'user',
      full_name: 'R', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
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

Deno.test('POST /oauth/token (refresh_token)', async (t) => {
  await setupTestDatabase();

  async function obtainTokenPair() {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'refreshuser@example.com', password_hash: 'x', role: 'user',
      full_name: 'Q', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge,
    });
    const app = buildApp();
    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: created.code,
        redirect_uri: 'https://c/cb', client_id: client.id, code_verifier: verifier,
      }).toString(),
    }));
    return { app, tok: await res.json(), user };
  }

  await t.step('exchanges refresh token for new pair', async () => {
    await clearDatabase();
    const { app, tok } = await obtainTokenPair();

    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }).toString(),
    }));
    assertEquals(res.status, 200);
    const next = await res.json();
    assert(typeof next.access_token === 'string');
    assert(typeof next.refresh_token === 'string');
    assertNotEquals(next.refresh_token, tok.refresh_token, 'refresh token must rotate');
  });

  await t.step('old refresh token is invalidated after rotation', async () => {
    await clearDatabase();
    const { app, tok } = await obtainTokenPair();
    const r1 = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }).toString(),
    }));
    assertEquals(r1.status, 200);
    const r2 = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }).toString(),
    }));
    assertEquals(r2.status, 400);
  });
});

Deno.test('POST /oauth/token client_secret', async (t) => {
  await setupTestDatabase();

  await t.step('rejects code grant without client_secret when client has one', async () => {
    await clearDatabase();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'sec1@example.com', password_hash: 'x', role: 'user',
      full_name: 'S', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    // Register via the register route so the client has a secret on file
    const app = buildApp();
    const reg = await app.fetch(new Request('https://x/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://c/cb'], client_name: 'X' }),
    }));
    const { client_id } = await reg.json();
    const created = await oauthCodeRepository.create({
      client_id, user_id: user.id, redirect_uri: 'https://c/cb', code_challenge: challenge,
    });

    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: created.code,
        redirect_uri: 'https://c/cb', client_id, code_verifier: verifier,
        // missing client_secret
      }).toString(),
    }));
    assertEquals(res.status, 401);
    assertEquals((await res.json()).error, 'invalid_client');
  });

  await t.step('accepts code grant with correct client_secret', async () => {
    await clearDatabase();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'sec2@example.com', password_hash: 'x', role: 'user',
      full_name: 'S', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const app = buildApp();
    const reg = await app.fetch(new Request('https://x/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://c/cb'], client_name: 'X' }),
    }));
    const { client_id, client_secret } = await reg.json();
    const created = await oauthCodeRepository.create({
      client_id, user_id: user.id, redirect_uri: 'https://c/cb', code_challenge: challenge,
    });

    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: created.code,
        redirect_uri: 'https://c/cb', client_id, code_verifier: verifier,
        client_secret,
      }).toString(),
    }));
    assertEquals(res.status, 200);
  });

  await t.step('refresh grant requires client_secret', async () => {
    await clearDatabase();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'sec3@example.com', password_hash: 'x', role: 'user',
      full_name: 'S', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const app = buildApp();
    const reg = await app.fetch(new Request('https://x/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://c/cb'], client_name: 'X' }),
    }));
    const { client_id, client_secret } = await reg.json();
    const code = await oauthCodeRepository.create({
      client_id, user_id: user.id, redirect_uri: 'https://c/cb', code_challenge: challenge,
    });
    const t1 = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: code.code,
        redirect_uri: 'https://c/cb', client_id, code_verifier: verifier, client_secret,
      }).toString(),
    }));
    const tok = await t1.json();

    // Refresh without client_secret → 401
    const bad = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id }).toString(),
    }));
    assertEquals(bad.status, 401);

    // Refresh with client_secret → 200
    const good = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token', refresh_token: tok.refresh_token, client_id, client_secret,
      }).toString(),
    }));
    assertEquals(good.status, 200);
  });
});

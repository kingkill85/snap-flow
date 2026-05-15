import { assertEquals, assert } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthRoutes } from '../../src/routes/oauth.ts';

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

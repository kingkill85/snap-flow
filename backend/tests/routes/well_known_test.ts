import { assertEquals } from '@std/assert';
import { Hono } from 'hono';
import { wellKnownRoutes } from '../../src/routes/well-known.ts';

function buildApp(): Hono {
  const app = new Hono();
  app.route('/', wellKnownRoutes);
  return app;
}

Deno.test('well-known metadata routes', async (t) => {
  await t.step('GET /.well-known/oauth-authorization-server returns JSON metadata', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://snapflow.example.com/.well-known/oauth-authorization-server'));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('content-type')?.startsWith('application/json'), true);
    const body = await res.json();
    assertEquals(body.issuer, 'https://snapflow.example.com');
  });

  await t.step('GET /.well-known/oauth-protected-resource returns JSON metadata', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://snapflow.example.com/.well-known/oauth-protected-resource'));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.resource, 'https://snapflow.example.com/mcp');
  });
});

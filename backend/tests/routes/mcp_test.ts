import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { generateToken } from '../../src/services/jwt.ts';

Deno.test('POST /mcp', async (t) => {
  await setupTestDatabase();

  await t.step('returns 401 with WWW-Authenticate when no bearer', async () => {
    const res = await app.fetch(new Request('http://x/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
    assertEquals(res.status, 401);
    const wwwAuth = res.headers.get('www-authenticate') ?? '';
    assert(wwwAuth.includes('Bearer'));
    assert(wwwAuth.includes('resource_metadata'));
  });

  await t.step('tools/list returns the 4 tools when authenticated', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'mcptest@example.com', password_hash: 'x', role: 'user',
      full_name: 'M', tenant_id: tenant.id,
    } as any);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const res = await app.fetch(new Request('http://x/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name).sort();
    assertEquals(names, ['get_project', 'get_project_total', 'list_projects', 'search_items']);
  });
});

import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { dispatchToBackend } from '../../src/services/mcp/dispatcher.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { generateToken } from '../../src/services/jwt.ts';

Deno.test('dispatchToBackend', async (t) => {
  await setupTestDatabase();

  await t.step('returns parsed JSON body for 200 responses', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'dispatcher@example.com', password_hash: 'x', role: 'user',
      full_name: 'D', tenant_id: tenant.id,
    } as any);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await dispatchToBackend(app, {
      method: 'GET',
      path: '/api/projects',
      accessToken: token,
    });
    assertEquals(result.ok, true);
    assert(Array.isArray(result.body.data));
  });

  await t.step('returns {ok:false, status, body} for error responses', async () => {
    await clearDatabase();
    const result = await dispatchToBackend(app, {
      method: 'GET',
      path: '/api/projects',
      accessToken: 'garbage.jwt.string',
    });
    assertEquals(result.ok, false);
    assertEquals(result.status, 401);
  });
});

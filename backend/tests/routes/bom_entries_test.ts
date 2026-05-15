import { assertEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { getDb } from '../../src/config/database.ts';

await setupTestDatabase();

const { tenantRepository } = await import('../../src/repositories/tenant.ts');
const { userRepository } = await import('../../src/repositories/user.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');

async function seedBomEntry(tenantName: string, userEmail: string) {
  const tenant = await tenantRepository.create({ name: tenantName });
  const user = await userRepository.create({
    email: userEmail,
    password_hash: 'x',
    role: 'user',
    full_name: 'U',
    tenant_id: tenant.id,
  });
  const project = await projectRepository.create({
    version_name: 'v1',
    customer_name: 'Customer',
    tenant_id: tenant.id,
  });
  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Main',
    image_path: 'test.png',
  });
  const rows = getDb().queryEntries<{ id: number }>(`
    INSERT INTO project_bom (
      project_id, floorplan_id, item_id, variant_id, parent_bom_id,
      item_name, style_name, model_number, unit_price, picture_path
    ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL)
    RETURNING id
  `, [project.id, floorplan.id, 'Some Lamp', 0]);
  const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
  return { tenant, user, bomId: rows[0]!.id, token };
}

Deno.test('GET /api/bom-entries/:id', async (t) => {
  await t.step('owner can read their BOM entry', async () => {
    await clearDatabase();
    const { bomId, token } = await seedBomEntry('A', 'a@example.com');
    const res = await testRequest(`/api/bom-entries/${bomId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 200);
    const body = await parseJSON(res);
    assertEquals(body.data.id, bomId);
    assertEquals(body.data.item_name, 'Some Lamp');
  });

  await t.step('user from another tenant gets 404', async () => {
    await clearDatabase();
    const { bomId } = await seedBomEntry('A', 'a2@example.com');
    const { token: tokenB } = await seedBomEntry('B', 'b@example.com');
    const res = await testRequest(`/api/bom-entries/${bomId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assertEquals(res.status, 404);
  });

  await t.step('returns 400 for non-numeric id', async () => {
    await clearDatabase();
    const { token } = await seedBomEntry('A', 'a3@example.com');
    const res = await testRequest('/api/bom-entries/not-a-number', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 400);
  });

  await t.step('returns 404 for unknown id', async () => {
    await clearDatabase();
    const { token } = await seedBomEntry('A', 'a4@example.com');
    const res = await testRequest('/api/bom-entries/999999', {
      headers: { Authorization: `Bearer ${token}` },
    });
    assertEquals(res.status, 404);
  });

  await t.step('returns 401 without auth', async () => {
    await clearDatabase();
    const { bomId } = await seedBomEntry('A', 'a5@example.com');
    const res = await testRequest(`/api/bom-entries/${bomId}`);
    assertEquals(res.status, 401);
  });
});

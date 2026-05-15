import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { projectRepository } from '../../src/repositories/project.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { listProjectsTool } from '../../src/services/mcp/tools/list-projects.ts';
import { getProjectTool } from '../../src/services/mcp/tools/get-project.ts';
import { getProjectTotalTool } from '../../src/services/mcp/tools/get-project-total.ts';

async function seedUserWithProjects() {
  const tenant = await tenantRepository.create({ name: 'T' } as any);
  const user = await userRepository.create({
    email: 'listproj@example.com', password_hash: 'x', role: 'user',
    full_name: 'L', tenant_id: tenant.id,
  } as any);
  await projectRepository.create({
    version_name: 'Alpha', customer_name: 'A Co', tenant_id: tenant.id,
  } as any);
  await projectRepository.create({
    version_name: 'Beta', customer_name: 'B Co', tenant_id: tenant.id,
  } as any);
  const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
  return { token, tenant, user };
}

Deno.test('list_projects tool', async (t) => {
  await setupTestDatabase();

  await t.step("returns content with the user's projects", async () => {
    await clearDatabase();
    const { token } = await seedUserWithProjects();
    const result = await listProjectsTool.handler({ query: undefined }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assertEquals(result.content.length, 1);
    const text = result.content[0].text;
    assert(text.includes('Alpha'));
    assert(text.includes('Beta'));
  });

  await t.step('honors search query', async () => {
    await clearDatabase();
    const { token } = await seedUserWithProjects();
    const result = await listProjectsTool.handler({ query: 'Alpha' }, { app, accessToken: token });
    assert(result.content[0].text.includes('Alpha'));
    assert(!result.content[0].text.includes('Beta'));
  });

  await t.step('returns isError on bad auth', async () => {
    await clearDatabase();
    const result = await listProjectsTool.handler({ query: undefined }, { app, accessToken: 'bad' });
    assertEquals(result.isError, true);
  });
});

Deno.test('get_project tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns project details for valid id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'getproj@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as any);
    await projectRepository.create({
      version_name: 'Alpha', customer_name: 'A Co', tenant_id: tenant.id,
    } as any);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    // Discover the created project's id by listing
    const projects = await projectRepository.findAll(undefined, { tenantId: tenant.id, role: 'user' } as any);
    const projectId = projects[0].id;

    const result = await getProjectTool.handler({ project_id: projectId }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0].text.includes('Alpha'));
  });

  await t.step('returns isError for unknown id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'getproj2@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as any);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getProjectTool.handler({ project_id: 999999 }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

Deno.test('get_project_total tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns total for valid id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as any);
    const user = await userRepository.create({
      email: 'gettotal@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as any);
    await projectRepository.create({
      version_name: 'Alpha', customer_name: 'A Co', tenant_id: tenant.id,
    } as any);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const projects = await projectRepository.findAll(undefined, { tenantId: tenant.id, role: 'user' } as any);

    const result = await getProjectTotalTool.handler({ project_id: projects[0].id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0].text.length > 2);
  });
});

import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { projectRepository } from '../../src/repositories/project.ts';
import { itemRepository } from '../../src/repositories/item.ts';
import { floorplanRepository } from '../../src/repositories/floorplan.ts';
import { areaRepository } from '../../src/repositories/area.ts';
import { generateToken } from '../../src/services/jwt.ts';
import type { CreateTenantDTO, CreateUserDTO, CreateProjectDTO, CreateFloorplanDTO, CreateAreaDTO } from '../../src/models/index.ts';
import type { TenantContext } from '../../src/repositories/user.ts';
import { listProjectsTool } from '../../src/services/mcp/tools/list-projects.ts';
import { getProjectTool } from '../../src/services/mcp/tools/get-project.ts';
import { getVersionTotalTool } from '../../src/services/mcp/tools/get-version-total.ts';
import { searchItemsTool } from '../../src/services/mcp/tools/search-items.ts';
import { listFloorplansTool } from '../../src/services/mcp/tools/list-floorplans.ts';
import { getFloorplanBomTool } from '../../src/services/mcp/tools/get-floorplan-bom.ts';
import { listAreasTool } from '../../src/services/mcp/tools/list-areas.ts';
import { getInvoiceCalculationTool } from '../../src/services/mcp/tools/get-invoice-calculation.ts';
import { projectGroupRepository } from '../../src/repositories/project-group.ts';

async function seedUserWithProjects() {
  const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
  const user = await userRepository.create({
    email: 'listproj@example.com', password_hash: 'x', role: 'user',
    full_name: 'L', tenant_id: tenant.id,
  } as CreateUserDTO & { password_hash: string });
  // Create two project groups (each projectRepository.create creates a group + version)
  await projectRepository.create({
    version_name: 'v1', customer_name: 'Alpha Customer', tenant_id: tenant.id,
  } as CreateProjectDTO);
  await projectRepository.create({
    version_name: 'v1', customer_name: 'Beta Customer', tenant_id: tenant.id,
  } as CreateProjectDTO);
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
    const text = result.content[0]!.text!;
    assert(text.includes('Alpha Customer'));
    assert(text.includes('Beta Customer'));
  });

  await t.step('honors search query', async () => {
    await clearDatabase();
    const { token } = await seedUserWithProjects();
    // Search by customer name (project-groups endpoint searches customer_name)
    const result = await listProjectsTool.handler({ query: 'Alpha' }, { app, accessToken: token });
    assert(result.content[0]!.text!.includes('Alpha Customer'));
    assert(!result.content[0]!.text!.includes('Beta Customer'));
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
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'getproj@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    await projectRepository.create({
      version_name: 'v1', customer_name: 'Alpha Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    // Discover the created project group's id by listing
    const groups = await projectGroupRepository.findAll(undefined, { tenantId: tenant.id, role: 'user' } as TenantContext);
    const groupId = groups[0].id;

    const result = await getProjectTool.handler({ project_id: groupId }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0]!.text!.includes('Alpha Customer'));
  });

  await t.step('returns isError for unknown id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'getproj2@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getProjectTool.handler({ project_id: 999999 }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

Deno.test('get_version_total tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns total for valid version id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'gettotal@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    await projectRepository.create({
      version_name: 'v1', customer_name: 'Alpha Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    // The version id is the project (version) row id
    const projects = await projectRepository.findAll(undefined, { tenantId: tenant.id, role: 'user' } as TenantContext);

    const result = await getVersionTotalTool.handler({ version_id: projects[0].id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0]!.text!.length > 2);
  });
});

Deno.test('search_items tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns items matching query', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'searchitem@example.com', password_hash: 'x', role: 'user',
      full_name: 'S', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const itemSeed = { name: 'Smart Switch', category_id: null, type_id: null };
    // deno-lint-ignore no-explicit-any
    await itemRepository.create(itemSeed as any);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await searchItemsTool.handler({ query: 'Switch' }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0]!.text!.includes('Smart Switch'));
  });

  await t.step('honors limit', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'searchitem2@example.com', password_hash: 'x', role: 'user',
      full_name: 'S', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await searchItemsTool.handler({ limit: 5 }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
  });
});

Deno.test('list_floorplans tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns floorplans for a valid version_id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'listfp@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'FP Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    await floorplanRepository.create({
      project_id: project.id, name: 'Ground Floor', image_path: 'test.png',
    } as CreateFloorplanDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await listFloorplansTool.handler({ version_id: project.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0]!.text!.includes('Ground Floor'));
  });

  await t.step('returns empty array when version has no floorplans', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'listfp2@example.com', password_hash: 'x', role: 'user',
      full_name: 'L', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Empty FP Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await listFloorplansTool.handler({ version_id: project.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    // Should return an empty array (serialized as "[]")
    assert(result.content[0]!.text!.includes('[]'));
  });

  await t.step('returns isError on bad auth', async () => {
    await clearDatabase();
    const result = await listFloorplansTool.handler({ version_id: 1 }, { app, accessToken: 'bad' });
    assertEquals(result.isError, true);
  });
});

Deno.test('get_floorplan_bom tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns BOM for a valid floorplan_id (empty BOM)', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'getbom@example.com', password_hash: 'x', role: 'user',
      full_name: 'B', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'BOM Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Main Floor', image_path: 'test.png',
    } as CreateFloorplanDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    // Empty BOM returns an empty array
    assert(result.content[0]!.text!.length > 0);
  });

  await t.step('returns isError for unknown floorplan_id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'getbom2@example.com', password_hash: 'x', role: 'user',
      full_name: 'B', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await getFloorplanBomTool.handler({ floorplan_id: 999999 }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

Deno.test('list_areas tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns areas for a valid floorplan_id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'listareas@example.com', password_hash: 'x', role: 'user',
      full_name: 'A', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Area Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Ground Floor', image_path: 'test.png',
    } as CreateFloorplanDTO);
    await areaRepository.create({
      floorplan_id: floorplan.id, x: 10, y: 20, width: 100, height: 80, name: 'Kitchen',
    } as CreateAreaDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await listAreasTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0]!.text!.includes('Kitchen'));
  });

  await t.step('returns empty array when floorplan has no areas', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'listareas2@example.com', password_hash: 'x', role: 'user',
      full_name: 'A', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Area Customer 2', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Ground Floor', image_path: 'test.png',
    } as CreateFloorplanDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await listAreasTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0]!.text!.includes('[]'));
  });
});

Deno.test('get_invoice_calculation tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns invoice calculation for a valid version_id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'getinvoice@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Invoice Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await getInvoiceCalculationTool.handler({ version_id: project.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    // Should contain numeric totals even for an empty BOM
    assert(result.content[0]!.text!.length > 2);
  });

  await t.step('returns isError for unknown version_id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'getinvoice2@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await getInvoiceCalculationTool.handler({ version_id: 999999 }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

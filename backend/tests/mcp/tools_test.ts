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
import { getItemPictureTool } from '../../src/services/mcp/tools/get-item-picture.ts';
import { projectGroupRepository } from '../../src/repositories/project-group.ts';
import { getDb } from '../../src/config/database.ts';
import { fileStorageService } from '../../src/services/file-storage.ts';

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

Deno.test('get_floorplan_bom enrichment', async (t) => {
  await setupTestDatabase();

  await t.step('includes floorplan_name, version_name and area_name', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'enrich@example.com', password_hash: 'x', role: 'user',
      full_name: 'E', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Enrich Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Main Floor', image_path: 'test.png',
    } as CreateFloorplanDTO);
    const area = await areaRepository.create({
      floorplan_id: floorplan.id, x: 0, y: 0, width: 50, height: 50, name: 'Wohnzimmer',
    } as CreateAreaDTO);

    // Insert a BOM row + a matching item placement so the row appears in the
    // aggregated BOM output. item_id/variant_id stay null — that's fine for
    // the aggregation path (the row just gets isAvailable=false).
    const db = getDb();
    const bomRows = db.queryEntries<{ id: number }>(`
      INSERT INTO project_bom (
        project_id, floorplan_id, item_id, variant_id, parent_bom_id,
        item_name, style_name, model_number, unit_price, picture_path, area_id
      ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL, ?)
      RETURNING id
    `, [project.id, floorplan.id, 'Test Lamp', 0, area.id]);
    const bomId = bomRows[0]!.id;
    db.query(`
      INSERT INTO placements (bom_id, floorplan_id, type, area_id, x, y, width, height, rotation)
      VALUES (?, ?, 'item', ?, 10, 10, 1, 1, 0)
    `, [bomId, floorplan.id, area.id]);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    const text = result.content[0]!.text!;
    assert(text.includes('"floorplan_name": "Main Floor"'));
    assert(text.includes('"version_name": "v1"'));
    assert(text.includes('"area_name": "Wohnzimmer"'));
  });
});

Deno.test('get_item_picture tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns an image content block for a BOM entry with picture_path', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'pic@example.com', password_hash: 'x', role: 'user',
      full_name: 'P', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Pic Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Main', image_path: 'test.png',
    } as CreateFloorplanDTO);

    // Write a tiny fixture file inside the test uploads dir
    const subdir = `projects/${project.id}/bom-images`;
    await fileStorageService.ensureDirectory(subdir);
    const relPath = `${subdir}/test-pic.png`;
    const fakeBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    await Deno.writeFile(fileStorageService.getFilePath(relPath), fakeBytes);

    const db = getDb();
    const bomRows = db.queryEntries<{ id: number }>(`
      INSERT INTO project_bom (
        project_id, floorplan_id, item_id, variant_id, parent_bom_id,
        item_name, style_name, model_number, unit_price, picture_path
      ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, ?)
      RETURNING id
    `, [project.id, floorplan.id, 'Pic Lamp', 0, relPath]);
    const bomId = bomRows[0]!.id;

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ bom_id: bomId }, { app, accessToken: token });

    try {
      assertEquals(result.isError, undefined);
      const img = result.content.find(b => b.type === 'image');
      assertEquals(img?.type, 'image');
      assertEquals(img?.mimeType, 'image/png');
      assert((img?.data?.length ?? 0) > 0);
    } finally {
      await fileStorageService.deleteFile(relPath).catch(() => {});
    }
  });

  await t.step('returns isError for BOM entry with no picture_path', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'pic2@example.com', password_hash: 'x', role: 'user',
      full_name: 'P', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Pic Customer 2', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Main', image_path: 'test.png',
    } as CreateFloorplanDTO);

    const db = getDb();
    const bomRows = db.queryEntries<{ id: number }>(`
      INSERT INTO project_bom (
        project_id, floorplan_id, item_id, variant_id, parent_bom_id,
        item_name, style_name, model_number, unit_price, picture_path
      ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL)
      RETURNING id
    `, [project.id, floorplan.id, 'No-pic Lamp', 0]);
    const bomId = bomRows[0]!.id;

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ bom_id: bomId }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

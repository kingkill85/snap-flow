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
import { getFloorplanImageTool } from '../../src/services/mcp/tools/get-floorplan-image.ts';
import { itemVariantRepository } from '../../src/repositories/item-variant.ts';
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

Deno.test('image tools describe themselves honestly', async (t) => {
  await t.step('get_floorplan_image description warns the user cannot see it', () => {
    const d = getFloorplanImageTool.description.toLowerCase();
    assert(d.includes('does not render this image back to the user'),
      `expected get_floorplan_image description to contain the guardrail phrase, got: ${getFloorplanImageTool.description}`);
    assert(d.includes('describe'),
      `expected get_floorplan_image description to instruct the model to describe contents`);
  });

  await t.step('get_item_picture description warns the user cannot see it', () => {
    const d = getItemPictureTool.description.toLowerCase();
    assert(d.includes('does not render this image back to the user'),
      `expected get_item_picture description to contain the guardrail phrase, got: ${getItemPictureTool.description}`);
    assert(d.includes('describe'),
      `expected get_item_picture description to instruct the model to describe contents`);
  });
});

Deno.test('get_item_picture accepts variant_id from catalog', async (t) => {
  await setupTestDatabase();

  await t.step('returns image content for a variant with image_path', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'var@example.com', password_hash: 'x', role: 'user',
      full_name: 'V', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });

    // Seed a category + item_type to satisfy items FK, then an item + variant with image.
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'CatalogLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);

    const subdir = `variants`;
    await fileStorageService.ensureDirectory(subdir);
    const relPath = `${subdir}/var.png`;
    const fakeBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    await Deno.writeFile(fileStorageService.getFilePath(relPath), fakeBytes);

    const variant = await itemVariantRepository.create({
      item_id: item.id, style_name: 'Black', price: 100, image_path: relPath, sort_order: 0, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    try {
      const result = await getItemPictureTool.handler({ variant_id: variant.id }, { app, accessToken: token });
      assertEquals(result.isError, undefined);
      const img = result.content.find(b => b.type === 'image');
      assertEquals(img?.type, 'image');
      assertEquals(img?.mimeType, 'image/png');
      assert((img?.data?.length ?? 0) > 0);
    } finally {
      await fileStorageService.deleteFile(relPath).catch(() => {});
    }
  });

  await t.step('returns isError for variant with no image_path', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'var2@example.com', password_hash: 'x', role: 'user',
      full_name: 'V', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'NoImageLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);
    const variant = await itemVariantRepository.create({
      item_id: item.id, style_name: 'Black', price: 100, sort_order: 0, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ variant_id: variant.id }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

Deno.test('get_item_picture accepts item_id from catalog', async (t) => {
  await setupTestDatabase();

  await t.step('falls back to first active variant with an image', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'item@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'MultiVariantLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);

    // Variant A: sort_order 0, NO image. Variant B: sort_order 1, with image.
    // Expected fallback: variant B (first active variant *with* an image).
    await itemVariantRepository.create({
      item_id: item.id, style_name: 'NoImg', price: 100, sort_order: 0, is_active: true,
    } as never);
    const subdir = `variants`;
    await fileStorageService.ensureDirectory(subdir);
    const relPath = `${subdir}/item-fallback.png`;
    const fakeBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9]);
    await Deno.writeFile(fileStorageService.getFilePath(relPath), fakeBytes);
    await itemVariantRepository.create({
      item_id: item.id, style_name: 'WithImg', price: 110, image_path: relPath, sort_order: 1, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    try {
      const result = await getItemPictureTool.handler({ item_id: item.id }, { app, accessToken: token });
      assertEquals(result.isError, undefined);
      const img = result.content.find(b => b.type === 'image');
      assertEquals(img?.mimeType, 'image/png');
      assert((img?.data?.length ?? 0) > 0);
      const text = result.content.find(b => b.type === 'text')?.text ?? '';
      assert(text.includes('WithImg'),
        `expected text block to reference the WithImg variant (proves fallback skipped the imageless NoImg variant), got: ${text}`);
    } finally {
      await fileStorageService.deleteFile(relPath).catch(() => {});
    }
  });

  await t.step('returns isError when no active variant has an image', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'item2@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'NoImagesLamp',
      description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);
    await itemVariantRepository.create({
      item_id: item.id, style_name: 'A', price: 100, sort_order: 0, is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ item_id: item.id }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });

  await t.step('returns isError when item has no variants at all', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'item3@example.com', password_hash: 'x', role: 'user',
      full_name: 'I', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const db = getDb();
    const cat = db.queryEntries<{ id: number }>(
      `INSERT INTO categories (name, sort_order, is_active) VALUES ('Cat', 0, 1) RETURNING id`,
    )[0]!.id;
    const typ = db.queryEntries<{ id: number }>(
      `INSERT INTO item_types (name, abbreviation, color, sort_order, is_active) VALUES ('Type', 'T', '#000', 0, 1) RETURNING id`,
    )[0]!.id;
    const item = await itemRepository.create({
      category_id: cat, type_id: typ, name: 'Empty', description: '', base_model_number: '', dimensions: '', is_active: true,
    } as never);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({ item_id: item.id }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});

Deno.test('get_floorplan_bom — placement coordinates enrichment', async (t) => {
  await setupTestDatabase();

  await t.step('attaches per-placement coords to each BOM entry', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'coord@example.com', password_hash: 'x', role: 'user',
      full_name: 'C', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Coord Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Main', image_path: 'test.png',
    } as CreateFloorplanDTO);

    const db = getDb();
    const bomId = db.queryEntries<{ id: number }>(`
      INSERT INTO project_bom (
        project_id, floorplan_id, item_id, variant_id, parent_bom_id,
        item_name, style_name, model_number, unit_price, picture_path
      ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL)
      RETURNING id
    `, [project.id, floorplan.id, 'CoordLamp', 0])[0]!.id;

    // Two placements pointing at the same BOM entry (quantity 2)
    db.query(`INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation)
              VALUES (?, ?, 'item', 340, 220, 64, 64, 0)`, [bomId, floorplan.id]);
    db.query(`INSERT INTO placements (bom_id, floorplan_id, type, x, y, width, height, rotation)
              VALUES (?, ?, 'item', 120, 50, 64, 64, 90)`, [bomId, floorplan.id]);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    const payload = JSON.parse(result.content[0]!.text!);
    const main = payload.groups?.[0]?.mainEntry;
    assert(Array.isArray(main?.placements), 'expected mainEntry.placements array');
    assertEquals(main.placements.length, 2);
    const first = main.placements.find((p: { x: number }) => p.x === 340);
    assertEquals(first.y, 220);
    assertEquals(first.width, 64);
    assertEquals(first.height, 64);
    assertEquals(first.rotation, 0);
    assertEquals(first.area_id, null);
    assertEquals(typeof first.placement_id, 'number');
    const second = main.placements.find((p: { x: number }) => p.x === 120);
    assertEquals(second.rotation, 90);
    assertEquals(second.y, 50);
    assertEquals(second.width, 64);
    assertEquals(second.height, 64);
    assertEquals(second.area_id, null);
    assertEquals(typeof second.placement_id, 'number');
  });
});

Deno.test('get_floorplan_bom — canvas dimensions', async (t) => {
  await setupTestDatabase();

  // Reuse the PNG builder from image_dimensions_test via copy — keep the test file self-contained.
  function makePng(width: number, height: number): Uint8Array {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const length = [0x00, 0x00, 0x00, 0x0d];
    const type = [0x49, 0x48, 0x44, 0x52];
    const w = [(width >>> 24) & 0xff, (width >>> 16) & 0xff, (width >>> 8) & 0xff, width & 0xff];
    const h = [(height >>> 24) & 0xff, (height >>> 16) & 0xff, (height >>> 8) & 0xff, height & 0xff];
    const rest = [0x08, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    return new Uint8Array([...signature, ...length, ...type, ...w, ...h, ...rest]);
  }

  await t.step('includes canvas.width/height when the image file is parseable', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'canvas@example.com', password_hash: 'x', role: 'user',
      full_name: 'C', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Canvas Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);

    const subdir = `projects/${project.id}/floorplans`;
    await fileStorageService.ensureDirectory(subdir);
    const relPath = `${subdir}/canvas.png`;
    await Deno.writeFile(fileStorageService.getFilePath(relPath), makePng(1920, 1080));

    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'Canvas', image_path: relPath,
    } as CreateFloorplanDTO);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    try {
      const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
      assertEquals(result.isError, undefined);
      const payload = JSON.parse(result.content[0]!.text!);
      assertEquals(payload.canvas?.image_path, relPath);
      assertEquals(payload.canvas?.width, 1920);
      assertEquals(payload.canvas?.height, 1080);
      assert(typeof payload.canvas?.coordinate_system === 'string');
    } finally {
      await fileStorageService.deleteFile(relPath).catch(() => {});
    }
  });

  await t.step('omits canvas width/height gracefully when file is missing', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'canvas2@example.com', password_hash: 'x', role: 'user',
      full_name: 'C', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'NoCanvas Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'NoFile', image_path: 'does-not-exist.png',
    } as CreateFloorplanDTO);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    const payload = JSON.parse(result.content[0]!.text!);
    assertEquals(payload.canvas?.image_path, 'does-not-exist.png');
    assertEquals(payload.canvas?.width, undefined);
    assertEquals(payload.canvas?.height, undefined);
    assert(typeof payload.canvas?.coordinate_system === 'string');
  });
});

Deno.test('get_floorplan_bom — areas summary and area_box on placements', async (t) => {
  await setupTestDatabase();

  await t.step('exposes areas[] at top level and area_box on each placement', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'area@example.com', password_hash: 'x', role: 'user',
      full_name: 'A', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const project = await projectRepository.create({
      version_name: 'v1', customer_name: 'Area Customer', tenant_id: tenant.id,
    } as CreateProjectDTO);
    const floorplan = await floorplanRepository.create({
      project_id: project.id, name: 'WithAreas', image_path: 'na.png',
    } as CreateFloorplanDTO);

    const area = await areaRepository.create({
      floorplan_id: floorplan.id, x: 0, y: 0, width: 500, height: 300, name: 'Wohnzimmer',
    } as CreateAreaDTO);
    // A second area with no placements — must still appear in the areas summary.
    await areaRepository.create({
      floorplan_id: floorplan.id, x: 500, y: 0, width: 400, height: 300, name: 'Küche',
    } as CreateAreaDTO);

    const db = getDb();
    const bomId = db.queryEntries<{ id: number }>(`
      INSERT INTO project_bom (
        project_id, floorplan_id, item_id, variant_id, parent_bom_id,
        item_name, style_name, model_number, unit_price, picture_path, area_id
      ) VALUES (?, ?, NULL, NULL, NULL, ?, NULL, NULL, ?, NULL, ?)
      RETURNING id
    `, [project.id, floorplan.id, 'AreaLamp', 0, area.id])[0]!.id;
    db.query(`INSERT INTO placements (bom_id, floorplan_id, type, area_id, x, y, width, height, rotation)
              VALUES (?, ?, 'item', ?, 30, 30, 10, 10, 0)`, [bomId, floorplan.id, area.id]);

    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getFloorplanBomTool.handler({ floorplan_id: floorplan.id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    const payload = JSON.parse(result.content[0]!.text!);

    // Top-level areas summary
    assert(Array.isArray(payload.areas), 'expected top-level areas array');
    assertEquals(payload.areas.length, 2);
    const wohn = payload.areas.find((a: { name: string }) => a.name === 'Wohnzimmer');
    assertEquals(wohn.x, 0);
    assertEquals(wohn.y, 0);
    assertEquals(wohn.width, 500);
    assertEquals(wohn.height, 300);

    const küche = payload.areas.find((a: { name: string }) => a.name === 'Küche');
    assertEquals(küche.x, 500);
    assertEquals(küche.y, 0);
    assertEquals(küche.width, 400);
    assertEquals(küche.height, 300);

    // Per-placement area_box
    const placement = payload.groups[0].mainEntry.placements[0];
    assertEquals(placement.area_name, 'Wohnzimmer');
    assertEquals(placement.area_box.x, 0);
    assertEquals(placement.area_box.y, 0);
    assertEquals(placement.area_box.width, 500);
    assertEquals(placement.area_box.height, 300);
  });
});

Deno.test('get_item_picture input validation', async (t) => {
  await setupTestDatabase();

  await t.step('rejects calls with zero IDs', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'v0@example.com', password_hash: 'x', role: 'user',
      full_name: 'X', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler({}, { app, accessToken: token });
    assertEquals(result.isError, true);
    assert((result.content[0]!.text ?? '').toLowerCase().includes('exactly one'));
  });

  await t.step('rejects calls with two IDs', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'v2@example.com', password_hash: 'x', role: 'user',
      full_name: 'X', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler(
      { bom_id: 1, variant_id: 2 } as never,
      { app, accessToken: token },
    );
    assertEquals(result.isError, true);
    assert((result.content[0]!.text ?? '').toLowerCase().includes('exactly one'));
  });

  await t.step('rejects calls with variant_id + item_id', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T' } as CreateTenantDTO);
    const user = await userRepository.create({
      email: 'v3@example.com', password_hash: 'x', role: 'user',
      full_name: 'X', tenant_id: tenant.id,
    } as CreateUserDTO & { password_hash: string });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await getItemPictureTool.handler(
      { variant_id: 1, item_id: 2 } as never,
      { app, accessToken: token },
    );
    assertEquals(result.isError, true);
    assert((result.content[0]!.text ?? '').toLowerCase().includes('exactly one'));
  });
});

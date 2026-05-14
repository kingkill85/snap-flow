import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';
import { getDb } from '../../src/config/database.ts';
import type { Placement } from '../../src/models/index.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');


async function getAuthToken(): Promise<string> {
  clearDatabase();
  
  // Create user
  const passwordHash = hashPassword('password123');
  await userRepository.create({
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'user',
    tenant_id: 1,
  });

  // Login
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      password: 'password123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  return loginData.data.accessToken;
}

Deno.test('Placement - CRUD operations', async (t) => {
  const token = await getAuthToken();
  
  // Create project
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });
  const projectId = project.id;

  // Create floorplan
  const floorplan = await floorplanRepository.create({
    project_id: projectId,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });
  const floorplanId = floorplan.id;

  // Create category
  const category = await categoryRepository.create({ name: 'Test Category' });
  const categoryId = category.id;

  // Create item
  const item = await itemRepository.create({
    category_id: categoryId,
    name: 'Test Item',
    description: 'Test description',
    base_model_number: 'TEST-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });
  const itemId = item.id;

  // Create variant
  const variant = await itemVariantRepository.create({
    item_id: itemId,
    style_name: 'Default',
    price: 29.99,
    image_path: 'items/test.jpg',
  });
  const variantId = variant.id;

  let placementId: number;

  await t.step('Create placement', async () => {
    const response = await testRequest('/api/placements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        floorplan_id: floorplanId,
        item_variant_id: variantId,
        x: 100,
        y: 150,
        width: 50,
        height: 50,
      }),
    });

    assertEquals(response.status, 201);
    const data = await parseJSON(response);
    assertExists(data.data.id);
    placementId = data.data.id;
    assertEquals(data.data.floorplan_id, floorplanId);
    assertEquals(data.data.item_variant_id, variantId);
    assertEquals(data.data.x, 100);
    assertEquals(data.data.y, 150);
  });

  await t.step('Get all placements for floorplan', async () => {
    const response = await testRequest(`/api/placements?floorplan_id=${floorplanId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    assertEquals(response.status, 200);
    const data = await parseJSON(response);
    assertEquals(data.data.length, 1);
    assertEquals(data.data[0].id, placementId);
  });

  await t.step('Update placement', async () => {
    const response = await testRequest(`/api/placements/${placementId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        x: 200,
        y: 250,
        width: 100,
        height: 100,
      }),
    });

    assertEquals(response.status, 200);
    const data = await parseJSON(response);
    assertEquals(data.data.x, 200);
    assertEquals(data.data.y, 250);
  });

  await t.step('Delete placement', async () => {
    const response = await testRequest(`/api/placements/${placementId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    assertEquals(response.status, 200);
    
    // Verify placement is deleted
    const getResponse = await testRequest(`/api/placements?floorplan_id=${floorplanId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const getData = await parseJSON(getResponse);
    assertEquals(getData.data.length, 0);
  });
});

Deno.test('Placement - validation errors', async (t) => {
  const token = await getAuthToken();

  await t.step('Create placement with missing required fields', async () => {
    const response = await testRequest('/api/placements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    assertEquals(response.status, 400);
    const data = await parseJSON(response);
    assertExists(data.error);
  });

  await t.step('Update non-existent placement', async () => {
    const response = await testRequest('/api/placements/99999', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ x: 100 }),
    });

    assertEquals(response.status, 404);
  });

  await t.step('Delete non-existent placement', async () => {
    const response = await testRequest('/api/placements/99999', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    assertEquals(response.status, 404);
  });
});

Deno.test('Placement - duplicate endpoint', async (t) => {
  const token = await getAuthToken();
  
  // Create project
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });
  const projectId = project.id;

  // Create floorplan
  const floorplan = await floorplanRepository.create({
    project_id: projectId,
    name: 'Test Floor',
    image_path: 'floorplans/test.jpg',
  });
  const floorplanId = floorplan.id;

  // Create category
  const category = await categoryRepository.create({ name: 'Test Category' });
  const categoryId = category.id;

  // Create item
  const item = await itemRepository.create({
    category_id: categoryId,
    name: 'Test Item',
    description: 'Test description',
    base_model_number: 'TEST-001',
    dimensions: '100x100',
    is_active: true,
    type_id: 1,
  });
  const itemId = item.id;

  // Create variant
  const variant = await itemVariantRepository.create({
    item_id: itemId,
    style_name: 'Default',
    price: 29.99,
    image_path: 'items/test.jpg',
  });
  const variantId = variant.id;

  // Create original placement
  const createResponse = await testRequest('/api/placements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      floorplan_id: floorplanId,
      item_variant_id: variantId,
      x: 100,
      y: 150,
      width: 50,
      height: 50,
      rotation: 45,
    }),
  });

  const createData = await parseJSON(createResponse);
  const originalPlacementId = createData.data.id;
  const originalBomId = createData.data.bom_id;

  await t.step('Duplicate placement successfully', async () => {
    const response = await testRequest(`/api/placements/${originalPlacementId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        x: 200,
        y: 250,
      }),
    });

    assertEquals(response.status, 201);
    const data = await parseJSON(response);
    assertExists(data.data.id);
    assertEquals(data.data.x, 200);
    assertEquals(data.data.y, 250);
    assertEquals(data.data.width, 50);
    assertEquals(data.data.height, 50);
    // Rotation should be copied from original
    assertEquals(data.data.rotation, 45);
    assertEquals(data.data.floorplan_id, floorplanId);
    assertEquals(data.data.item_variant_id, variantId);
    // Should have a new BOM ID (not the same as original)
    assertExists(data.data.bom_id);
    assertEquals(data.data.bom_id !== originalBomId, true);
  });

  await t.step('Verify both placements exist after duplicate', async () => {
    const response = await testRequest(`/api/placements?floorplan_id=${floorplanId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    assertEquals(response.status, 200);
    const data = await parseJSON(response);
    assertEquals(data.data.length, 2);
    
    // Verify original placement still exists
    const original = data.data.find((p: Placement) => p.id === originalPlacementId);
    assertExists(original);
    assertEquals(original.x, 100);
    assertEquals(original.y, 150);
  });

  await t.step('Duplicate non-existent placement returns 404', async () => {
    const response = await testRequest('/api/placements/99999/duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        x: 200,
        y: 250,
      }),
    });

    assertEquals(response.status, 404);
    const data = await parseJSON(response);
    assertExists(data.error);
  });

  await t.step('Duplicate with missing coordinates returns 400', async () => {
    const response = await testRequest(`/api/placements/${originalPlacementId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    assertEquals(response.status, 400);
    const data = await parseJSON(response);
    assertExists(data.error);
  });

  await t.step('Duplicate returns item_variant_image_path', async () => {
    const response = await testRequest(`/api/placements/${originalPlacementId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ x: 300, y: 300 }),
    });

    assertEquals(response.status, 201);
    const data = await parseJSON(response);
    // findById now includes picture_path as item_variant_image_path
    assertEquals(data.data.item_variant_image_path !== undefined, true);
  });
});

Deno.test('Placement - duplicate assigns area_id via containment', async (t) => {
  const token = await getAuthToken();

  const db = getDb();

  // Create project + floorplan
  const project = await projectRepository.create({
   
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Floor With Area',
    image_path: 'floorplans/test.jpg',
  });

  // Create an area covering (0,0) to (500,500)
  db.query(
    `INSERT INTO placements (floorplan_id, type, x, y, width, height, rotation) VALUES (?, 'area', 0, 0, 500, 500, 0)`,
    [floorplan.id],
  );
  const areaPlacementId = Number(db.lastInsertRowId);
  db.query(
    `INSERT INTO area_properties (placement_id, name, color, opacity) VALUES (?, 'Test Area', '#FF0000', 0.3)`,
    [areaPlacementId],
  );
  // Create polygon vertices covering (0,0)-(500,0)-(500,500)-(0,500)
  db.query(`INSERT INTO area_vertices (placement_id, vertex_index, x, y) VALUES (?, 0, 0, 0)`, [areaPlacementId]);
  db.query(`INSERT INTO area_vertices (placement_id, vertex_index, x, y) VALUES (?, 1, 500, 0)`, [areaPlacementId]);
  db.query(`INSERT INTO area_vertices (placement_id, vertex_index, x, y) VALUES (?, 2, 500, 500)`, [areaPlacementId]);
  db.query(`INSERT INTO area_vertices (placement_id, vertex_index, x, y) VALUES (?, 3, 0, 500)`, [areaPlacementId]);

  // Create category + item + variant
  const category = await categoryRepository.create({ name: 'Area Test Category' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Area Test Item',
    description: 'Test',
    base_model_number: 'AREA-001',
    dimensions: '50x50',
    is_active: true,
    type_id: 1,
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Default',
    price: 10,
    image_path: 'items/area-test.jpg',
  });

  // Create original placement inside the area
  const createResponse = await testRequest('/api/placements', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      floorplan_id: floorplan.id,
      item_variant_id: variant.id,
      x: 100,
      y: 100,
      width: 50,
      height: 50,
    }),
  });

  const createData = await parseJSON(createResponse);
  const originalId = createData.data.id;

  await t.step('Original placement gets area_id from containment', () => {
    assertEquals(createData.data.area_id, areaPlacementId);
  });

  await t.step('Duplicate inside area gets area_id', async () => {
    const response = await testRequest(`/api/placements/${originalId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ x: 200, y: 200 }),
    });

    assertEquals(response.status, 201);
    const data = await parseJSON(response);
    assertEquals(data.data.area_id, areaPlacementId);
  });

  await t.step('Duplicate outside area gets null area_id', async () => {
    const response = await testRequest(`/api/placements/${originalId}/duplicate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ x: 600, y: 600 }),
    });

    assertEquals(response.status, 201);
    const data = await parseJSON(response);
    assertEquals(data.data.area_id, null);
  });
});

Deno.test('Placement - findById returns image path', async (t) => {
  const token = await getAuthToken();

  const _db = getDb();

  const project = await projectRepository.create({
   
    customer_name: 'Test',
    customer_address: '123 St',
    tenant_id: 1,
  });

  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Floor',
    image_path: 'floorplans/test.jpg',
  });

  const category = await categoryRepository.create({ name: 'Image Test Category' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Image Test Item',
    description: 'Test',
    base_model_number: 'IMG-001',
    dimensions: '50x50',
    is_active: true,
    type_id: 1,
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Default',
    price: 10,
    image_path: 'items/test-image.jpg',
  });

  await t.step('Create placement response includes item_variant_image_path', async () => {
    const response = await testRequest('/api/placements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        floorplan_id: floorplan.id,
        item_variant_id: variant.id,
        x: 50,
        y: 50,
        width: 40,
        height: 40,
      }),
    });

    assertEquals(response.status, 201);
    const data = await parseJSON(response);
    assertExists(data.data.item_variant_image_path);
  });

  await t.step('Update placement response includes item_variant_image_path', async () => {
    // Get the placement we just created
    const listResponse = await testRequest(`/api/placements?floorplan_id=${floorplan.id}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const listData = await parseJSON(listResponse);
    const placementId = listData.data[0].id;

    const response = await testRequest(`/api/placements/${placementId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ x: 100, y: 100 }),
    });

    assertEquals(response.status, 200);
    const data = await parseJSON(response);
    assertExists(data.data.item_variant_image_path);
  });
});

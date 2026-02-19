import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');
const { placementRepository } = await import('../../src/repositories/placement.ts');

async function getAuthToken(): Promise<string> {
  clearDatabase();
  
  // Create user
  const passwordHash = await hashPassword('password123');
  await userRepository.create({
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'user',
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
    name: 'Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
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

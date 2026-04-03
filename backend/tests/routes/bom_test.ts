import { assertEquals, assertExists } from '@std/assert';
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
const { variantAddonRepository } = await import('../../src/repositories/variant-addon.ts');
const { bomEntryRepository } = await import('../../src/repositories/bom-entry.ts');

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

Deno.test('BOM - Create placement auto-creates BOM entry with required addons', async () => {
  const token = await getAuthToken();
  
  // Create project
  const project = await projectRepository.create({
    name: 'Test Project',
    customer_name: 'Test Customer',
    status: 'active',
    tenant_id: 1,
  });

  // Create floorplan
  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  // Create category
  const category = await categoryRepository.create({ name: 'Test Category' });

  // Create main item
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Panel',
    base_model_number: 'SP-001',
    is_active: true,
    type_id: 1,
  });

  // Create variant for main item
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 500.00,
    image_path: 'items/variant1.jpg',
    is_active: true,
  });

  // Create addon item
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Wall Mount',
    base_model_number: 'WM-001',
    is_active: true,
    type_id: 1,
  });

  // Create addon variant
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'Standard',
    price: 50.00,
    image_path: 'items/addon1.jpg',
    is_active: true,
  });

  // Create required addon relationship
  await variantAddonRepository.create({
    variant_id: variant.id,
    addon_variant_id: addonVariant.id,
    is_required: true,
    sort_order: 1,
  });

  // Create placement - should auto-create BOM entry
  const placementResponse = await testRequest(`/api/placements?floorplan_id=${floorplan.id}`, {
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

  assertEquals(placementResponse.status, 201);
  const placementData = await parseJSON(placementResponse);
  assertExists(placementData.data.id);

  // Verify BOM entry was created
  const bomEntries = await bomEntryRepository.findByFloorplan(floorplan.id);
  assertEquals(bomEntries.length, 2); // Main entry + 1 addon

  // Find main entry
  const mainEntry = bomEntries.find(e => e.parent_bom_id === null);
  assertExists(mainEntry);
  assertEquals(mainEntry.variant_id, variant.id);
  assertEquals(mainEntry.unit_price, 500.00);

  // Find addon entry
  const addonEntry = bomEntries.find(e => e.parent_bom_id === mainEntry!.id);
  assertExists(addonEntry);
  assertEquals(addonEntry.variant_id, addonVariant.id);
  assertEquals(addonEntry.unit_price, 50.00);
});

Deno.test('BOM - Get BOM for floorplan returns hierarchical structure', async () => {
  const token = await getAuthToken();
  
  // Create project
  const project = await projectRepository.create({
    name: 'Test Project 2',
    customer_name: 'Test Customer',
    status: 'active',
    tenant_id: 1,
  });

  // Create floorplan
  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'First Floor',
    image_path: 'floorplans/test2.jpg',
  });

  // Create category
  const category = await categoryRepository.create({ name: 'Test Category 2' });

  // Create item and variant
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Touch Screen',
    base_model_number: 'TS-001',
    is_active: true,
    type_id: 1,
  });

  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Black',
    price: 800.00,
    is_active: true,
  });

  // Create placement
  await testRequest(`/api/placements?floorplan_id=${floorplan.id}`, {
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

  // Get BOM for floorplan
  const bomResponse = await testRequest(`/api/floorplans/${floorplan.id}/bom`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
    },
  });

  assertEquals(bomResponse.status, 200);
  const bomData = await parseJSON(bomResponse);
  assertExists(bomData.data);
  assertEquals(bomData.data.floorplanId, floorplan.id);
  assertExists(bomData.data.groups);
  assertEquals(bomData.data.groups.length, 1);
  assertEquals(bomData.data.totalPrice, 800.00);
  
  // Check group structure
  const group = bomData.data.groups[0];
  assertEquals(group.quantity, 1);
  assertEquals(group.totalPrice, 800.00);
  assertExists(group.mainEntry);
  assertEquals(group.mainEntry.unit_price, 800.00);
});

Deno.test('BOM - Delete last placement removes BOM entry', async () => {
  const token = await getAuthToken();
  
  // Create project
  const project = await projectRepository.create({
    name: 'Test Project 3',
    customer_name: 'Test Customer',
    status: 'active',
    tenant_id: 1,
  });

  // Create floorplan
  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Second Floor',
    image_path: 'floorplans/test3.jpg',
  });

  // Create category
  const category = await categoryRepository.create({ name: 'Test Category 3' });

  // Create item and variant
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Light Switch',
    base_model_number: 'LS-001',
    is_active: true,
    type_id: 1,
  });

  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Standard',
    price: 100.00,
    is_active: true,
  });

  // Create placement
  const placementResponse = await testRequest(`/api/placements?floorplan_id=${floorplan.id}`, {
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

  const placementData = await parseJSON(placementResponse);
  const placementId = placementData.data.id;

  // Verify BOM entry exists
  let bomEntries = await bomEntryRepository.findByFloorplan(floorplan.id);
  assertEquals(bomEntries.length, 1);

  // Delete placement
  const deleteResponse = await testRequest(`/api/placements/${placementId}`, {
    method: 'DELETE',
    headers: { 
      'Authorization': `Bearer ${token}`,
    },
  });

  assertEquals(deleteResponse.status, 200);

  // Verify BOM entry was removed
  bomEntries = await bomEntryRepository.findByFloorplan(floorplan.id);
  assertEquals(bomEntries.length, 0);
});

Deno.test('BOM - Get project total sums all floorplan totals', async () => {
  const token = await getAuthToken();
  
  // Create project
  const project = await projectRepository.create({
    name: 'Test Project 4',
    customer_name: 'Test Customer',
    status: 'active',
    tenant_id: 1,
  });

  // Create two floorplans
  const floorplan1 = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/fp1.jpg',
  });

  const floorplan2 = await floorplanRepository.create({
    project_id: project.id,
    name: 'First Floor',
    image_path: 'floorplans/fp2.jpg',
  });

  // Create category
  const category = await categoryRepository.create({ name: 'Test Category 4' });

  // Create items and variants
  const item1 = await itemRepository.create({
    category_id: category.id,
    name: 'Item 1',
    base_model_number: 'ITM-001',
    is_active: true,
    type_id: 1,
  });

  const variant1 = await itemVariantRepository.create({
    item_id: item1.id,
    style_name: 'Style A',
    price: 300.00,
    is_active: true,
  });

  const item2 = await itemRepository.create({
    category_id: category.id,
    name: 'Item 2',
    base_model_number: 'ITM-002',
    is_active: true,
    type_id: 1,
  });

  const variant2 = await itemVariantRepository.create({
    item_id: item2.id,
    style_name: 'Style B',
    price: 500.00,
    is_active: true,
  });

  // Create placement in floorplan 1
  await testRequest(`/api/placements?floorplan_id=${floorplan1.id}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      floorplan_id: floorplan1.id,
      item_variant_id: variant1.id,
      x: 100,
      y: 100,
      width: 50,
      height: 50,
    }),
  });

  // Create placement in floorplan 2
  await testRequest(`/api/placements?floorplan_id=${floorplan2.id}`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      floorplan_id: floorplan2.id,
      item_variant_id: variant2.id,
      x: 200,
      y: 200,
      width: 50,
      height: 50,
    }),
  });

  // Get project total
  const totalResponse = await testRequest(`/api/projects/${project.id}/total`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
    },
  });

  assertEquals(totalResponse.status, 200);
  const totalData = await parseJSON(totalResponse);
  assertExists(totalData.data);
  assertEquals(totalData.data.totalPrice, 800.00); // 300 + 500
});

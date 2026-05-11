import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { itemRepository } = await import('../../src/repositories/item.ts');
const { itemVariantRepository } = await import('../../src/repositories/item-variant.ts');
const { itemTypeRepository } = await import('../../src/repositories/item-type.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');
const { floorplanRepository } = await import('../../src/repositories/floorplan.ts');
const { bomEntryRepository } = await import('../../src/repositories/bom-entry.ts');

async function getAdminToken(): Promise<string> {
  clearDatabase();

  const passwordHash = hashPassword('admin123');
  await userRepository.create({
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
    tenant_id: 1,
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'admin123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  return loginData.data.accessToken;
}

// ==========================================
// 1. Items filtered by type_id
// ==========================================

Deno.test('GET /items?type_id=X - should only return items of that type', async () => {
  const token = await getAdminToken();

  const category = await categoryRepository.create({ name: 'Smart Home' });
  const sensorType = await itemTypeRepository.create({ name: 'Sensor', abbreviation: 'SEN' });
  const actuatorType = await itemTypeRepository.create({ name: 'Actuator', abbreviation: 'ACT' });

  await itemRepository.create({
    category_id: category.id,
    name: 'Motion Sensor',
    base_model_number: 'MS-100',
    type_id: sensorType.id,
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Temperature Sensor',
    base_model_number: 'TS-100',
    type_id: sensorType.id,
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Relay',
    base_model_number: 'SR-100',
    type_id: actuatorType.id,
  });

  // Filter by sensor type
  const response = await testRequest(`/api/items?type_id=${sensorType.id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 2);
  assertEquals(data.data[0].type_id, sensorType.id);
  assertEquals(data.data[1].type_id, sensorType.id);

  // Filter by actuator type
  const response2 = await testRequest(`/api/items?type_id=${actuatorType.id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data2 = await parseJSON(response2);

  assertEquals(response2.status, 200);
  assertEquals(data2.data.length, 1);
  assertEquals(data2.data[0].name, 'Smart Relay');
});

// ==========================================
// 2. Item create requires type_id
// ==========================================

Deno.test('POST /items - should return 400 without type_id', async () => {
  const token = await getAdminToken();

  const category = await categoryRepository.create({ name: 'Lighting' });

  const response = await testRequest('/api/items', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category_id: category.id,
      name: 'Missing Type Item',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertExists(data.error);
  assertEquals(data.error, 'Missing required fields: category_id, type_id, name');
});

// ==========================================
// 3. Item create with type_id
// ==========================================

Deno.test('POST /items - should succeed with type_id and return type info', async () => {
  const token = await getAdminToken();

  const category = await categoryRepository.create({ name: 'Lighting' });
  const itemType = await itemTypeRepository.create({ name: 'Zigbee', abbreviation: 'ZIG', color: '#00ff00' });

  const response = await testRequest('/api/items', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category_id: category.id,
      name: 'Zigbee Bulb',
      base_model_number: 'ZB-100',
      type_id: itemType.id,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertExists(data.data);
  assertEquals(data.data.name, 'Zigbee Bulb');
  assertEquals(data.data.type_id, itemType.id);

  // Verify type info is returned when fetching item
  const getResponse = await testRequest(`/api/items/${data.data.id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const getData = await parseJSON(getResponse);

  assertEquals(getResponse.status, 200);
  assertEquals(getData.data.type_name, 'Zigbee');
  assertEquals(getData.data.type_abbreviation, 'ZIG');
  assertEquals(getData.data.type_color, '#00ff00');
});

// ==========================================
// 4. Excel sync requires type_id
// ==========================================

Deno.test('POST /items/sync-catalog - should return 400 without type_id', async () => {
  const token = await getAdminToken();

  // Build a minimal valid XLSX file (ZIP with PK magic bytes)
  // XLSX files are ZIP archives; the upload middleware validates magic bytes (PK\x03\x04)
  const pkHeader = new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
  const padding = new Uint8Array(100); // Enough bytes to pass size checks
  const xlsxBytes = new Uint8Array(pkHeader.length + padding.length);
  xlsxBytes.set(pkHeader, 0);
  xlsxBytes.set(padding, pkHeader.length);

  const blob = new Blob([xlsxBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('file', blob, 'catalog.xlsx');

  const response = await testRequest('/api/items/sync-catalog', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertEquals(data.error, 'type_id is required');
});

// ==========================================
// 5. Project create gets default item types
// ==========================================

Deno.test('POST /projects - should auto-assign all active item types when none specified', async () => {
  const token = await getAdminToken();

  // Create some item types
  const type1 = await itemTypeRepository.create({ name: 'Zigbee', abbreviation: 'ZIG' });
  const type2 = await itemTypeRepository.create({ name: 'Z-Wave', abbreviation: 'ZW' });
  await itemTypeRepository.create({ name: 'Inactive', abbreviation: 'INA', is_active: false });

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      group_name: 'Test Project',
      customer_name: 'Test Customer',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertExists(data.data.item_type_ids);
  // Should have both active types but not the inactive one
  assertEquals(data.data.item_type_ids.length, 2);
  assertEquals(data.data.item_type_ids.includes(type1.id), true);
  assertEquals(data.data.item_type_ids.includes(type2.id), true);
});

// ==========================================
// 6. Project update item_type_ids
// ==========================================

Deno.test('PUT /projects/:id - should update item_type_ids in junction table', async () => {
  const token = await getAdminToken();

  const type1 = await itemTypeRepository.create({ name: 'Zigbee', abbreviation: 'ZIG' });
  const type2 = await itemTypeRepository.create({ name: 'Z-Wave', abbreviation: 'ZW' });
  const type3 = await itemTypeRepository.create({ name: 'WiFi', abbreviation: 'WF' });

  // Create project (gets all 3 types by default)
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      group_name: 'Update Types Project',
      customer_name: 'Test Customer',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;
  assertEquals(createData.data.item_type_ids.length, 3);

  // Update to only type1 and type3
  const updateResponse = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      item_type_ids: [type1.id, type3.id],
    }),
  });

  const updateData = await parseJSON(updateResponse);

  assertEquals(updateResponse.status, 200);
  assertExists(updateData.data.item_type_ids);
  assertEquals(updateData.data.item_type_ids.length, 2);
  assertEquals(updateData.data.item_type_ids.includes(type1.id), true);
  assertEquals(updateData.data.item_type_ids.includes(type3.id), true);
  assertEquals(updateData.data.item_type_ids.includes(type2.id), false);
});

// ==========================================
// 7. BOM entry snapshots item_type_name
// ==========================================

Deno.test('POST /placements - BOM entry should snapshot item_type_name', async () => {
  const token = await getAdminToken();

  // Create item type
  const itemType = await itemTypeRepository.create({ name: 'Zigbee', abbreviation: 'ZIG' });

  // Create category and item
  const category = await categoryRepository.create({ name: 'Sensors' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Motion Sensor',
    base_model_number: 'MS-100',
    type_id: itemType.id,
  });

  // Create variant
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 39.99,
  });

  // Create project and floorplan
  const project = await projectRepository.create({
    group_name: 'BOM Test Project',
    customer_name: 'BOM Customer',
    tenant_id: 1,
  });
  const floorplan = await floorplanRepository.create({
    project_id: project.id,
    name: 'Ground Floor',
    image_path: 'floorplans/test.jpg',
  });

  // Create placement (which creates BOM entry)
  const response = await testRequest('/api/placements', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      floorplan_id: floorplan.id,
      item_variant_id: variant.id,
      x: 100,
      y: 200,
      width: 50,
      height: 50,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertExists(data.data);

  // Verify the BOM entry has the item_type_name snapshot
  const bomEntries = await bomEntryRepository.findByFloorplan(floorplan.id);
  assertEquals(bomEntries.length >= 1, true);

  const mainEntry = bomEntries.find(e => e.item_name === 'Motion Sensor');
  assertExists(mainEntry);
  assertEquals(mainEntry.item_type_name, 'Zigbee');
});

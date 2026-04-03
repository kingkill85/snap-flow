import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
const { itemTypeRepository } = await import('../../src/repositories/item-type.ts');
const { categoryRepository } = await import('../../src/repositories/category.ts');
const { getDb } = await import('../../src/config/database.ts');

async function getAdminToken(): Promise<string> {
  clearDatabase();

  // Create admin user
  const passwordHash = hashPassword('admin123');
  await userRepository.create({
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
    tenant_id: 1,
  });

  // Login as admin
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

Deno.test('GET /item-types - should list active item types', async () => {
  const token = await getAdminToken();

  // Create some item types
  await itemTypeRepository.create({ name: 'Sensor', abbreviation: 'SEN' });
  await itemTypeRepository.create({ name: 'Actuator', abbreviation: 'ACT' });
  await itemTypeRepository.create({ name: 'Inactive Type', abbreviation: 'INA', is_active: false });

  const response = await testRequest('/api/item-types', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);
  // Should only return active types (2 out of 3)
  assertEquals(data.data.length, 2);
});

Deno.test('POST /item-types - admin should create item type', async () => {
  const token = await getAdminToken();

  const response = await testRequest('/api/item-types', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Sensor',
      abbreviation: 'SEN',
      color: '#ff5733',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertExists(data.data);
  assertEquals(data.data.name, 'Sensor');
  assertEquals(data.data.abbreviation, 'SEN');
  assertEquals(data.data.color, '#ff5733');
  assertEquals(data.message, 'Item type created successfully');
});

Deno.test('POST /item-types - should reject duplicate name', async () => {
  const token = await getAdminToken();

  // Create first type
  await itemTypeRepository.create({ name: 'Sensor', abbreviation: 'SEN' });

  // Try to create duplicate
  const response = await testRequest('/api/item-types', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Sensor',
      abbreviation: 'SEN2',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertExists(data.error);
});

Deno.test('PUT /item-types/:id - should update item type', async () => {
  const token = await getAdminToken();

  const type = await itemTypeRepository.create({ name: 'Sensor', abbreviation: 'SEN' });

  const response = await testRequest(`/api/item-types/${type.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Smart Sensor',
      abbreviation: 'SS',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Smart Sensor');
  assertEquals(data.data.abbreviation, 'SS');
  assertEquals(data.message, 'Item type updated successfully');
});

Deno.test('DELETE /item-types/:id - should delete item type with no items', async () => {
  const token = await getAdminToken();

  const type = await itemTypeRepository.create({ name: 'To Delete', abbreviation: 'DEL' });

  const response = await testRequest(`/api/item-types/${type.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Item type deleted successfully');

  // Verify deletion
  const getResponse = await testRequest(`/api/item-types/${type.id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getResponse.status, 404);
});

Deno.test('DELETE /item-types/:id - should block delete if items exist', async () => {
  const token = await getAdminToken();

  const type = await itemTypeRepository.create({ name: 'Has Items', abbreviation: 'HI' });
  const category = await categoryRepository.create({ name: 'Test Category' });

  // Create an item referencing this type via direct SQL (repository.create doesn't support type_id yet)
  getDb().query(
    'INSERT INTO items (category_id, type_id, name, is_active) VALUES (?, ?, ?, ?)',
    [category.id, type.id, 'Test Item', true],
  );

  const response = await testRequest(`/api/item-types/${type.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertExists(data.error);
  assertEquals(data.error, 'Cannot delete item type that has items assigned to it');
});

Deno.test('PATCH /item-types/:id/deactivate - should deactivate item type', async () => {
  const token = await getAdminToken();

  const type = await itemTypeRepository.create({ name: 'Active Type', abbreviation: 'AT' });

  const response = await testRequest(`/api/item-types/${type.id}/deactivate`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Item type deactivated');
  assertEquals(Boolean(data.data.is_active), false);
});

Deno.test('PATCH /item-types/reorder - should reorder item types', async () => {
  const token = await getAdminToken();

  const type1 = await itemTypeRepository.create({ name: 'First', abbreviation: 'F', sort_order: 1 });
  const type2 = await itemTypeRepository.create({ name: 'Second', abbreviation: 'S', sort_order: 2 });
  const type3 = await itemTypeRepository.create({ name: 'Third', abbreviation: 'T', sort_order: 3 });

  // Reorder: Third first, First second, Second third
  const response = await testRequest('/api/item-types/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      ids: [type3.id, type1.id, type2.id],
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);

  // Verify order
  const types = await itemTypeRepository.findAll(true);
  assertEquals(types[0].id, type3.id);
  assertEquals(types[1].id, type1.id);
  assertEquals(types[2].id, type2.id);
});

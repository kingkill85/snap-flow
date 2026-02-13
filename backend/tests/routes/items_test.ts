import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { categoryRepository } from '../../src/repositories/category.ts';
import { itemRepository } from '../../src/repositories/item.ts';
import { hashPassword } from '../../src/services/password.ts';

const BASE_URL = 'http://localhost:8000';

async function getAdminToken(): Promise<string> {
  clearDatabase();
  
  const passwordHash = await hashPassword('admin123');
  await userRepository.create({
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
  });

  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@example.com',
      password: 'admin123',
    }),
  });

  const loginData = await loginResponse.json();
  return loginData.data.token;
}

Deno.test('GET /items - should list all items (public)', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    price: 29.99,
    description: 'A smart light bulb',
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    price: 49.99,
  });

  const response = await fetch(`${BASE_URL}/api/items`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(data.data.length, 2);
  assertExists(data.pagination);
  assertEquals(data.pagination.page, 1);
});

Deno.test('GET /items - should filter by category', async () => {
  clearDatabase();
  
  const cat1 = await categoryRepository.create({ name: 'Lighting' });
  const cat2 = await categoryRepository.create({ name: 'Security' });
  
  await itemRepository.create({
    category_id: cat1.id,
    name: 'Smart Bulb',
    price: 29.99,
  });
  await itemRepository.create({
    category_id: cat2.id,
    name: 'Security Camera',
    price: 199.99,
  });

  const response = await fetch(`${BASE_URL}/api/items?category_id=${cat1.id}`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, 'Smart Bulb');
});

Deno.test('GET /items - should search items', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb Pro',
    price: 39.99,
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    price: 49.99,
  });

  const response = await fetch(`${BASE_URL}/api/items?search=Bulb`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, 'Smart Bulb Pro');
});

Deno.test('GET /items/:id - should get single item', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    price: 29.99,
  });

  const response = await fetch(`${BASE_URL}/api/items/${item.id}`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.id, item.id);
  assertEquals(data.data.name, 'Smart Bulb');
  assertEquals(data.data.price, 29.99);
});

Deno.test('GET /items/:id - should return 404 for non-existent item', async () => {
  clearDatabase();
  
  const response = await fetch(`${BASE_URL}/api/items/99999`);
  const data = await response.json();

  assertEquals(response.status, 404);
  assertExists(data.error);
});

Deno.test('POST /items - should require authentication', async () => {
  const formData = new FormData();
  formData.append('category_id', '1');
  formData.append('name', 'Test Item');
  formData.append('price', '99.99');

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    body: formData,
  });

  assertEquals(response.status, 401);
});

Deno.test('POST /items - should require admin role', async () => {
  clearDatabase();
  
  // Create regular user
  const passwordHash = await hashPassword('user123');
  await userRepository.create({
    email: 'user@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'user123',
    }),
  });
  const loginData = await loginResponse.json();
  const token = loginData.data.token;

  const formData = new FormData();
  formData.append('category_id', '1');
  formData.append('name', 'Test Item');
  formData.append('price', '99.99');

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  assertEquals(response.status, 403);
});

Deno.test('POST /items - should create item without image (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });

  const formData = new FormData();
  formData.append('category_id', category.id.toString());
  formData.append('name', 'Smart Switch');
  formData.append('description', 'A smart wall switch');
  formData.append('model_number', 'SS-100');
  formData.append('dimensions', '120x80mm');
  formData.append('price', '49.99');

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  assertEquals(response.status, 201);
  assertExists(data.data);
  assertEquals(data.data.name, 'Smart Switch');
  assertEquals(data.data.price, 49.99);
  assertEquals(data.data.category_id, category.id);
  assertEquals(data.message, 'Item created successfully');
});

Deno.test('POST /items - should reject invalid category', async () => {
  const token = await getAdminToken();

  const formData = new FormData();
  formData.append('category_id', '99999');
  formData.append('name', 'Test Item');
  formData.append('price', '99.99');

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  assertEquals(response.status, 400);
  assertExists(data.error);
});

Deno.test('POST /items - should require all mandatory fields', async () => {
  const token = await getAdminToken();

  const formData = new FormData();
  formData.append('name', 'Test Item');
  // Missing category_id and price

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  assertEquals(response.status, 400);
});

Deno.test('PUT /items/:id - should update item (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Old Name',
    price: 29.99,
  });

  const formData = new FormData();
  formData.append('name', 'Updated Name');
  formData.append('price', '39.99');

  const response = await fetch(`${BASE_URL}/api/items/${item.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Updated Name');
  assertEquals(data.data.price, 39.99);
  assertEquals(data.message, 'Item updated successfully');
});

Deno.test('DELETE /items/:id - should delete item (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'To Delete',
    price: 29.99,
  });

  const response = await fetch(`${BASE_URL}/api/items/${item.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Item deleted successfully');

  // Verify deletion
  const getResponse = await fetch(`${BASE_URL}/api/items/${item.id}`);
  assertEquals(getResponse.status, 404);
});

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { categoryRepository } from '../../src/repositories/category.ts';
import { hashPassword } from '../../src/services/password.ts';

const BASE_URL = 'http://localhost:8000';

async function getAdminToken(): Promise<string> {
  clearDatabase();
  
  // Create admin user
  const passwordHash = await hashPassword('admin123');
  await userRepository.create({
    email: 'admin@example.com',
    password_hash: passwordHash,
    role: 'admin',
  });

  // Login as admin
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

async function getUserToken(): Promise<string> {
  clearDatabase();
  
  // Create regular user
  const passwordHash = await hashPassword('user123');
  await userRepository.create({
    email: 'user@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Login as user
  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'user123',
    }),
  });

  const loginData = await loginResponse.json();
  return loginData.data.token;
}

Deno.test('GET /categories - should list all categories (public)', async () => {
  clearDatabase();
  
  // Create some categories
  await categoryRepository.create({ name: 'Lighting' });
  await categoryRepository.create({ name: 'Security' });
  await categoryRepository.create({ name: 'Climate Control' });

  const response = await fetch(`${BASE_URL}/api/categories`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(data.data.length, 3);
});

Deno.test('GET /categories/:id - should get single category', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });

  const response = await fetch(`${BASE_URL}/api/categories/${category.id}`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.id, category.id);
  assertEquals(data.data.name, 'Lighting');
});

Deno.test('GET /categories/:id - should return 404 for non-existent category', async () => {
  clearDatabase();
  
  const response = await fetch(`${BASE_URL}/api/categories/99999`);
  const data = await response.json();

  assertEquals(response.status, 404);
  assertExists(data.error);
});

Deno.test('POST /categories - should create category (admin only)', async () => {
  const token = await getAdminToken();

  const response = await fetch(`${BASE_URL}/api/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Smart Locks',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 201);
  assertExists(data.data);
  assertEquals(data.data.name, 'Smart Locks');
  assertExists(data.data.id);
  assertEquals(data.message, 'Category created successfully');
});

Deno.test('POST /categories - should reject non-admin users', async () => {
  const token = await getUserToken();

  const response = await fetch(`${BASE_URL}/api/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Smart Locks',
    }),
  });

  assertEquals(response.status, 403);
});

Deno.test('POST /categories - should reject duplicate category names', async () => {
  const token = await getAdminToken();
  
  // Create first category
  await categoryRepository.create({ name: 'Lighting' });

  // Try to create duplicate
  const response = await fetch(`${BASE_URL}/api/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Lighting',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 400);
  assertExists(data.error);
});

Deno.test('PUT /categories/:id - should update category (admin only)', async () => {
  const token = await getAdminToken();
  
  const category = await categoryRepository.create({ name: 'Lighting' });

  const response = await fetch(`${BASE_URL}/api/categories/${category.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Smart Lighting',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Smart Lighting');
  assertEquals(data.message, 'Category updated successfully');
});

Deno.test('PUT /categories/:id - should return 404 for non-existent category', async () => {
  const token = await getAdminToken();

  const response = await fetch(`${BASE_URL}/api/categories/99999`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'New Name',
    }),
  });

  assertEquals(response.status, 404);
});

Deno.test('DELETE /categories/:id - should delete category (admin only)', async () => {
  const token = await getAdminToken();
  
  const category = await categoryRepository.create({ name: 'To Delete' });

  const response = await fetch(`${BASE_URL}/api/categories/${category.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Category deleted successfully');

  // Verify deletion
  const getResponse = await fetch(`${BASE_URL}/api/categories/${category.id}`);
  assertEquals(getResponse.status, 404);
});

Deno.test('PATCH /categories/reorder - should reorder categories (admin only)', async () => {
  const token = await getAdminToken();
  
  const cat1 = await categoryRepository.create({ name: 'First', sort_order: 1 });
  const cat2 = await categoryRepository.create({ name: 'Second', sort_order: 2 });
  const cat3 = await categoryRepository.create({ name: 'Third', sort_order: 3 });

  // Reorder: put Third first, First second, Second third
  const response = await fetch(`${BASE_URL}/api/categories/reorder`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      category_ids: [cat3.id, cat1.id, cat2.id],
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Categories reordered successfully');
  
  // Verify order
  const categories = await categoryRepository.findAll();
  assertEquals(categories[0].id, cat3.id);
  assertEquals(categories[1].id, cat1.id);
  assertEquals(categories[2].id, cat2.id);
});

Deno.test('POST /categories - should require authentication', async () => {
  const response = await fetch(`${BASE_URL}/api/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test' }),
  });

  assertEquals(response.status, 401);
});

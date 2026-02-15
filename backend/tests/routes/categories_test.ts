import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
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
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'user123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  return loginData.data.accessToken;
}

Deno.test('GET /categories - should list all categories (public)', async () => {
  clearDatabase();
  
  // Create some categories
  await categoryRepository.create({ name: 'Lighting' });
  await categoryRepository.create({ name: 'Security' });
  await categoryRepository.create({ name: 'Climate Control' });

  const response = await testRequest('/api/categories');
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(data.data.length, 3);
});

Deno.test('GET /categories/:id - should get single category', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });

  const response = await testRequest(`/api/categories/${category.id}`);
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.id, category.id);
  assertEquals(data.data.name, 'Lighting');
});

Deno.test('GET /categories/:id - should return 404 for non-existent category', async () => {
  clearDatabase();
  
  const response = await testRequest('/api/categories/99999');
  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertExists(data.error);
});

Deno.test('POST /categories - should create category (admin only)', async () => {
  const token = await getAdminToken();

  const response = await testRequest('/api/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Smart Locks',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertExists(data.data);
  assertEquals(data.data.name, 'Smart Locks');
  assertExists(data.data.id);
  assertEquals(data.message, 'Category created successfully');
});

Deno.test('POST /categories - should reject non-admin users', async () => {
  const token = await getUserToken();

  const response = await testRequest('/api/categories', {
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
  const response = await testRequest('/api/categories', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Lighting',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertExists(data.error);
});

Deno.test('PUT /categories/:id - should update category (admin only)', async () => {
  const token = await getAdminToken();
  
  const category = await categoryRepository.create({ name: 'Lighting' });

  const response = await testRequest(`/api/categories/${category.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Smart Lighting',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Smart Lighting');
  assertEquals(data.message, 'Category updated successfully');
});

Deno.test('PUT /categories/:id - should return 404 for non-existent category', async () => {
  const token = await getAdminToken();

  const response = await testRequest('/api/categories/99999', {
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

  const response = await testRequest(`/api/categories/${category.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Category deleted successfully');

  // Verify deletion
  const getResponse = await testRequest(`/api/categories/${category.id}`);
  assertEquals(getResponse.status, 404);
});

Deno.test('PATCH /categories/reorder - should reorder categories (admin only)', async () => {
  const token = await getAdminToken();
  
  const cat1 = await categoryRepository.create({ name: 'First', sort_order: 1 });
  const cat2 = await categoryRepository.create({ name: 'Second', sort_order: 2 });
  const cat3 = await categoryRepository.create({ name: 'Third', sort_order: 3 });

  // Reorder: put Third first, First second, Second third
  const response = await testRequest('/api/categories/reorder', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      category_ids: [cat3.id, cat1.id, cat2.id],
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Categories reordered successfully');
  
  // Verify order
  const categories = await categoryRepository.findAll();
  assertEquals(categories[0].id, cat3.id);
  assertEquals(categories[1].id, cat1.id);
  assertEquals(categories[2].id, cat2.id);
});

Deno.test('PUT /categories/:id - should deactivate category and cascade to items and variants', async () => {
  clearDatabase();
  
  // Create admin user
  const passwordHash = await hashPassword('admin123');
  const admin = await userRepository.create({
    email: 'admin@test.com',
    password_hash: passwordHash,
    role: 'admin',
  });

  // Login
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@test.com',
      password: 'admin123',
    }),
  });
  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Create category
  const category = await categoryRepository.create({ name: 'Test Category' });
  
  // Create item in category
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Item',
    base_model_number: 'TI-001',
  });
  
  // Create variants for item
  const variant1 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 10,
    is_active: true,
  });
  const variant2 = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Black',
    price: 10,
    is_active: true,
  });

  // Verify everything is active initially (SQLite returns 1 for true)
  assertEquals(Boolean(category.is_active), true);
  assertEquals(Boolean(item.is_active), true);
  assertEquals(Boolean(variant1.is_active), true);
  assertEquals(Boolean(variant2.is_active), true);

  // Deactivate category
  const response = await testRequest(`/api/categories/${category.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      is_active: false,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Category deactivated successfully. All items and variants in this category have been deactivated.');
  
  // Verify cascade deactivation
  const updatedCategory = await categoryRepository.findById(category.id);
  const updatedItem = await itemRepository.findById(item.id);
  const updatedVariant1 = await itemVariantRepository.findById(variant1.id);
  const updatedVariant2 = await itemVariantRepository.findById(variant2.id);
  
  assertEquals(Boolean(updatedCategory?.is_active), false);
  assertEquals(Boolean(updatedItem?.is_active), false);
  assertEquals(Boolean(updatedVariant1?.is_active), false);
  assertEquals(Boolean(updatedVariant2?.is_active), false);
});

Deno.test('PUT /categories/:id - should activate category without cascading to children', async () => {
  clearDatabase();
  
  // Create admin user
  const passwordHash = await hashPassword('admin123');
  const admin = await userRepository.create({
    email: 'admin@test.com',
    password_hash: passwordHash,
    role: 'admin',
  });

  // Login
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@test.com',
      password: 'admin123',
    }),
  });
  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Create inactive category
  const category = await categoryRepository.create({ 
    name: 'Test Category',
    is_active: false,
  });
  
  // Create inactive item in category
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Test Item',
    base_model_number: 'TI-001',
    is_active: false,
  });

  // Activate category
  const response = await testRequest(`/api/categories/${category.id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      is_active: true,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  
  // Verify only category is activated, item stays inactive
  const updatedCategory = await categoryRepository.findById(category.id);
  const updatedItem = await itemRepository.findById(item.id);
  
  assertEquals(Boolean(updatedCategory?.is_active), true);
  assertEquals(Boolean(updatedItem?.is_active), false); // Item should stay inactive
});

Deno.test('POST /categories - should require authentication', async () => {
  const response = await testRequest('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test' }),
  });

  assertEquals(response.status, 401);
});

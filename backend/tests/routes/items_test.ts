import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { categoryRepository } from '../../src/repositories/category.ts';
import { itemRepository } from '../../src/repositories/item.ts';
import { itemVariantRepository } from '../../src/repositories/item-variant.ts';
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
    base_model_number: 'SB-100',
    description: 'A smart light bulb',
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-200',
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
    base_model_number: 'SB-100',
  });
  await itemRepository.create({
    category_id: cat2.id,
    name: 'Security Camera',
    base_model_number: 'SC-100',
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
    base_model_number: 'SB-PRO',
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-200',
  });

  const response = await fetch(`${BASE_URL}/api/items?search=Bulb`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, 'Smart Bulb Pro');
});

Deno.test('GET /items/:id - should get single item with variants', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
  });
  
  // Create a variant
  await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });

  const response = await fetch(`${BASE_URL}/api/items/${item.id}`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.id, item.id);
  assertEquals(data.data.name, 'Smart Bulb');
  assertExists(data.data.variants);
  assertEquals(data.data.variants.length, 1);
  assertEquals(data.data.variants[0].style_name, 'White');
  assertEquals(data.data.variants[0].price, 29.99);
});

Deno.test('GET /items/:id - should return 404 for non-existent item', async () => {
  clearDatabase();
  
  const response = await fetch(`${BASE_URL}/api/items/99999`);
  const data = await response.json();

  assertEquals(response.status, 404);
  assertExists(data.error);
});

Deno.test('POST /items - should require authentication', async () => {
  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      category_id: 1,
      name: 'Test Item',
    }),
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

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category_id: 1,
      name: 'Test Item',
    }),
  });

  assertEquals(response.status, 403);
});

Deno.test('POST /items - should create base item (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category_id: category.id,
      name: 'Smart Switch',
      description: 'A smart wall switch',
      base_model_number: 'SS-100',
      dimensions: '120x80mm',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 201);
  assertExists(data.data);
  assertEquals(data.data.name, 'Smart Switch');
  assertEquals(data.data.base_model_number, 'SS-100');
  assertEquals(data.data.category_id, category.id);
  assertEquals(data.message, 'Item created successfully');
});

Deno.test('POST /items - should reject invalid category', async () => {
  const token = await getAdminToken();

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category_id: 99999,
      name: 'Test Item',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 400);
  assertExists(data.error);
});

Deno.test('POST /items - should require mandatory fields', async () => {
  const token = await getAdminToken();

  const response = await fetch(`${BASE_URL}/api/items`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Test Item',
      // Missing category_id
    }),
  });

  assertEquals(response.status, 400);
});

Deno.test('PUT /items/:id - should update item (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Old Name',
    base_model_number: 'ON-100',
  });

  const response = await fetch(`${BASE_URL}/api/items/${item.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Updated Name',
      base_model_number: 'UN-100',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Updated Name');
  assertEquals(data.data.base_model_number, 'UN-100');
  assertEquals(data.message, 'Item updated successfully');
});

Deno.test('DELETE /items/:id - should delete item and variants (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'To Delete',
    base_model_number: 'TD-100',
  });
  
  // Create a variant
  await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
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
  assertEquals(data.message, 'Item and all variants deleted successfully');

  // Verify deletion
  const getResponse = await fetch(`${BASE_URL}/api/items/${item.id}`);
  assertEquals(getResponse.status, 404);
});

// ==========================================
// VARIANT TESTS
// ==========================================

Deno.test('GET /items/:id/variants - should list variants', async () => {
  clearDatabase();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
  });
  
  await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });
  await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Black',
    price: 29.99,
  });

  const response = await fetch(`${BASE_URL}/api/items/${item.id}/variants`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 2);
  assertEquals(data.data[0].style_name, 'White');
  assertEquals(data.data[1].style_name, 'Black');
});

Deno.test('POST /items/:id/variants - should create variant (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
  });

  const formData = new FormData();
  formData.append('style_name', 'Silver');
  formData.append('price', '34.99');

  const response = await fetch(`${BASE_URL}/api/items/${item.id}/variants`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  assertEquals(response.status, 201);
  assertEquals(data.data.style_name, 'Silver');
  assertEquals(data.data.price, 34.99);
});

Deno.test('DELETE /items/:id/variants/:variantId - should delete variant (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });

  const response = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Variant deleted successfully');
});

// ==========================================
// VARIANT UPDATE TESTS (including image removal)
// ==========================================

Deno.test('PUT /items/:id/variants/:variantId - should update variant (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });

  const formData = new FormData();
  formData.append('style_name', 'Off-White');
  formData.append('price', '32.99');

  const response = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.style_name, 'Off-White');
  assertEquals(data.data.price, 32.99);
  assertEquals(data.message, 'Variant updated successfully');
});

Deno.test('PUT /items/:id/variants/:variantId - should remove image when flag is set (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
    image_path: 'items/test-image.jpg',
  });

  const formData = new FormData();
  formData.append('style_name', 'White');
  formData.append('price', '29.99');
  formData.append('remove_image', 'true');

  const response = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.data.image_path, null);
  assertEquals(data.message, 'Variant updated successfully');
});

// ==========================================
// VARIANT ADDON TESTS
// ==========================================

Deno.test('GET /items/:id/variants/:variantId/addons - should list variant addons', async () => {
  clearDatabase();
  const category = await categoryRepository.create({ name: 'Lighting' });
  
  // Create main item with variant
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-100',
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 49.99,
  });
  
  // Create addon item with variant
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Wall Plate',
    base_model_number: 'WP-100',
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  // Add addon relationship
  const response1 = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${await getAdminToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_optional: true,
    }),
  });
  assertEquals(response1.status, 201);

  // List addons
  const response2 = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}/addons`, {
    headers: {
      'Authorization': `Bearer ${await getAdminToken()}`,
    },
  });
  const data = await response2.json();

  assertEquals(response2.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].addon_variant_id, addonVariant.id);
  assertEquals(data.data[0].is_optional, true);
});

Deno.test('POST /items/:id/variants/:variantId/addons - should add addon (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-100',
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 49.99,
  });
  
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Wall Plate',
    base_model_number: 'WP-100',
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  const response = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_optional: false,
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 201);
  assertEquals(data.data.addon_variant_id, addonVariant.id);
  assertEquals(data.data.is_optional, false);
  assertEquals(data.message, 'Add-on added successfully');
});

Deno.test('DELETE /items/:id/variants/:variantId/addons/:addonId - should remove addon (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-100',
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 49.99,
  });
  
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Wall Plate',
    base_model_number: 'WP-100',
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  // Add addon first
  const response1 = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_optional: true,
    }),
  });
  const addonData = await response1.json();
  const addonId = addonData.data.id;

  // Now delete it
  const response2 = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}/addons/${addonId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await response2.json();

  assertEquals(response2.status, 200);
  assertEquals(data.message, 'Add-on removed successfully');
});

Deno.test('POST /items/:id/variants/:variantId/addons - should reject duplicate addons', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-100',
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 49.99,
  });
  
  const addonItem = await itemRepository.create({
    category_id: category.id,
    name: 'Wall Plate',
    base_model_number: 'WP-100',
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  // Add addon first time
  await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_optional: true,
    }),
  });

  // Try to add same addon again
  const response = await fetch(`${BASE_URL}/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_optional: true,
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 409);
  assertExists(data.error);
});

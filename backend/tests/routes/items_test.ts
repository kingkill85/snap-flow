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

async function createNonAdminToken(email: string): Promise<string> {
  const passwordHash = hashPassword('user123');
  await userRepository.create({
    email,
    password_hash: passwordHash,
    role: 'user',
    tenant_id: 1,
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'user123' }),
  });

  const loginData = await parseJSON(loginResponse);
  return loginData.data.accessToken;
}

Deno.test('GET /items - should list all items (public)', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
    description: 'A smart light bulb',
    type_id: 1,
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-200',
    type_id: 1,
  });

  const response = await testRequest('/api/items');
  const data = await parseJSON(response);

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
    type_id: 1,
  });
  await itemRepository.create({
    category_id: cat2.id,
    name: 'Security Camera',
    base_model_number: 'SC-100',
    type_id: 1,
  });

  const response = await testRequest(`/api/items?category_id=${cat1.id}`);
  const data = await parseJSON(response);

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
    type_id: 1,
  });
  await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-200',
    type_id: 1,
  });

  const response = await testRequest('/api/items?search=Bulb');
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, 'Smart Bulb Pro');
});

Deno.test('GET /items - admin include_inactive returns inactive items', async () => {
  const token = await getAdminToken();
  const nonAdminToken = await createNonAdminToken('user-items@example.com');
  const category = await categoryRepository.create({ name: 'Lighting' });
  await itemRepository.create({
    category_id: category.id,
    name: 'Active Product',
    base_model_number: 'ACTIVE-1',
    type_id: 1,
  });
  const inactiveItem = await itemRepository.create({
    category_id: category.id,
    name: 'Inactive Product',
    base_model_number: 'INACTIVE-1',
    type_id: 1,
  });
  const inactivePreviewVariant = await itemVariantRepository.create({
    item_id: inactiveItem.id,
    style_name: 'Inactive Style',
    price: 20,
    image_path: 'items/inactive-preview.png',
  });
  await itemRepository.deactivate(inactiveItem.id);

  const inactivePreviewVariantAfterDeactivation = await itemVariantRepository.findById(inactivePreviewVariant.id);
  assertExists(inactivePreviewVariantAfterDeactivation);
  assertEquals(Boolean(inactivePreviewVariantAfterDeactivation.is_active), false);

  const publicResponse = await testRequest('/api/items?include_inactive=true');
  const publicData = await parseJSON(publicResponse);
  assertEquals(publicResponse.status, 200);
  assertEquals(publicData.data.map((item: { name: string }) => item.name), ['Active Product']);

  const nonAdminResponse = await testRequest('/api/items?include_inactive=true', {
    headers: { Authorization: `Bearer ${nonAdminToken}` },
  });
  const nonAdminData = await parseJSON(nonAdminResponse);
  assertEquals(nonAdminResponse.status, 200);
  assertEquals(nonAdminData.data.map((item: { name: string }) => item.name), ['Active Product']);

  const invalidTokenResponse = await testRequest('/api/items?include_inactive=true', {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  const invalidTokenData = await parseJSON(invalidTokenResponse);
  assertEquals(invalidTokenResponse.status, 200);
  assertEquals(invalidTokenData.data.map((item: { name: string }) => item.name), ['Active Product']);

  const adminResponse = await testRequest('/api/items?include_inactive=true', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const adminData = await parseJSON(adminResponse);
  assertEquals(adminResponse.status, 200);
  assertEquals(adminData.data.length, 2);
  assertEquals(adminData.data.some((item: { id: number }) => item.id === inactiveItem.id), true);
  const returnedInactiveItem = adminData.data.find((item: { id: number }) => item.id === inactiveItem.id);
  assertEquals(returnedInactiveItem.preview_image, 'items/inactive-preview.png');

  const inactiveItemAfter = await itemRepository.findById(inactiveItem.id);
  const inactivePreviewVariantAfter = await itemVariantRepository.findById(inactivePreviewVariant.id);
  assertExists(inactiveItemAfter);
  assertExists(inactivePreviewVariantAfter);
  assertEquals(Boolean(inactiveItemAfter.is_active), false);
  assertEquals(Boolean(inactivePreviewVariantAfter.is_active), false);
});

Deno.test('GET /items/:id - should get single item with variants', async () => {
  clearDatabase();
  
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
    type_id: 1,
  });
  
  // Create a variant
  await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });

  const response = await testRequest(`/api/items/${item.id}`);
  const data = await parseJSON(response);

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
  
  const response = await testRequest('/api/items/99999');
  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertExists(data.error);
});

Deno.test('POST /items - should require authentication', async () => {
  const response = await testRequest('/api/items', {
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
  const passwordHash = hashPassword('user123');
  await userRepository.create({
    email: 'user@example.com',
    password_hash: passwordHash,
    role: 'user',
    tenant_id: 1,
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'user@example.com',
      password: 'user123',
    }),
  });
  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  const response = await testRequest('/api/items', {
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

  const response = await testRequest('/api/items', {
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
      type_id: 1,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertExists(data.data);
  assertEquals(data.data.name, 'Smart Switch');
  assertEquals(data.data.base_model_number, 'SS-100');
  assertEquals(data.data.category_id, category.id);
  assertEquals(data.message, 'Item created successfully');
});

Deno.test('POST /items - should reject invalid category', async () => {
  const token = await getAdminToken();

  const response = await testRequest('/api/items', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      category_id: 99999,
      name: 'Test Item',
      type_id: 1,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertExists(data.error);
});

Deno.test('POST /items - should require mandatory fields', async () => {
  const token = await getAdminToken();

  const response = await testRequest('/api/items', {
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
    type_id: 1,
  });

  const response = await testRequest(`/api/items/${item.id}`, {
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

  const data = await parseJSON(response);

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
    type_id: 1,
  });
  
  // Create a variant
  await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });

  const response = await testRequest(`/api/items/${item.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.message, 'Item and all variants deleted successfully');

  // Verify deletion
  const getResponse = await testRequest(`/api/items/${item.id}`);
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
    type_id: 1,
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

  const response = await testRequest(`/api/items/${item.id}/variants`);
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 2);
  assertEquals(data.data[0].style_name, 'White');
  assertEquals(data.data[1].style_name, 'Black');
});

Deno.test('GET /items/:id/variants - admin include_inactive returns inactive variants', async () => {
  const token = await getAdminToken();
  const nonAdminToken = await createNonAdminToken('user-variants@example.com');
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Product',
    base_model_number: 'PRODUCT-1',
    type_id: 1,
  });
  await itemVariantRepository.create({ item_id: item.id, style_name: 'Active Style', price: 10 });
  const inactiveVariant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Inactive Style',
    price: 20,
  });
  await itemVariantRepository.deactivate(inactiveVariant.id);

  const publicResponse = await testRequest(`/api/items/${item.id}/variants?include_inactive=true`);
  const publicData = await parseJSON(publicResponse);
  assertEquals(publicResponse.status, 200);
  assertEquals(publicData.data.map((variant: { style_name: string }) => variant.style_name), ['Active Style']);

  const nonAdminResponse = await testRequest(`/api/items/${item.id}/variants?include_inactive=true`, {
    headers: { Authorization: `Bearer ${nonAdminToken}` },
  });
  const nonAdminData = await parseJSON(nonAdminResponse);
  assertEquals(nonAdminResponse.status, 200);
  assertEquals(nonAdminData.data.map((variant: { style_name: string }) => variant.style_name), ['Active Style']);

  const invalidTokenResponse = await testRequest(`/api/items/${item.id}/variants?include_inactive=true`, {
    headers: { Authorization: 'Bearer invalid-token' },
  });
  const invalidTokenData = await parseJSON(invalidTokenResponse);
  assertEquals(invalidTokenResponse.status, 200);
  assertEquals(invalidTokenData.data.map((variant: { style_name: string }) => variant.style_name), ['Active Style']);

  const adminResponse = await testRequest(`/api/items/${item.id}/variants?include_inactive=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const adminData = await parseJSON(adminResponse);
  assertEquals(adminResponse.status, 200);
  assertEquals(adminData.data.length, 2);
  assertEquals(adminData.data.some((variant: { id: number }) => variant.id === inactiveVariant.id), true);

  const inactiveVariantAfter = await itemVariantRepository.findById(inactiveVariant.id);
  assertExists(inactiveVariantAfter);
  assertEquals(Boolean(inactiveVariantAfter.is_active), false);
});

Deno.test('POST /items/:id/variants - should create variant (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Bulb',
    base_model_number: 'SB-100',
    type_id: 1,
  });

  const formData = new FormData();
  formData.append('style_name', 'Silver');
  formData.append('price', '34.99');

  const response = await testRequest(`/api/items/${item.id}/variants`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await parseJSON(response);

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
    type_id: 1,
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });

  const response = await testRequest(`/api/items/${item.id}/variants/${variant.id}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await parseJSON(response);

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
    type_id: 1,
  });
  const variant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'White',
    price: 29.99,
  });

  const formData = new FormData();
  formData.append('style_name', 'Off-White');
  formData.append('price', '32.99');

  const response = await testRequest(`/api/items/${item.id}/variants/${variant.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await parseJSON(response);

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
    type_id: 1,
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

  const response = await testRequest(`/api/items/${item.id}/variants/${variant.id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.image_path, null);
  assertEquals(data.message, 'Variant updated successfully');
});

// ==========================================
// VARIANT ADDON TESTS
// ==========================================

Deno.test('GET /items/:id/variants/:variantId/addons - should list variant addons', async () => {
  clearDatabase();
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  
  // Create main item with variant
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-100',
    type_id: 1,
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
    type_id: 1,
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  // Add addon relationship
  const response1 = await testRequest(`/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_required: false,
    }),
  });
  assertEquals(response1.status, 201);

  // List addons
  const response2 = await testRequest(`/api/items/${item.id}/variants/${variant.id}/addons`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  const data = await parseJSON(response2);

  assertEquals(response2.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].addon_variant_id, addonVariant.id);
  assertEquals(data.data[0].is_required, false);
});

Deno.test('POST /items/:id/variants/:variantId/addons - should add addon (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-100',
    type_id: 1,
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
    type_id: 1,
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  const response = await testRequest(`/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_required: true,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.addon_variant_id, addonVariant.id);
  assertEquals(data.data.is_required, true);
  assertEquals(data.message, 'Add-on added successfully');
});

Deno.test('DELETE /items/:id/variants/:variantId/addons/:addonId - should remove addon (admin)', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Smart Switch',
    base_model_number: 'SS-100',
    type_id: 1,
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
    type_id: 1,
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  // Add addon first
  const response1 = await testRequest(`/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_required: false,
    }),
  });
  const addonData = await parseJSON(response1);
  const addonId = addonData.data.id;

  // Now delete it
  const response2 = await testRequest(`/api/items/${item.id}/variants/${variant.id}/addons/${addonId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  const data = await parseJSON(response2);

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
    type_id: 1,
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
    type_id: 1,
  });
  const addonVariant = await itemVariantRepository.create({
    item_id: addonItem.id,
    style_name: 'White',
    price: 9.99,
  });

  // Add addon first time
  await testRequest(`/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_required: false,
    }),
  });

  // Try to add same addon again
  const response = await testRequest(`/api/items/${item.id}/variants/${variant.id}/addons`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      addon_variant_id: addonVariant.id,
      is_required: false,
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 409);
  assertExists(data.error);
});

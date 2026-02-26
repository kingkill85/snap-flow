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
  
  const passwordHash = hashPassword('password123');
  await userRepository.create({
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

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

Deno.test('Floorplan - CRUD operations', async (t) => {
  const token = await getAuthToken();
  
  // Create project
  const project = await projectRepository.create({
    name: 'Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
  });
  const projectId = project.id;

  let floorplanId: number;

  await t.step('Create floorplan with image', async () => {
    // Create a mock image file
    const imageContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG magic bytes
    const formData = new FormData();
    formData.append('project_id', projectId.toString());
    formData.append('name', 'Ground Floor');
    formData.append('image', new Blob([imageContent], { type: 'image/png' }), 'floorplan.png');

    const response = await testRequest('/api/floorplans', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await parseJSON(response);
    
    assertEquals(response.status, 201);
    assertExists(data.data);
    assertEquals(data.data.name, 'Ground Floor');
    assertEquals(data.data.project_id, projectId);
    assertExists(data.data.image_path);
    floorplanId = data.data.id;
  });

  await t.step('Get all floorplans for project', async () => {
    const response = await testRequest(`/api/floorplans?project_id=${projectId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const data = await parseJSON(response);

    assertEquals(response.status, 200);
    assertExists(data.data);
    assertEquals(data.data.length, 1);
    assertEquals(data.data[0].name, 'Ground Floor');
  });

  await t.step('Get single floorplan', async () => {
    const response = await testRequest(`/api/floorplans/${floorplanId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const data = await parseJSON(response);

    assertEquals(response.status, 200);
    assertExists(data.data);
    assertEquals(data.data.id, floorplanId);
    assertEquals(data.data.name, 'Ground Floor');
  });

  await t.step('Update floorplan name', async () => {
    const formData = new FormData();
    formData.append('name', 'First Floor');

    const response = await testRequest(`/api/floorplans/${floorplanId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await parseJSON(response);

    assertEquals(response.status, 200);
    assertEquals(data.data.name, 'First Floor');
  });

  await t.step('Delete floorplan', async () => {
    const response = await testRequest(`/api/floorplans/${floorplanId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    assertEquals(response.status, 200);

    // Verify deletion
    const getResponse = await testRequest(`/api/floorplans/${floorplanId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    assertEquals(getResponse.status, 404);
  });
});

Deno.test('Floorplan - validation and errors', async (t) => {
  const token = await getAuthToken();

  // Create project
  const project = await projectRepository.create({
    name: 'Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
  });
  const projectId = project.id;

  await t.step('Create floorplan without name should fail', async () => {
    const formData = new FormData();
    formData.append('project_id', projectId.toString());
    // Missing name
    const imageContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
    formData.append('image', new Blob([imageContent], { type: 'image/png' }), 'floorplan.png');

    const response = await testRequest('/api/floorplans', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    assertEquals(response.status, 400);
  });

  await t.step('Create floorplan without image should fail', async () => {
    const formData = new FormData();
    formData.append('project_id', projectId.toString());
    formData.append('name', 'Test Floorplan');
    // Missing image

    const response = await testRequest('/api/floorplans', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    });

    assertEquals(response.status, 400);
  });

  await t.step('Get non-existent floorplan should return 404', async () => {
    const response = await testRequest('/api/floorplans/99999', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    assertEquals(response.status, 404);
  });

  await t.step('Delete non-existent floorplan should return 404', async () => {
    const response = await testRequest('/api/floorplans/99999', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    assertEquals(response.status, 404);
  });
});

Deno.test('Floorplan - reorder functionality', async (t) => {
  const token = await getAuthToken();

  // Create project
  const project = await projectRepository.create({
    name: 'Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
  });
  const projectId = project.id;

  // Create multiple floorplans
  const imageContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
  
  const formData1 = new FormData();
  formData1.append('project_id', projectId.toString());
  formData1.append('name', 'Floorplan 1');
  formData1.append('image', new Blob([imageContent], { type: 'image/png' }), 'fp1.png');

  const response1 = await testRequest('/api/floorplans', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData1,
  });
  const data1 = await parseJSON(response1);
  const fp1Id = data1.data.id;

  const formData2 = new FormData();
  formData2.append('project_id', projectId.toString());
  formData2.append('name', 'Floorplan 2');
  formData2.append('image', new Blob([imageContent], { type: 'image/png' }), 'fp2.png');

  const response2 = await testRequest('/api/floorplans', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData2,
  });
  const data2 = await parseJSON(response2);
  const fp2Id = data2.data.id;

  const formData3 = new FormData();
  formData3.append('project_id', projectId.toString());
  formData3.append('name', 'Floorplan 3');
  formData3.append('image', new Blob([imageContent], { type: 'image/png' }), 'fp3.png');

  const response3 = await testRequest('/api/floorplans', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
    body: formData3,
  });
  const data3 = await parseJSON(response3);
  const fp3Id = data3.data.id;

  await t.step('Reorder floorplans', async () => {
    // Reorder to: 3, 1, 2
    const reorderResponse = await testRequest(`/api/floorplans/reorder?project_id=${projectId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        floorplan_ids: [fp3Id, fp1Id, fp2Id],
      }),
    });

    assertEquals(reorderResponse.status, 200);

    // Verify new order
    const listResponse = await testRequest(`/api/floorplans?project_id=${projectId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const listData = await parseJSON(listResponse);
    assertEquals(listData.data[0].id, fp3Id);
    assertEquals(listData.data[1].id, fp1Id);
    assertEquals(listData.data[2].id, fp2Id);
  });

  // Clean up floorplans and their images
  await t.step('Clean up test floorplans', async () => {
    await testRequest(`/api/floorplans/${fp1Id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    await testRequest(`/api/floorplans/${fp2Id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    await testRequest(`/api/floorplans/${fp3Id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  });
});

Deno.test('Floorplan - authentication required', async (t) => {
  await t.step('List floorplans without auth should fail', async () => {
    const response = await testRequest('/api/floorplans');
    assertEquals(response.status, 401);
  });

  await t.step('Get floorplan without auth should fail', async () => {
    const response = await testRequest('/api/floorplans/1');
    assertEquals(response.status, 401);
  });

  await t.step('Create floorplan without auth should fail', async () => {
    const formData = new FormData();
    formData.append('project_id', '1');
    formData.append('name', 'Test');

    const response = await testRequest('/api/floorplans', {
      method: 'POST',
      body: formData,
    });
    assertEquals(response.status, 401);
  });
});

Deno.test('Floorplan - delete with image cleanup', async (t) => {
  const token = await getAuthToken();

  // Create project
  const project = await projectRepository.create({
    name: 'Test Project',
    customer_name: 'Test Customer',
    customer_address: '123 Test St',
    status: 'active',
  });
  const projectId = project.id;

  await t.step('Create floorplan with image then delete it', async () => {
    // Create floorplan with image
    const imageContent = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
    const formData = new FormData();
    formData.append('project_id', projectId.toString());
    formData.append('name', 'Floorplan with Image');
    formData.append('image', new Blob([imageContent], { type: 'image/png' }), 'test-floorplan.png');

    const createResponse = await testRequest('/api/floorplans', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    const createData = await parseJSON(createResponse);
    const floorplanId = createData.data.id;
    const imagePath = createData.data.image_path;
    
    assertExists(imagePath);
    assertEquals(createResponse.status, 201);

    // Delete floorplan - should succeed and clean up image
    const deleteResponse = await testRequest(`/api/floorplans/${floorplanId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    assertEquals(deleteResponse.status, 200);
    const deleteData = await parseJSON(deleteResponse);
    assertEquals(deleteData.message, 'Floorplan deleted successfully');

    // Verify floorplan is deleted
    const getResponse = await testRequest(`/api/floorplans/${floorplanId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    assertEquals(getResponse.status, 404);
  });
});

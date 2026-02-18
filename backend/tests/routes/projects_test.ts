import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
const { projectRepository } = await import('../../src/repositories/project.ts');

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

Deno.test('Project - can create project', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Test Project',
      customer_name: 'Test Customer',
      status: 'active',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.name, 'Test Project');
  assertEquals(data.data.customer_name, 'Test Customer');
  assertEquals(data.data.status, 'active');
  assertExists(data.data.id);
});

Deno.test('Project - can create project without status (defaults to active)', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Default Status Project',
      customer_name: 'Default Status Customer',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.status, 'active');
});

Deno.test('Project - cannot create project without name', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_name: 'Test Customer',
    }),
  });

  assertEquals(response.status, 400);
});

Deno.test('Project - cannot create project without customer_name', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'No Customer Project',
    }),
  });

  assertEquals(response.status, 400);
});

Deno.test('Project - can list projects', async () => {
  const token = await getAuthToken();

  // Create a project
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'List Test Project',
      customer_name: 'List Test Customer',
    }),
  });

  const response = await testRequest('/api/projects', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('Project - can search projects', async () => {
  const token = await getAuthToken();

  // Create projects
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Searchable Project',
      customer_name: 'John Doe',
    }),
  });

  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Another Project',
      customer_name: 'Jane Smith',
    }),
  });

  // Search by project name
  const response = await testRequest('/api/projects?search=Searchable', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(Array.isArray(data.data), true);
  // Should find the searchable project
  const found = data.data.some((p: { name: string }) => p.name === 'Searchable Project');
  assertEquals(found, true);
});

Deno.test('Project - can get single project', async () => {
  const token = await getAuthToken();

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Single Get Project',
      customer_name: 'Single Get Customer',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;

  // Get the project
  const response = await testRequest(`/api/projects/${projectId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Single Get Project');
});

Deno.test('Project - get non-existent project returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects/99999', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Project not found');
});

Deno.test('Project - can update project', async () => {
  const token = await getAuthToken();

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Update Test Project',
      customer_name: 'Update Test Customer',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;

  // Update the project
  const response = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Updated Project Name',
      status: 'completed',
      customer_name: 'Updated Customer Name',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Updated Project Name');
  assertEquals(data.data.status, 'completed');
  assertEquals(data.data.customer_name, 'Updated Customer Name');
});

Deno.test('Project - update non-existent project returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects/99999', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'New Name',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Project not found');
});

Deno.test('Project - can delete project', async () => {
  const token = await getAuthToken();

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Delete Test Project',
      customer_name: 'Delete Test Customer',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;

  // Delete the project
  const response = await testRequest(`/api/projects/${projectId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.message);

  // Verify project is deleted
  const getResponse = await testRequest(`/api/projects/${projectId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getResponse.status, 404);
});

Deno.test('Project - delete non-existent project returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects/99999', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Project not found');
});

Deno.test('Project - cannot create duplicate project name for same customer', async () => {
  const token = await getAuthToken();

  // Create first project
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Duplicate Project',
      customer_name: 'Duplicate Customer',
    }),
  });

  // Try to create second project with same name and customer
  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Duplicate Project',
      customer_name: 'Duplicate Customer',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertEquals(data.error.includes('already exists'), true);
});

Deno.test('Project - can create same project name for different customers', async () => {
  const token = await getAuthToken();

  // Create first project for Customer A
  const response1 = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Same Name Project',
      customer_name: 'Customer A',
    }),
  });

  assertEquals(response1.status, 201);

  // Create second project with same name for Customer B
  const response2 = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Same Name Project',
      customer_name: 'Customer B',
    }),
  });

  assertEquals(response2.status, 201);
});

Deno.test('Project - cannot update to duplicate project name for same customer', async () => {
  const token = await getAuthToken();

  // Create first project
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'First Project',
      customer_name: 'Same Customer',
    }),
  });

  // Create second project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Second Project',
      customer_name: 'Same Customer',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;

  // Try to update second project to same name as first
  const response = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'First Project',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertEquals(data.error.includes('already exists'), true);
});

Deno.test('Project - can create project with all customer fields', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Complete Project',
      customer_name: 'John Doe',
      customer_email: 'john@example.com',
      customer_phone: '+1 234 567 8900',
      customer_address: '123 Main St, City, Country',
      status: 'active',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.name, 'Complete Project');
  assertEquals(data.data.customer_name, 'John Doe');
  assertEquals(data.data.customer_email, 'john@example.com');
  assertEquals(data.data.customer_phone, '+1 234 567 8900');
  assertEquals(data.data.customer_address, '123 Main St, City, Country');
});

Deno.test('Project - can update customer fields', async () => {
  const token = await getAuthToken();

  // Create project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Update Customer Fields Project',
      customer_name: 'Original Name',
      customer_email: 'original@example.com',
    }),
  });

  const createData = await parseJSON(createResponse);
  const projectId = createData.data.id;

  // Update customer fields
  const response = await testRequest(`/api/projects/${projectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_email: 'updated@example.com',
      customer_phone: '+1 999 888 7777',
      customer_address: '456 New St, New City',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.customer_email, 'updated@example.com');
  assertEquals(data.data.customer_phone, '+1 999 888 7777');
  assertEquals(data.data.customer_address, '456 New St, New City');
  // Name should remain unchanged
  assertEquals(data.data.name, 'Update Customer Fields Project');
  assertEquals(data.data.customer_name, 'Original Name');
});

Deno.test('Project - cannot access without auth', async () => {
  const response = await testRequest('/api/projects');
  assertEquals(response.status, 401);
});

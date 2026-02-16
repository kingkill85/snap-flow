import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
const { customerRepository } = await import('../../src/repositories/customer.ts');
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

async function createCustomer(token: string, name: string): Promise<number> {
  const response = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  });

  const data = await parseJSON(response);
  return data.data.id;
}

Deno.test('Project - can create project', async () => {
  const token = await getAuthToken();
  const customerId = await createCustomer(token, 'Project Test Customer');

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Test Project',
      status: 'active',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.name, 'Test Project');
  assertEquals(data.data.customer_id, customerId);
  assertEquals(data.data.status, 'active');
  assertExists(data.data.id);
});

Deno.test('Project - can create project without status (defaults to active)', async () => {
  const token = await getAuthToken();
  const customerId = await createCustomer(token, 'Default Status Customer');

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Default Status Project',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.status, 'active');
});

Deno.test('Project - cannot create project without customer', async () => {
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

Deno.test('Project - cannot create project for non-existent customer', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: 99999,
      name: 'Invalid Customer Project',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Customer not found');
});

Deno.test('Project - can list projects', async () => {
  const token = await getAuthToken();
  const customerId = await createCustomer(token, 'List Test Customer');

  // Create a project
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'List Test Project',
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

Deno.test('Project - can get single project', async () => {
  const token = await getAuthToken();
  const customerId = await createCustomer(token, 'Single Test Customer');

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Single Get Project',
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
  const customerId = await createCustomer(token, 'Update Test Customer');

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Update Test Project',
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
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Updated Project Name');
  assertEquals(data.data.status, 'completed');
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
  const customerId = await createCustomer(token, 'Delete Test Customer');

  // Create a project
  const createResponse = await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Delete Test Project',
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

Deno.test('Project - can get projects by customer', async () => {
  const token = await getAuthToken();
  const customerId = await createCustomer(token, 'By Customer Test');

  // Create two projects for the customer
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Project 1',
    }),
  });

  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Project 2',
    }),
  });

  // Get projects for customer
  const response = await testRequest(`/api/customers/${customerId}/projects`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 2);
  // Verify both projects exist
  const projectNames = data.data.map((p: { name: string }) => p.name).sort();
  assertEquals(projectNames, ['Project 1', 'Project 2']);
});

Deno.test('Project - cannot access without auth', async () => {
  const response = await testRequest('/api/projects');
  assertEquals(response.status, 401);
});

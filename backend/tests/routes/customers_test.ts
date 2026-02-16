import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');
const { customerRepository } = await import('../../src/repositories/customer.ts');

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

Deno.test('Customer - can create customer', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com',
      phone: '555-1234',
      address: '123 Main St',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.name, 'John Doe');
  assertEquals(data.data.email, 'john@example.com');
  assertExists(data.data.id);
});

Deno.test('Customer - can create customer with minimal data', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Jane Doe',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.name, 'Jane Doe');
  assertExists(data.data.id);
});

Deno.test('Customer - cannot create customer without name', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: 'test@example.com',
    }),
  });

  assertEquals(response.status, 400);
});

Deno.test('Customer - can list customers', async () => {
  const token = await getAuthToken();

  // Create a customer first
  await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Test Customer',
    }),
  });

  const response = await testRequest('/api/customers', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('Customer - can search customers', async () => {
  const token = await getAuthToken();

  // Create customers
  await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Alice Smith',
      email: 'alice@example.com',
    }),
  });

  await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Bob Jones',
      email: 'bob@test.com',
    }),
  });

  // Search for Alice
  const response = await testRequest('/api/customers?search=Alice', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, 'Alice Smith');
});

Deno.test('Customer - can get single customer', async () => {
  const token = await getAuthToken();

  // Create a customer
  const createResponse = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Single Test',
    }),
  });

  const createData = await parseJSON(createResponse);
  const customerId = createData.data.id;

  // Get the customer
  const response = await testRequest(`/api/customers/${customerId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Single Test');
});

Deno.test('Customer - get non-existent customer returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/customers/99999', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Customer not found');
});

Deno.test('Customer - can update customer', async () => {
  const token = await getAuthToken();

  // Create a customer
  const createResponse = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Update Test',
    }),
  });

  const createData = await parseJSON(createResponse);
  const customerId = createData.data.id;

  // Update the customer
  const response = await testRequest(`/api/customers/${customerId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Updated Name',
      email: 'updated@example.com',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.name, 'Updated Name');
  assertEquals(data.data.email, 'updated@example.com');
});

Deno.test('Customer - update non-existent customer returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/customers/99999', {
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
  assertEquals(data.error, 'Customer not found');
});

Deno.test('Customer - can delete customer', async () => {
  const token = await getAuthToken();

  // Create a customer
  const createResponse = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Delete Test',
    }),
  });

  const createData = await parseJSON(createResponse);
  const customerId = createData.data.id;

  // Delete the customer
  const response = await testRequest(`/api/customers/${customerId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.message);

  // Verify customer is deleted
  const getResponse = await testRequest(`/api/customers/${customerId}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  assertEquals(getResponse.status, 404);
});

Deno.test('Customer - delete non-existent customer returns 404', async () => {
  const token = await getAuthToken();

  const response = await testRequest('/api/customers/99999', {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'Customer not found');
});

Deno.test('Customer - cannot delete customer with projects', async () => {
  const token = await getAuthToken();

  // Create a customer
  const customerResponse = await testRequest('/api/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: 'Customer With Project',
    }),
  });

  const customerData = await parseJSON(customerResponse);
  const customerId = customerData.data.id;

  // Create a project for the customer
  await testRequest('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      customer_id: customerId,
      name: 'Test Project',
    }),
  });

  // Try to delete the customer
  const response = await testRequest(`/api/customers/${customerId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertExists(data.error);
});

Deno.test('Customer - cannot access without auth', async () => {
  const response = await testRequest('/api/customers');
  assertEquals(response.status, 401);
});

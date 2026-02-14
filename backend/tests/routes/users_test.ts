import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');

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

Deno.test('User management - admin can create user', async () => {
  const adminToken = await getAdminToken();

  const response = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'newuser@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 201);
  assertEquals(data.data.email, 'newuser@example.com');
  assertEquals(data.data.role, 'user');
});

Deno.test('User management - non-admin cannot create user', async () => {
  const userToken = await getUserToken();

  const response = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      email: 'another@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 403);
  assertEquals(data.error, 'Forbidden - Admin access required');
});

Deno.test('User management - cannot create duplicate user', async () => {
  const adminToken = await getAdminToken();

  // Create user first
  await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'duplicate@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  // Try to create again
  const response = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'duplicate@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertEquals(data.error, 'User with this email already exists');
});

Deno.test('User management - admin can list users', async () => {
  const adminToken = await getAdminToken();

  const response = await testRequest('/api/users', {
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('User management - non-admin cannot list users', async () => {
  const userToken = await getUserToken();

  const response = await testRequest('/api/users', {
    headers: { 'Authorization': `Bearer ${userToken}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 403);
  assertEquals(data.error, 'Forbidden - Admin access required');
});

Deno.test('User management - admin can delete user', async () => {
  const adminToken = await getAdminToken();

  // Create a user to delete
  const createResponse = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'todelete@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const createData = await parseJSON(createResponse);
  const userId = createData.data.id;

  // Delete the user
  const response = await testRequest(`/api/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.message);
});

Deno.test('User management - cannot delete yourself', async () => {
  clearDatabase();
  
  // Create admin and get token
  const passwordHash = await hashPassword('admin123');
  const admin = await userRepository.create({
    email: 'selfdelete@example.com',
    password_hash: passwordHash,
    role: 'admin',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'selfdelete@example.com',
      password: 'admin123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const adminToken = loginData.data.accessToken;

  // Try to delete self
  const response = await testRequest(`/api/users/${admin.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertEquals(data.error, 'Cannot delete your own account');
});

Deno.test('User management - created user can login', async () => {
  const adminToken = await getAdminToken();

  // Create user
  await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'canlogin@example.com',
      password: 'testpass123',
      role: 'user',
    }),
  });

  // Login with created user
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'canlogin@example.com',
      password: 'testpass123',
    }),
  });

  const loginData = await parseJSON(loginResponse);

  assertEquals(loginResponse.status, 200);
  assertExists(loginData.data.accessToken);
});

Deno.test('User management - admin can update user full_name', async () => {
  const adminToken = await getAdminToken();

  // Create a user to update
  const createResponse = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'updatefullname@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const createData = await parseJSON(createResponse);
  const userId = createData.data.id;

  // Update the user's full_name
  const response = await testRequest(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      full_name: 'Updated Full Name',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.full_name, 'Updated Full Name');
});

Deno.test('User management - admin can update user email', async () => {
  const adminToken = await getAdminToken();

  // Create a user to update
  const createResponse = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'updateuseremail@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const createData = await parseJSON(createResponse);
  const userId = createData.data.id;

  // Update the user's email
  const response = await testRequest(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'newuseremail@example.com',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.email, 'newuseremail@example.com');
});

Deno.test('User management - admin can update user password', async () => {
  const adminToken = await getAdminToken();

  // Create a user to update
  const createResponse = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'updateuserpass@example.com',
      password: 'oldpassword',
      role: 'user',
    }),
  });

  const createData = await parseJSON(createResponse);
  const userId = createData.data.id;

  // Update the user's password
  const response = await testRequest(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      password: 'newpassword123',
    }),
  });

  assertEquals(response.status, 200);

  // Verify new password works
  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'updateuserpass@example.com',
      password: 'newpassword123',
    }),
  });

  assertEquals(loginResponse.status, 200);
});

Deno.test('User management - admin can update user role', async () => {
  const adminToken = await getAdminToken();

  // Create a user to update
  const createResponse = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'promoteuser@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const createData = await parseJSON(createResponse);
  const userId = createData.data.id;

  // Promote the user to admin
  const response = await testRequest(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      role: 'admin',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.role, 'admin');
});

Deno.test('User management - admin update without changes fails', async () => {
  const adminToken = await getAdminToken();

  // Create a user to update
  const createResponse = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'noupdate@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const createData = await parseJSON(createResponse);
  const userId = createData.data.id;

  // Try to update without any changes
  const response = await testRequest(`/api/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({}),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertEquals(data.error, 'No fields to update');
});

Deno.test('User management - admin cannot update non-existent user', async () => {
  const adminToken = await getAdminToken();

  // Try to update non-existent user
  const response = await testRequest('/api/users/99999', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      full_name: 'Test Name',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 404);
  assertEquals(data.error, 'User not found');
});

Deno.test('User management - admin cannot use duplicate email', async () => {
  const adminToken = await getAdminToken();

  // Create two users
  await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'existing@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const createResponse2 = await testRequest('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'another@example.com',
      password: 'password123',
      role: 'user',
    }),
  });

  const createData2 = await parseJSON(createResponse2);
  const userId2 = createData2.data.id;

  // Try to update second user with first user's email
  const response = await testRequest(`/api/users/${userId2}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      email: 'existing@example.com',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 400);
  assertEquals(data.error, 'Email already in use');
});

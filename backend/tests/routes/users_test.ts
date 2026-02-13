import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
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

Deno.test('User management - admin can create user', async () => {
  const adminToken = await getAdminToken();

  const response = await fetch(`${BASE_URL}/users`, {
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

  const data = await response.json();

  assertEquals(response.status, 201);
  assertEquals(data.data.email, 'newuser@example.com');
  assertEquals(data.data.role, 'user');
});

Deno.test('User management - non-admin cannot create user', async () => {
  const userToken = await getUserToken();

  const response = await fetch(`${BASE_URL}/users`, {
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

  const data = await response.json();

  assertEquals(response.status, 403);
  assertEquals(data.error, 'Forbidden - Admin access required');
});

Deno.test('User management - cannot create duplicate user', async () => {
  const adminToken = await getAdminToken();

  // Create user first
  await fetch(`${BASE_URL}/users`, {
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
  const response = await fetch(`${BASE_URL}/users`, {
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

  const data = await response.json();

  assertEquals(response.status, 400);
  assertEquals(data.error, 'User with this email already exists');
});

Deno.test('User management - admin can list users', async () => {
  const adminToken = await getAdminToken();

  const response = await fetch(`${BASE_URL}/users`, {
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertExists(data.data);
  assertEquals(Array.isArray(data.data), true);
});

Deno.test('User management - non-admin cannot list users', async () => {
  const userToken = await getUserToken();

  const response = await fetch(`${BASE_URL}/users`, {
    headers: { 'Authorization': `Bearer ${userToken}` },
  });

  const data = await response.json();

  assertEquals(response.status, 403);
  assertEquals(data.error, 'Forbidden - Admin access required');
});

Deno.test('User management - admin can delete user', async () => {
  const adminToken = await getAdminToken();

  // Create a user to delete
  const createResponse = await fetch(`${BASE_URL}/users`, {
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

  const createData = await createResponse.json();
  const userId = createData.data.id;

  // Delete the user
  const response = await fetch(`${BASE_URL}/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });

  const data = await response.json();

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

  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'selfdelete@example.com',
      password: 'admin123',
    }),
  });

  const loginData = await loginResponse.json();
  const adminToken = loginData.data.token;

  // Try to delete self
  const response = await fetch(`${BASE_URL}/users/${admin.id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` },
  });

  const data = await response.json();

  assertEquals(response.status, 400);
  assertEquals(data.error, 'Cannot delete your own account');
});

Deno.test('User management - created user can login', async () => {
  const adminToken = await getAdminToken();

  // Create user
  await fetch(`${BASE_URL}/users`, {
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
  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'canlogin@example.com',
      password: 'testpass123',
    }),
  });

  const loginData = await loginResponse.json();

  assertEquals(loginResponse.status, 200);
  assertExists(loginData.data.token);
});

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');

Deno.test('Auth endpoints - login with valid credentials', async () => {
  clearDatabase();
  
  // Create a test user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'logintest@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const response = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'logintest@example.com',
      password: 'testpassword123',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertExists(data.data.accessToken);
  assertExists(data.data.refreshToken);
  assertExists(data.data.user);
  assertEquals(data.data.user.email, 'logintest@example.com');
  assertEquals(data.data.user.role, 'user');
});

Deno.test('Auth endpoints - login with invalid email', async () => {
  clearDatabase();

  const response = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'nonexistent@example.com',
      password: 'password123',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 401);
  assertEquals(data.error, 'Invalid email or password');
});

Deno.test('Auth endpoints - login with invalid password', async () => {
  clearDatabase();
  
  // Create a test user
  const passwordHash = await hashPassword('correctpassword');
  await userRepository.create({
    email: 'wrongpass@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const response = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'wrongpass@example.com',
      password: 'wrongpassword',
    }),
  });

  const data = await parseJSON(response);

  assertEquals(response.status, 401);
  assertEquals(data.error, 'Invalid email or password');
});

Deno.test('Auth endpoints - login with missing fields', async () => {
  const response = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      // missing password
    }),
  });

  // Should return 400 for validation error
  assertEquals(response.status, 400);
});

Deno.test('Auth endpoints - get current user with valid token', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'me@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'me@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Use token to get current user
  const meResponse = await testRequest('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const meData = await parseJSON(meResponse);

  assertEquals(meResponse.status, 200);
  assertEquals(meData.data.email, 'me@example.com');
  assertEquals(meData.data.role, 'user');
});

Deno.test('Auth endpoints - get current user without token', async () => {
  const response = await testRequest('/api/auth/me');
  const data = await parseJSON(response);

  assertEquals(response.status, 401);
  assertEquals(data.error, 'Unauthorized - No token provided');
});

Deno.test('Auth endpoints - get current user with invalid token', async () => {
  const response = await testRequest('/api/auth/me', {
    headers: { 'Authorization': 'Bearer invalidtoken123' },
  });
  const data = await parseJSON(response);

  assertEquals(response.status, 401);
  assertEquals(data.error, 'Unauthorized - Invalid token');
});

Deno.test('Auth endpoints - logout with valid token', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'logout@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'logout@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Logout
  const logoutResponse = await testRequest('/api/auth/logout', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const logoutData = await parseJSON(logoutResponse);

  assertEquals(logoutResponse.status, 200);
  assertExists(logoutData.message);
});

Deno.test('Auth endpoints - update profile with full_name', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'updateprofile@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'updateprofile@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Update profile
  const updateResponse = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      full_name: 'John Updated',
    }),
  });

  const updateData = await parseJSON(updateResponse);

  assertEquals(updateResponse.status, 200);
  assertEquals(updateData.data.full_name, 'John Updated');
});

Deno.test('Auth endpoints - refresh token with valid refresh token', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'refreshtest@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'refreshtest@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const refreshToken = loginData.data.refreshToken;
  const originalAccessToken = loginData.data.accessToken;

  // Use refresh token to get new access token
  const refreshResponse = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: refreshToken,
    }),
  });

  const refreshData = await parseJSON(refreshResponse);

  assertEquals(refreshResponse.status, 200);
  assertExists(refreshData.data.accessToken);
  // New access token should be a valid JWT (contains 2 dots)
  assertEquals(refreshData.data.accessToken.split('.').length, 3);
});

Deno.test('Auth endpoints - refresh token with invalid refresh token', async () => {
  clearDatabase();

  const refreshResponse = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: 'invalid-token-12345',
    }),
  });

  const refreshData = await parseJSON(refreshResponse);

  assertEquals(refreshResponse.status, 401);
  assertEquals(refreshData.error, 'Invalid or expired refresh token');
});

Deno.test('Auth endpoints - access protected endpoint with refreshed token', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'refreshthenaccess@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'refreshthenaccess@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const refreshToken = loginData.data.refreshToken;

  // Refresh to get new access token
  const refreshResponse = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      refreshToken: refreshToken,
    }),
  });

  const refreshData = await parseJSON(refreshResponse);
  const newAccessToken = refreshData.data.accessToken;

  // Use new access token to access protected endpoint
  const meResponse = await testRequest('/api/auth/me', {
    headers: { 'Authorization': `Bearer ${newAccessToken}` },
  });

  const meData = await parseJSON(meResponse);

  assertEquals(meResponse.status, 200);
  assertEquals(meData.data.email, 'refreshthenaccess@example.com');
});

Deno.test('Auth endpoints - update profile with email', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'updateemail@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'updateemail@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Update email
  const updateResponse = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      email: 'newemail@example.com',
    }),
  });

  const updateData = await parseJSON(updateResponse);

  assertEquals(updateResponse.status, 200);
  assertEquals(updateData.data.email, 'newemail@example.com');
});

Deno.test('Auth endpoints - update profile with password', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('oldpassword');
  await userRepository.create({
    email: 'updatepass@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'updatepass@example.com',
      password: 'oldpassword',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Update password
  const updateResponse = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      password: 'newpassword123',
    }),
  });

  assertEquals(updateResponse.status, 200);

  // Verify new password works
  const newLoginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'updatepass@example.com',
      password: 'newpassword123',
    }),
  });

  assertEquals(newLoginResponse.status, 200);
});

Deno.test('Auth endpoints - update profile without changes fails', async () => {
  clearDatabase();
  
  // Create and login a user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'nochanges@example.com',
    full_name: 'Test User',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginResponse = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'nochanges@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await parseJSON(loginResponse);
  const token = loginData.data.accessToken;

  // Try to update without any changes
  const updateResponse = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  const updateData = await parseJSON(updateResponse);

  assertEquals(updateResponse.status, 400);
  assertEquals(updateData.error, 'No fields to update');
});

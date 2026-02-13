import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { hashPassword } from '../../src/services/password.ts';

const BASE_URL = 'http://localhost:8000';

Deno.test('Auth endpoints - login with valid credentials', async () => {
  clearDatabase();
  
  // Create a test user
  const passwordHash = await hashPassword('testpassword123');
  await userRepository.create({
    email: 'logintest@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'logintest@example.com',
      password: 'testpassword123',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 200);
  assertExists(data.data.token);
  assertExists(data.data.user);
  assertEquals(data.data.user.email, 'logintest@example.com');
  assertEquals(data.data.user.role, 'user');
});

Deno.test('Auth endpoints - login with invalid email', async () => {
  clearDatabase();

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'nonexistent@example.com',
      password: 'password123',
    }),
  });

  const data = await response.json();

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

  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'wrongpass@example.com',
      password: 'wrongpassword',
    }),
  });

  const data = await response.json();

  assertEquals(response.status, 401);
  assertEquals(data.error, 'Invalid email or password');
});

Deno.test('Auth endpoints - login with missing fields', async () => {
  const response = await fetch(`${BASE_URL}/auth/login`, {
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

  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'me@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await loginResponse.json();
  const token = loginData.data.token;

  // Use token to get current user
  const meResponse = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const meData = await meResponse.json();

  assertEquals(meResponse.status, 200);
  assertEquals(meData.data.email, 'me@example.com');
  assertEquals(meData.data.role, 'user');
});

Deno.test('Auth endpoints - get current user without token', async () => {
  const response = await fetch(`${BASE_URL}/auth/me`);
  const data = await response.json();

  assertEquals(response.status, 401);
  assertEquals(data.error, 'Unauthorized - No token provided');
});

Deno.test('Auth endpoints - get current user with invalid token', async () => {
  const response = await fetch(`${BASE_URL}/auth/me`, {
    headers: { 'Authorization': 'Bearer invalidtoken123' },
  });
  const data = await response.json();

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

  const loginResponse = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'logout@example.com',
      password: 'testpassword123',
    }),
  });

  const loginData = await loginResponse.json();
  const token = loginData.data.token;

  // Logout
  const logoutResponse = await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}` },
  });

  const logoutData = await logoutResponse.json();

  assertEquals(logoutResponse.status, 200);
  assertExists(logoutData.message);
});

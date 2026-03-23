import { assertEquals, assertExists, assertNotEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

await setupTestDatabase();
const { userRepository } = await import('../../src/repositories/user.ts');

Deno.test('Token rotation - refresh returns new refresh token', async () => {
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({
    email: 'rotation@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Login to get initial tokens
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rotation@example.com', password: 'testpassword123' }),
  });
  const loginData = await parseJSON(loginRes);
  const originalRefreshToken = loginData.data.refreshToken;

  // Refresh — should get new access token AND new refresh token
  const refreshRes = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: originalRefreshToken }),
  });
  const refreshData = await parseJSON(refreshRes);

  assertEquals(refreshRes.status, 200);
  assertExists(refreshData.data.accessToken);
  assertExists(refreshData.data.refreshToken);
  assertNotEquals(refreshData.data.refreshToken, originalRefreshToken);
});

Deno.test('Token rotation - old refresh token is rejected after rotation', async () => {
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({
    email: 'rotation2@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Login
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rotation2@example.com', password: 'testpassword123' }),
  });
  const loginData = await parseJSON(loginRes);
  const originalRefreshToken = loginData.data.refreshToken;

  // First refresh — succeeds
  await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: originalRefreshToken }),
  });

  // Second refresh with OLD token — should fail
  const replayRes = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: originalRefreshToken }),
  });

  assertEquals(replayRes.status, 401);
});

Deno.test('PUT /auth/me - rejects password change without current_password', async () => {
  clearDatabase();
  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({ email: 'profile@example.com', password_hash: passwordHash, role: 'user' });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ password: 'newpassword12!' }),
  });
  assertEquals(updateRes.status, 400);
});

Deno.test('PUT /auth/me - rejects password change with wrong current_password', async () => {
  clearDatabase();
  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({ email: 'profile2@example.com', password_hash: passwordHash, role: 'user' });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile2@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ password: 'newpassword12!', current_password: 'wrongpassword' }),
  });
  assertEquals(updateRes.status, 401);
});

Deno.test('PUT /auth/me - accepts password change with correct current_password', async () => {
  clearDatabase();
  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({ email: 'profile3@example.com', password_hash: passwordHash, role: 'user' });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile3@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ password: 'newpassword12!', current_password: 'oldpassword12!' }),
  });
  assertEquals(updateRes.status, 200);
});

Deno.test('PUT /auth/me - rejects short password', async () => {
  clearDatabase();
  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({ email: 'profile4@example.com', password_hash: passwordHash, role: 'user' });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile4@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ password: 'short', current_password: 'oldpassword12!' }),
  });
  assertEquals(updateRes.status, 400);
});

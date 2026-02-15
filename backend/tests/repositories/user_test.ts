import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { hashPassword } from '../../src/services/password.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import repositories after database is set up
const { userRepository } = await import('../../src/repositories/user.ts');

Deno.test('UserRepository - create user', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const user = await userRepository.create({
    email: 'test@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  assertExists(user.id);
  assertEquals(user.email, 'test@example.com');
  assertEquals(user.full_name, null);
  assertEquals(user.role, 'user');
  assertExists(user.created_at);
});

Deno.test('UserRepository - create user with full_name', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const user = await userRepository.create({
    email: 'named@example.com',
    full_name: 'John Doe',
    password_hash: passwordHash,
    role: 'user',
  });

  assertExists(user.id);
  assertEquals(user.email, 'named@example.com');
  assertEquals(user.full_name, 'John Doe');
  assertEquals(user.role, 'user');
});

Deno.test('UserRepository - findByEmail finds existing user', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  await userRepository.create({
    email: 'find@example.com',
    full_name: 'Jane Smith',
    password_hash: passwordHash,
    role: 'admin',
  });

  const found = await userRepository.findByEmail('find@example.com');
  
  assertExists(found);
  assertEquals(found?.email, 'find@example.com');
  assertEquals(found?.full_name, 'Jane Smith');
  assertEquals(found?.role, 'admin');
});

Deno.test('UserRepository - findByEmail returns null for non-existent user', async () => {
  clearDatabase();
  
  const found = await userRepository.findByEmail('nonexistent@example.com');
  assertEquals(found, null);
});

Deno.test('UserRepository - findById finds user by id', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const created = await userRepository.create({
    email: 'byid@example.com',
    full_name: 'Test User',
    password_hash: passwordHash,
    role: 'user',
  });

  const found = await userRepository.findById(created.id);
  
  assertExists(found);
  assertEquals(found?.id, created.id);
  assertEquals(found?.email, 'byid@example.com');
  assertEquals(found?.full_name, 'Test User');
});

Deno.test('UserRepository - findAll returns all users', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  await userRepository.create({
    email: 'user1@example.com',
    full_name: 'User One',
    password_hash: passwordHash,
    role: 'user',
  });
  await userRepository.create({
    email: 'user2@example.com',
    full_name: 'User Two',
    password_hash: passwordHash,
    role: 'admin',
  });

  const users = await userRepository.findAll();
  
  assertEquals(users.length, 2);
  assertEquals(users[0].full_name, 'User One');
  assertEquals(users[1].full_name, 'User Two');
});

Deno.test('UserRepository - update user full_name', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const created = await userRepository.create({
    email: 'update@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const updated = await userRepository.update(created.id, {
    full_name: 'Updated Name',
  });

  assertExists(updated);
  assertEquals(updated?.full_name, 'Updated Name');
});

Deno.test('UserRepository - update user email', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const created = await userRepository.create({
    email: 'old@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const updated = await userRepository.update(created.id, {
    email: 'new@example.com',
  });

  assertExists(updated);
  assertEquals(updated?.email, 'new@example.com');
});

Deno.test('UserRepository - update user full_name to null', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const created = await userRepository.create({
    email: 'clearnametest@example.com',
    full_name: 'Original Name',
    password_hash: passwordHash,
    role: 'user',
  });

  const updated = await userRepository.update(created.id, {
    full_name: null as any,
  });

  assertExists(updated);
  assertEquals(updated?.full_name, null);
});

Deno.test('UserRepository - delete user', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const created = await userRepository.create({
    email: 'delete@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  await userRepository.delete(created.id);
  
  const found = await userRepository.findById(created.id);
  assertEquals(found, null);
});

Deno.test('UserRepository - user has password_hash field', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const user = await userRepository.create({
    email: 'haspassword@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const found = await userRepository.findByEmail('haspassword@example.com');
  
  // Password hash should be accessible from findByEmail (which uses SELECT *)
  assertExists(found);
  assertExists(found?.password_hash);
  assertEquals(found?.password_hash.startsWith('$2b$'), true);
});

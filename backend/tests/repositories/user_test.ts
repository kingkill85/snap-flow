import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { hashPassword } from '../../src/services/password.ts';
import { clearDatabase } from '../test-utils.ts';

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
  assertEquals(user.role, 'user');
  assertExists(user.created_at);
});

Deno.test('UserRepository - findByEmail finds existing user', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  await userRepository.create({
    email: 'find@example.com',
    password_hash: passwordHash,
    role: 'admin',
  });

  const found = await userRepository.findByEmail('find@example.com');
  
  assertExists(found);
  assertEquals(found?.email, 'find@example.com');
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
    password_hash: passwordHash,
    role: 'user',
  });

  const found = await userRepository.findById(created.id);
  
  assertExists(found);
  assertEquals(found?.id, created.id);
  assertEquals(found?.email, 'byid@example.com');
});

Deno.test('UserRepository - findAll returns all users', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  await userRepository.create({
    email: 'user1@example.com',
    password_hash: passwordHash,
    role: 'user',
  });
  await userRepository.create({
    email: 'user2@example.com',
    password_hash: passwordHash,
    role: 'admin',
  });

  const users = await userRepository.findAll();
  
  assertEquals(users.length, 2);
});

Deno.test('UserRepository - update user email', async () => {
  clearDatabase();
  
  const passwordHash = await hashPassword('testpassword');
  const created = await userRepository.create({
    email: 'update@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const updated = await userRepository.update(created.id, {
    email: 'updated@example.com',
  });

  assertExists(updated);
  assertEquals(updated?.email, 'updated@example.com');
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

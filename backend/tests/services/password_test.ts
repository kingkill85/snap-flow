import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { hashPassword, comparePassword } from '../../src/services/password.ts';

Deno.test("Password service - hashPassword creates a hash", async () => {
  const password = 'testpassword123';
  const hash = await hashPassword(password);
  
  // Hash should be different from original password
  assertNotEquals(hash, password);
  // Hash should be a bcrypt hash (starts with $2b$)
  assertEquals(hash.startsWith('$2b$'), true);
});

Deno.test("Password service - comparePassword validates correct password", async () => {
  const password = 'testpassword123';
  const hash = await hashPassword(password);
  
  const isValid = await comparePassword(password, hash);
  assertEquals(isValid, true);
});

Deno.test("Password service - comparePassword rejects incorrect password", async () => {
  const password = 'testpassword123';
  const hash = await hashPassword(password);
  
  const isValid = await comparePassword('wrongpassword', hash);
  assertEquals(isValid, false);
});

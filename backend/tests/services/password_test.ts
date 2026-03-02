import { assertEquals, assertNotEquals } from '@std/assert';
import { hashPassword, comparePassword } from '../../src/services/password.ts';

Deno.test("Password service - hashPassword creates a hash", () => {
  const password = 'testpassword123';
  const hash = hashPassword(password);
  
  // Hash should be different from original password
  assertNotEquals(hash, password);
  // Hash should be a bcrypt hash (starts with $2a$ or $2b$)
  const isBcryptHash = hash.startsWith('$2a$') || hash.startsWith('$2b$');
  assertEquals(isBcryptHash, true);
});

Deno.test("Password service - comparePassword validates correct password", () => {
  const password = 'testpassword123';
  const hash = hashPassword(password);
  
  const isValid = comparePassword(password, hash);
  assertEquals(isValid, true);
});

Deno.test("Password service - comparePassword rejects incorrect password", () => {
  const password = 'testpassword123';
  const hash = hashPassword(password);
  
  const isValid = comparePassword('wrongpassword', hash);
  assertEquals(isValid, false);
});

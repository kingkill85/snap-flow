import { assertEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { validateMagicBytes } from '../../src/utils/magic-bytes.ts';
import { hashPassword } from '../../src/services/password.ts';

await setupTestDatabase();

Deno.test('Security - URL-encoded path traversal returns 404', async () => {
  // HTTP clients normalize plain ../../ sequences before reaching Hono,
  // so they can't be tested directly. However, URL-encoded %2e%2e%2f is NOT normalized,
  // and our resolve() check in the /uploads/* handler catches it.
  const response = await testRequest('/uploads/%2e%2e%2f%2e%2e%2fetc/passwd');
  assertEquals(response.status, 404);
});

Deno.test('Security - normal upload path still works (returns 404 for missing file, not 500)', async () => {
  const response = await testRequest('/uploads/items/nonexistent.jpg');
  assertEquals(response.status, 404);
  const data = await parseJSON(response);
  assertEquals(data.error, 'File not found');
});

Deno.test('Magic bytes - valid JPEG is accepted', () => {
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assertEquals(validateMagicBytes(jpeg, 'image'), true);
});

Deno.test('Magic bytes - valid PNG is accepted', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00]);
  assertEquals(validateMagicBytes(png, 'image'), true);
});

Deno.test('Magic bytes - valid WebP is accepted', () => {
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  assertEquals(validateMagicBytes(webp, 'image'), true);
});

Deno.test('Magic bytes - valid XLSX is accepted', () => {
  const xlsx = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assertEquals(validateMagicBytes(xlsx, 'excel'), true);
});

Deno.test('Magic bytes - random bytes rejected for image', () => {
  const fake = new Uint8Array([0x3C, 0x3F, 0x70, 0x68, 0x70, 0x20, 0x65, 0x63, 0x68, 0x6F, 0x20, 0x31]);
  assertEquals(validateMagicBytes(fake, 'image'), false);
});

Deno.test('Magic bytes - empty buffer rejected', () => {
  const empty = new Uint8Array(0);
  assertEquals(validateMagicBytes(empty, 'image'), false);
});

Deno.test('Security - unauthenticated include_inactive returns only active items', async () => {
  clearDatabase();

  const { categoryRepository } = await import('../../src/repositories/category.ts');
  const { itemRepository } = await import('../../src/repositories/item.ts');

  const category = await categoryRepository.create({ name: 'Test Category' });
  await itemRepository.create({ name: 'Active Item', category_id: category.id });
  const inactiveItem = await itemRepository.create({ name: 'Inactive Item', category_id: category.id });
  await itemRepository.deactivate(inactiveItem.id);

  // Unauthenticated request with include_inactive=true should NOT return inactive items
  const response = await testRequest('/api/items?include_inactive=true');
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, 'Active Item');
});

Deno.test('Security - X-Forwarded-For header is ignored when TRUSTED_PROXY is false', async () => {
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  const { userRepository } = await import('../../src/repositories/user.ts');
  await userRepository.create({
    email: 'ratelimit@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Make requests with different X-Forwarded-For headers
  // They should all count against the same bucket since TRUSTED_PROXY=false
  for (let i = 0; i < 11; i++) {
    await testRequest('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `1.2.3.${i}`,
      },
      body: JSON.stringify({ email: 'ratelimit@example.com', password: 'wrong' }),
    });
  }

  // 11th+ request should be rate limited (all share same bucket despite spoofed IPs)
  const response = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '9.9.9.9',
    },
    body: JSON.stringify({ email: 'ratelimit@example.com', password: 'wrong' }),
  });

  assertEquals(response.status, 429);
});

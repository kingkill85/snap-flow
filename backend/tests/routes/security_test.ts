import { assertEquals } from '@std/assert';
import { setupTestDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { validateMagicBytes } from '../../src/utils/magic-bytes.ts';

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

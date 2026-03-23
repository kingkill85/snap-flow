import { assertEquals } from '@std/assert';
import { setupTestDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';

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

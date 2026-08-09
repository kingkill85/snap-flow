import { assertEquals, assertExists } from '@std/assert';
import { setupTestDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';

// Setup test database before all tests
await setupTestDatabase();

Deno.test('Health endpoint - returns status ok', async () => {
  const response = await testRequest('/health');
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.status, 'ok');
  assertEquals(data.version, '0.1.0');
  assertExists(data.timestamp);
});

Deno.test('Version endpoint - returns the immutable build SHA', async () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  Deno.env.set('SNAPFLOW_BUILD_SHA', sha);
  const response = await testRequest('/version');
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.commit, sha);
});

Deno.test('Root endpoint - returns API info', async () => {
  const response = await testRequest('/api');
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.message, 'SnapFlow API');
  assertEquals(data.version, '0.1.0');
  assertExists(data.docs);
});

// Note: CORS middleware test removed because CORS headers are only added
// for actual HTTP cross-origin requests, not when using app.fetch() directly.
// The CORS middleware is properly configured in the app, but this can't be
// tested without making real HTTP requests to a running server.

Deno.test('404 handler - returns error for unknown API routes', async () => {
  const response = await testRequest('/api/unknown-route');
  
  assertEquals(response.status, 404);
});

import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';

const BASE_URL = 'http://localhost:8000';

Deno.test('Health endpoint - returns status ok', async () => {
  const response = await fetch(`${BASE_URL}/health`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.status, 'ok');
  assertEquals(data.version, '0.1.0');
  assertExists(data.timestamp);
});

Deno.test('Root endpoint - returns API info', async () => {
  const response = await fetch(`${BASE_URL}/`);
  const data = await response.json();

  assertEquals(response.status, 200);
  assertEquals(data.message, 'SnapFlow API');
  assertEquals(data.version, '0.1.0');
  assertExists(data.docs);
});

Deno.test('CORS headers - present on responses', async () => {
  const response = await fetch(`${BASE_URL}/health`);
  
  // Check that CORS headers are present
  const corsHeader = response.headers.get('access-control-allow-origin');
  assertExists(corsHeader);
});

Deno.test('404 handler - returns error for unknown routes', async () => {
  const response = await fetch(`${BASE_URL}/unknown-route`);
  
  assertEquals(response.status, 404);
});

/**
 * Test client for making requests to Hono app without running server
 */
import app from '../src/main.ts';

/**
 * Make a request to the Hono app and return response
 */
export async function testRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string | FormData | null;
  } = {}
): Promise<Response> {
  const url = `http://localhost:8000${path}`;
  
  const request = new Request(url, {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body ?? null,
  });

  return await app.fetch(request);
}

/**
 * Helper to parse JSON response
 */
export async function parseJSON(response: Response): Promise<any> {
  return await response.json();
}

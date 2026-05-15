import type { Context } from 'hono';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { handleMcpRequest } from '../services/mcp/server.ts';
import { publicBaseUrl } from '../utils/public-url.ts';

/**
 * Build the /mcp route. Takes the top-level Hono app as a closure so the MCP
 * tools can dispatch back through it via app.fetch (Pattern B).
 */
export function buildMcpRoutes(app: Hono): Hono {
  const mcpRoutes = new Hono();

  function setWwwAuthenticate(c: Context, baseUrl: string): void {
    c.header(
      'WWW-Authenticate',
      `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
    );
  }

  mcpRoutes.use('/', async (c, next) => {
    const baseUrl = publicBaseUrl(c);
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      setWwwAuthenticate(c, baseUrl);
      return c.json({ error: 'unauthorized' }, 401);
    }
    // Delegate to authMiddleware. If it returns a 401, annotate the response.
    const res = await authMiddleware(c, next);
    if (res && res.status === 401) {
      const headers = new Headers(res.headers);
      headers.set(
        'WWW-Authenticate',
        `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`,
      );
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  });

  mcpRoutes.post('/', async (c) => {
    const accessToken = c.req.header('Authorization')!.substring(7);
    const body = await c.req.json();
    const result = await handleMcpRequest(app, accessToken, body);
    return c.json(result);
  });

  return mcpRoutes;
}

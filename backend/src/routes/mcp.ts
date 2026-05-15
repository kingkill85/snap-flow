import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { handleMcpRequest } from '../services/mcp/server.ts';

/**
 * Build the /mcp route. Takes the top-level Hono app as a closure so the MCP
 * tools can dispatch back through it via app.fetch (Pattern B).
 */
export function buildMcpRoutes(app: Hono): Hono {
  const mcpRoutes = new Hono();

  mcpRoutes.use('/', async (c, next) => {
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      const baseUrl = new URL(c.req.url);
      c.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${baseUrl.protocol}//${baseUrl.host}/.well-known/oauth-protected-resource"`,
      );
      return c.json({ error: 'unauthorized' }, 401);
    }
    return await authMiddleware(c, next);
  });

  mcpRoutes.post('/', async (c) => {
    const accessToken = c.req.header('Authorization')!.substring(7);
    const body = await c.req.json();
    const result = await handleMcpRequest(app, accessToken, body);
    return c.json(result);
  });

  return mcpRoutes;
}

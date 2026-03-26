import type { Context, Next } from 'hono';
import { verifyToken } from '../services/jwt.ts';

/**
 * Auth middleware - verifies JWT token from Authorization header
 * Sets userId, userEmail, userRole, tenantId on Hono context
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token);

    c.set('userId', parseInt(payload.sub));
    c.set('userEmail', payload.email);
    c.set('userRole', payload.role);
    c.set('tenantId', payload.tenantId);

    await next();
  } catch (_error) {
    return c.json({ error: 'Unauthorized - Invalid token' }, 401);
  }
}

/**
 * Tenant admin middleware - checks if user has tenant_admin or admin role
 * Must be used after authMiddleware
 */
export async function tenantAdminMiddleware(c: Context, next: Next): Promise<Response | void> {
  const userRole = c.get('userRole');

  if (userRole !== 'tenant_admin' && userRole !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  await next();
}

/**
 * Admin middleware - checks if user has admin role
 * Must be used after authMiddleware
 */
export async function adminMiddleware(c: Context, next: Next): Promise<Response | void> {
  const userRole = c.get('userRole');

  if (userRole !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }

  await next();
}

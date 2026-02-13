import type { Context, Next } from 'hono';
import { verifyToken } from '../services/jwt.ts';

/**
 * Auth middleware - verifies JWT token from Authorization header
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized - No token provided' }, 401);
  }

  const token = authHeader.substring(7);

  try {
    const payload = await verifyToken(token);
    
    // Add user info to context for use in routes
    c.set('userId', parseInt(payload.sub));
    c.set('userEmail', payload.email);
    c.set('userRole', payload.role);
    
    await next();
  } catch (error) {
    return c.json({ error: 'Unauthorized - Invalid token' }, 401);
  }
}

/**
 * Admin middleware - checks if user has admin role
 * Must be used after authMiddleware
 */
export async function adminMiddleware(c: Context, next: Next) {
  const userRole = c.get('userRole');
  
  if (userRole !== 'admin') {
    return c.json({ error: 'Forbidden - Admin access required' }, 403);
  }
  
  await next();
}

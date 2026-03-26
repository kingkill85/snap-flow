import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { userRepository } from '../repositories/user.ts';
import { hashPassword } from '../services/password.ts';
import { authMiddleware, tenantAdminMiddleware } from '../middleware/auth.ts';
import type { TenantContext } from '../repositories/user.ts';
import type { UserRole } from '../models/index.ts';

const userRoutes = new Hono();

// Validation schema for creating users
const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  password: z.string().min(8),
  role: z.enum(['admin', 'tenant_admin', 'user']).optional(),
  tenant_id: z.number().optional(),
});

function getUserTenantCtx(c: { get: (key: string) => unknown; req: { query: (key: string) => string | undefined } }): TenantContext {
  const role = c.get('userRole') as TenantContext['role'];
  const tenantId = c.get('tenantId') as number;

  // Admin can filter by specific tenant via query param
  const queryTenantId = c.req.query('tenantId');
  if (queryTenantId && role === 'admin') {
    return { tenantId: parseInt(queryTenantId), role: 'tenant_admin' }; // Force filtering
  }

  return { tenantId, role };
}

// POST /users - Create new user
userRoutes.post('/', authMiddleware, tenantAdminMiddleware, zValidator('json', createUserSchema), async (c) => {
  const { email, full_name, password, role, tenant_id } = c.req.valid('json');
  const callerRole = c.get('userRole') as UserRole;
  const callerTenantId = c.get('tenantId') as number;

  try {
    // Check if user already exists
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      return c.json({ error: 'User with this email already exists' }, 400);
    }

    // Determine target tenant
    let targetTenantId = callerTenantId;
    if (tenant_id && callerRole === 'admin') {
      targetTenantId = tenant_id;
    }

    // Prevent tenant admin from creating admin users
    if (role === 'admin' && callerRole !== 'admin') {
      return c.json({ error: 'Only admins can create admin users' }, 403);
    }

    const passwordHash = hashPassword(password);

    const user = await userRepository.create({
      email,
      full_name,
      password_hash: passwordHash,
      role: role || 'user',
      tenant_id: targetTenantId,
    });

    return c.json({
      data: user,
      message: 'User created successfully',
    }, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /users - List users (filtered by tenant)
userRoutes.get('/', authMiddleware, tenantAdminMiddleware, async (c) => {
  try {
    const ctx = getUserTenantCtx(c);
    const users = await userRepository.findAll(ctx);
    return c.json({
      data: users,
    });
  } catch (error) {
    console.error('List users error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /users/:id - Update user (admin only)
userRoutes.put('/:id', authMiddleware, tenantAdminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const body = await c.req.json();
  const callerRole = c.get('userRole') as UserRole;
  const callerTenantId = c.get('tenantId') as number;

  try {
    const existingUser = await userRepository.findById(id);
    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Tenant admin can only edit users in their own tenant
    if (callerRole !== 'admin' && existingUser.tenant_id !== callerTenantId) {
      return c.json({ error: 'Forbidden - Cannot edit users from other tenants' }, 403);
    }

    const updateData: { full_name?: string; email?: string; password_hash?: string; role?: UserRole; tenant_id?: number; is_active?: number } = {};

    if (body.full_name !== undefined) {
      updateData.full_name = body.full_name;
    }

    if (body.email) {
      const userWithEmail = await userRepository.findByEmail(body.email);
      if (userWithEmail && userWithEmail.id !== id) {
        return c.json({ error: 'Email already in use' }, 400);
      }
      updateData.email = body.email;
    }

    if (body.password) {
      updateData.password_hash = hashPassword(body.password);
    }

    if (body.role && ['admin', 'tenant_admin', 'user'].includes(body.role)) {
      // Only admin can assign admin role
      if (body.role === 'admin' && callerRole !== 'admin') {
        return c.json({ error: 'Only admins can assign admin role' }, 403);
      }
      updateData.role = body.role;
    }

    if (body.tenant_id && callerRole === 'admin') {
      updateData.tenant_id = body.tenant_id;
    }

    if (body.is_active !== undefined) {
      // Prevent deactivating admin users
      if (!body.is_active && existingUser.role === 'admin') {
        return c.json({ error: 'Cannot deactivate admin users' }, 403);
      }
      updateData.is_active = body.is_active;
    }

    if (Object.keys(updateData).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    const updatedUser = await userRepository.update(id, updateData);

    return c.json({
      data: updatedUser,
      message: 'User updated successfully',
    });
  } catch (error) {
    console.error('Update user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /users/:id - Delete user
userRoutes.delete('/:id', authMiddleware, tenantAdminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const currentUserId = c.get('userId');
  const callerRole = c.get('userRole') as UserRole;
  const callerTenantId = c.get('tenantId') as number;

  if (id === currentUserId) {
    return c.json({ error: 'Cannot delete your own account' }, 400);
  }

  try {
    const user = await userRepository.findById(id);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Tenant admin can only delete users in their own tenant
    if (callerRole !== 'admin' && user.tenant_id !== callerTenantId) {
      return c.json({ error: 'Forbidden - Cannot delete users from other tenants' }, 403);
    }

    await userRepository.delete(id);
    return c.json({
      message: 'User deleted successfully',
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default userRoutes;

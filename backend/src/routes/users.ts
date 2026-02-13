import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { userRepository } from '../repositories/user.ts';
import { hashPassword } from '../services/password.ts';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';

const userRoutes = new Hono();

// Validation schema for creating users
const createUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().optional(),
  password: z.string().min(6),
  role: z.enum(['admin', 'user']).optional(),
});

// POST /users - Create new user
userRoutes.post('/', authMiddleware, adminMiddleware, zValidator('json', createUserSchema), async (c) => {
  const { email, full_name, password, role } = c.req.valid('json');

  try {
    // Check if user already exists
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      return c.json({ error: 'User with this email already exists' }, 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user
    const user = await userRepository.create({
      email,
      full_name,
      password_hash: passwordHash,
      role: role || 'user',
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

// GET /users - List all users
userRoutes.get('/', authMiddleware, adminMiddleware, async (c) => {
  try {
    const users = await userRepository.findAll();
    return c.json({
      data: users,
    });
  } catch (error) {
    console.error('List users error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /users/:id - Update user (admin only)
userRoutes.put('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  const body = await c.req.json();
  
  try {
    // Check if user exists
    const existingUser = await userRepository.findById(id);
    if (!existingUser) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    // Admin can update: full_name, email, password, role
    const updateData: { full_name?: string; email?: string; password_hash?: string; role?: 'admin' | 'user' } = {};
    
    if (body.full_name !== undefined) {
      updateData.full_name = body.full_name;
    }
    
    if (body.email) {
      // Check if email is already taken by another user
      const userWithEmail = await userRepository.findByEmail(body.email);
      if (userWithEmail && userWithEmail.id !== id) {
        return c.json({ error: 'Email already in use' }, 400);
      }
      updateData.email = body.email;
    }
    
    if (body.password) {
      updateData.password_hash = await hashPassword(body.password);
    }
    
    if (body.role && ['admin', 'user'].includes(body.role)) {
      updateData.role = body.role;
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
userRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  const currentUserId = c.get('userId');

  if (id === currentUserId) {
    return c.json({ error: 'Cannot delete your own account' }, 400);
  }

  try {
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

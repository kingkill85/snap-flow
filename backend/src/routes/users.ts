import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { userRepository } from '../repositories/user.ts';
import { hashPassword } from '../services/password.ts';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';

const userRoutes = new Hono();

// Validation schema
const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'user']).optional(),
});

// POST /users - Create new user
userRoutes.post('/', authMiddleware, adminMiddleware, zValidator('json', createUserSchema), async (c) => {
  const { email, password, role } = c.req.valid('json');

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

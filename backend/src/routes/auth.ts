import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { userRepository } from '../repositories/user.ts';
import { hashPassword, comparePassword } from '../services/password.ts';
import { generateToken } from '../services/jwt.ts';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';

const authRoutes = new Hono();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['admin', 'user']).optional(),
});

// POST /auth/login - Authenticate user
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json');

  try {
    // Find user by email
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Verify password
    const isValid = await comparePassword(password, user.password_hash);
    if (!isValid) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }

    // Generate JWT token
    const token = await generateToken(user.id, user.email, user.role);

    return c.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
        token,
      },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /auth/logout - Invalidate token (client-side for JWT)
authRoutes.post('/logout', authMiddleware, async (c) => {
  // With JWT, logout is handled client-side by removing the token
  return c.json({
    message: 'Logout successful',
  });
});

// GET /auth/me - Get current user info
authRoutes.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  
  try {
    const user = await userRepository.findById(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      data: {
        id: user.id,
        email: user.email,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// User management routes (admin only)

// POST /users - Create new user
authRoutes.post('/users', authMiddleware, adminMiddleware, zValidator('json', createUserSchema), async (c) => {
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
authRoutes.get('/users', authMiddleware, adminMiddleware, async (c) => {
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
authRoutes.delete('/users/:id', authMiddleware, adminMiddleware, async (c) => {
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

export default authRoutes;

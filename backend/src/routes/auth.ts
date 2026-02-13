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
          full_name: user.full_name,
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
        full_name: user.full_name,
        role: user.role,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /auth/me - Update current user profile
authRoutes.put('/me', authMiddleware, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json();
  
  try {
    // Users can only update: full_name, email, password
    // Cannot change: id, role, created_at
    const updateData: { full_name?: string; email?: string; password_hash?: string } = {};
    
    if (body.full_name !== undefined) {
      updateData.full_name = body.full_name;
    }
    
    if (body.email) {
      // Check if email is already taken by another user
      const existingUser = await userRepository.findByEmail(body.email);
      if (existingUser && existingUser.id !== userId) {
        return c.json({ error: 'Email already in use' }, 400);
      }
      updateData.email = body.email;
    }
    
    if (body.password) {
      const { hashPassword } = await import('../services/password.ts');
      updateData.password_hash = await hashPassword(body.password);
    }
    
    if (Object.keys(updateData).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }
    
    const updatedUser = await userRepository.update(userId, updateData);
    
    if (!updatedUser) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    return c.json({
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        role: updatedUser.role,
        created_at: updatedUser.created_at,
      },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default authRoutes;

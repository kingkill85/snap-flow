import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './config/env.ts';
import authRoutes from './routes/auth.ts';
import userRoutes from './routes/users.ts';
import categoryRoutes from './routes/categories.ts';
import itemRoutes from './routes/items.ts';

const app = new Hono();

// Middleware
app.use(logger());
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// Health check endpoint (public, no /api prefix)
app.get('/health', (c: Context) => {
  return c.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '0.1.0'
  });
});

// Root endpoint (public)
app.get('/', (c: Context) => {
  return c.json({ 
    message: 'SnapFlow API',
    version: '0.1.0',
    docs: '/health'
  });
});

// API routes (all protected routes under /api)
const api = new Hono();

// Auth routes at /api/auth/*
// Includes: /login, /logout, /me
api.route('/auth', authRoutes);

// User management routes at /api/users/*
// Includes: / (POST, GET), /:id (DELETE)
api.route('/users', userRoutes);

// Category routes at /api/categories/*
api.route('/categories', categoryRoutes);

// Item routes at /api/items/*
api.route('/items', itemRoutes);

// Mount API router
app.route('/api', api);

// Serve uploaded files statically at /uploads/*
// This allows accessing item images via /uploads/items/filename.jpg
app.get('/uploads/*', async (c: Context) => {
  const filePath = c.req.path.replace('/uploads/', '');
  const fullPath = `${env.UPLOAD_DIR}/${filePath}`;

  try {
    const file = await Deno.open(fullPath);
    const stat = await file.stat();
    
    // Determine content type
    const ext = filePath.split('.').pop()?.toLowerCase();
    let contentType = 'application/octet-stream';
    
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        contentType = 'image/jpeg';
        break;
      case 'png':
        contentType = 'image/png';
        break;
      case 'webp':
        contentType = 'image/webp';
        break;
    }

    c.header('Content-Type', contentType);
    c.header('Content-Length', stat.size.toString());
    
    return c.body(file.readable);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return c.json({ error: 'File not found' }, 404);
    }
    console.error('Serve uploads error:', error);
    return c.json({ error: 'Failed to serve file' }, 500);
  }
});

// Start server
const port = env.PORT;
console.log(`🚀 SnapFlow API server starting on port ${port}...`);

Deno.serve({
  port,
  onListen: () => {
    console.log(`✅ Server running at http://localhost:${port}`);
    console.log(`📊 Health check: http://localhost:${port}/health`);
    console.log(`🔒 API routes: http://localhost:${port}/api`);
  },
}, app.fetch);

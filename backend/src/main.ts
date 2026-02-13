import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { env } from './config/env.ts';
import authRoutes from './routes/auth.ts';

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

// Auth routes
api.route('/auth', authRoutes);
api.route('/users', authRoutes);

// Mount API router
app.route('/api', api);

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

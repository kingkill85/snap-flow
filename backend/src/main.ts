import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/deno';
import { env } from './config/env.ts';
import { runMigrations } from './scripts/migrate.ts';
import authRoutes from './routes/auth.ts';
import userRoutes from './routes/users.ts';
import categoryRoutes from './routes/categories.ts';
import itemRoutes from './routes/items.ts';
import projectRoutes from './routes/projects.ts';
import floorplanRoutes from './routes/floorplans.ts';
import placementRoutes from './routes/placements.ts';

const app = new Hono();

// Middleware
app.use(logger());
app.use(cors({
  origin: (origin) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return '*';
    
    // In production, check against allowed origins
    if (env.NODE_ENV === 'production') {
      // Allow the configured origin
      if (origin === env.CORS_ORIGIN) {
        return origin;
      }
      
      // Allow any localhost origin for development
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return origin;
      }
      
      // Allow local network IPs (192.168.x.x, 10.x.x.x)
      if (/^http:\/\/192\.168\.\d+\.\d+/.test(origin) || 
          /^http:\/\/10\.\d+\.\d+\.\d+/.test(origin)) {
        return origin;
      }
      
      // If CORS_ORIGIN is '*', allow all
      if (env.CORS_ORIGIN === '*') {
        return '*';
      }
      
      return env.CORS_ORIGIN;
    }
    
    // In development, allow all origins
    return origin || '*';
  },
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

// API root endpoint (always returns JSON, even with frontend)
app.get('/api', (c: Context) => {
  return c.json({ 
    message: 'SnapFlow API',
    version: '0.1.0',
    docs: '/health'
  });
});

// API routes (all protected routes under /api)
const api = new Hono();

// Auth routes at /api/auth/*
api.route('/auth', authRoutes);

// User management routes at /api/users/*
api.route('/users', userRoutes);

// Category routes at /api/categories/*
api.route('/categories', categoryRoutes);

// Item routes at /api/items/*
api.route('/items', itemRoutes);

// Project routes at /api/projects/*
api.route('/projects', projectRoutes);

// Floorplan routes at /api/floorplans/*
api.route('/floorplans', floorplanRoutes);

// Placement routes at /api/placements/*
api.route('/placements', placementRoutes);

// Mount API router
app.route('/api', api);

// 404 handler for unknown API routes (must come before static file serving)
app.get('/api/*', (c: Context) => {
  return c.json({ error: 'Not found' }, 404);
});

// Serve uploaded files statically at /uploads/*
app.get('/uploads/*', async (c: Context) => {
  const filePath = c.req.path.replace('/uploads/', '');
  const fullPath = `${env.UPLOAD_DIR}/${filePath}`;

  try {
    const file = await Deno.open(fullPath);
    const stat = await file.stat();
    
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
    c.header('Access-Control-Allow-Origin', '*');
    
    return c.body(file.readable);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return c.json({ error: 'File not found' }, 404);
    }
    console.error('Serve uploads error:', error);
    return c.json({ error: 'Failed to serve file' }, 500);
  }
});

app.options('/uploads/*', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  return c.body(null, 204);
});

// Serve static frontend files
// In Docker, frontend is at ../frontend/dist
// In development, this path won't exist so it will be skipped
const frontendPath = '../frontend/dist';

try {
  // Check if frontend dist exists
  const stat = await Deno.stat(frontendPath);
  if (stat.isDirectory) {
    console.log(`📁 Serving frontend from ${frontendPath}`);
    
    // Serve static files
    app.use('/*', serveStatic({ root: frontendPath }));
    
    // SPA fallback - serve index.html for all non-API routes
    app.get('*', async (c) => {
      try {
        const file = await Deno.open(`${frontendPath}/index.html`);
        c.header('Content-Type', 'text/html');
        return c.body(file.readable);
      } catch (error) {
        return c.json({ error: 'Not found' }, 404);
      }
    });
  }
} catch (error) {
  // Frontend dist doesn't exist, running in development mode
  console.log('⚠️ Frontend dist not found, running in API-only mode');
  
  // Root endpoint for API-only mode
  app.get('/', (c: Context) => {
    return c.json({ 
      message: 'SnapFlow API',
      version: '0.1.0',
      docs: '/health'
    });
  });
}

// Export app for testing
export default app;

// Start server only if this is the main module
if (import.meta.main) {
  // Run migrations before starting server
  console.log('🔄 Running database migrations...');
  try {
    await runMigrations();
    console.log('✅ Database migrations complete');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    Deno.exit(1);
  }

  // Seed admin user on first run
  console.log('🌱 Checking for admin user...');
  try {
    const { seedAdmin } = await import('./scripts/seed-admin.ts');
    await seedAdmin();
  } catch (error) {
    console.error('❌ Failed to run seed script:', error);
  }

  // Start server
  const port = env.PORT;
  console.log(`🚀 SnapFlow API server starting on port ${port}...`);

  Deno.serve({
    port,
    hostname: '0.0.0.0',
    onListen: ({ hostname, port }) => {
      console.log(`✅ Server running at http://${hostname}:${port}`);
      console.log(`📊 Health check: http://${hostname}:${port}/health`);
      console.log(`🔒 API routes: http://${hostname}:${port}/api`);
      console.log(`🌐 Accessible from Windows at: http://localhost:${port}`);
    },
  }, app.fetch);
}

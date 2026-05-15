import { resolve } from '@std/path';
import type { Context } from 'hono';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from 'hono/deno';
import { env } from './config/env.ts';
import { runMigrations } from './scripts/migrate.ts';
import { runBomImageMigration } from './services/bom-image-migration.ts';
import { cleanupExpiredTokens } from './services/refresh-token.ts';
import { oauthCodeRepository } from './repositories/oauth-code.ts';
import authRoutes from './routes/auth.ts';
import userRoutes from './routes/users.ts';
import categoryRoutes from './routes/categories.ts';
import { itemTypeRoutes } from './routes/item-types.ts';
import itemRoutes from './routes/items.ts';
import projectRoutes from './routes/projects.ts';
import floorplanRoutes from './routes/floorplans.ts';
import placementRoutes from './routes/placements.ts';
import currencyRoutes from './routes/currency.ts';
import settingsRoutes from './routes/settings.ts';
import areaRoutes from './routes/areas.ts';
import tenantRoutes from './routes/tenants.ts';
import projectGroupRoutes from './routes/project-groups.ts';
import oauthRoutes from './routes/oauth.ts';
import oauthConsentRoutes from './routes/oauth-consent.ts';
import wellKnownRoutes from './routes/well-known.ts';
import { buildMcpRoutes } from './routes/mcp.ts';

const app: Hono = new Hono();

// Middleware
app.use(logger());
app.use(cors({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return '*';

    if (env.NODE_ENV === 'production') {
      // Only allow the configured origin
      if (origin === env.CORS_ORIGIN) {
        return origin;
      }

      // If CORS_ORIGIN is '*', allow all
      if (env.CORS_ORIGIN === '*') {
        return '*';
      }

      return env.CORS_ORIGIN;
    }

    // In development, allow all origins including localhost and LAN
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

// NOTE: All authenticated users share a single workspace by design.
// There are no per-user ownership checks on projects, floorplans,
// or placements. This is intentional for single-business deployments.

// API routes (all protected routes under /api)
const api = new Hono();

// Auth routes at /api/auth/*
api.route('/auth', authRoutes);

// User management routes at /api/users/*
api.route('/users', userRoutes);

// Category routes at /api/categories/*
api.route('/categories', categoryRoutes);

// Item type routes at /api/item-types/*
api.route('/item-types', itemTypeRoutes);

// Item routes at /api/items/*
api.route('/items', itemRoutes);

// Project routes at /api/projects/*
api.route('/projects', projectRoutes);

// Floorplan routes at /api/floorplans/*
api.route('/floorplans', floorplanRoutes);

// Placement routes at /api/placements/*
api.route('/placements', placementRoutes);

// Currency routes at /api/currency/*
api.route('/currency', currencyRoutes);

// Settings routes at /api/settings/*
api.route('/settings', settingsRoutes);

// Area routes at /api/areas/*
api.route('/areas', areaRoutes);

// Tenant management routes at /api/tenants/*
api.route('/tenants', tenantRoutes);

// Project group routes at /api/project-groups/*
api.route('/project-groups', projectGroupRoutes);

// Mount API router
app.route('/api', api);

// OAuth 2.1 endpoints (no /api prefix — at the app root per spec)
app.route('/oauth', oauthRoutes);
app.route('/oauth', oauthConsentRoutes);

// /.well-known/* metadata
app.route('/', wellKnownRoutes);

// MCP endpoint (Streamable HTTP) — receives the top-level app so its
// tools can dispatch back through it via app.fetch.
app.route('/mcp', buildMcpRoutes(app));

// 404 handler for unknown API routes (must come before static file serving)
app.get('/api/*', (c: Context) => {
  return c.json({ error: 'Not found' }, 404);
});

// Serve uploaded files statically at /uploads/*
app.get('/uploads/*', async (c: Context) => {
  const filePath = c.req.path.replace('/uploads/', '');

  // Prevent path traversal
  const uploadBase = resolve(env.UPLOAD_DIR);
  const fullPath = resolve(env.UPLOAD_DIR, filePath);
  if (!fullPath.startsWith(uploadBase + '/')) {
    return c.json({ error: 'File not found' }, 404);
  }

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
    
    // Add aggressive caching for processed images
    // Immutable flag tells browser the file content never changes
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    
    // Add ETag for cache validation
    if (stat.mtime) {
      const etag = `"${stat.mtime.getTime().toString(36)}-${stat.size.toString(36)}"`;
      c.header('ETag', etag);
      c.header('Last-Modified', stat.mtime.toUTCString());
      
      // Check if client has cached version
      const ifNoneMatch = c.req.header('If-None-Match');
      if (ifNoneMatch === etag) {
        file.close();
        return c.body(null, 304); // Not Modified
      }
    }
    
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
      } catch (_error) {
        return c.json({ error: 'Not found' }, 404);
      }
    });
  }
} catch (_error) {
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

  // Run BOM image migration (copies catalog images to project folders)
  // This is idempotent and only processes entries that haven't been migrated yet
  console.log('🖼️ Checking for BOM image migrations...');
  try {
    await runBomImageMigration();
  } catch (error) {
    console.error('❌ BOM image migration failed:', error);
    // Don't exit - image migration failure shouldn't prevent server startup
  }

  // Seed admin user on first run
  console.log('🌱 Checking for admin user...');
  try {
    const { seedAdmin } = await import('./scripts/seed-admin.ts');
    seedAdmin();
  } catch (error) {
    console.error('❌ Failed to run seed script:', error);
  }

  // Schedule periodic cleanup of expired refresh tokens and oauth codes
  cleanupExpiredTokens();
  oauthCodeRepository.deleteExpired();
  setInterval(() => {
    cleanupExpiredTokens();
    oauthCodeRepository.deleteExpired();
  }, 60 * 60 * 1000); // Every hour
  console.log('🧹 Token cleanup scheduled (hourly)');

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
  }, (req, info) => {
    return app.fetch(req, { remoteAddr: info.remoteAddr });
  });
}

import { Hono } from 'hono';
import { settingsRepository } from '../repositories/settings.ts';
import { authMiddleware } from '../middleware/auth.ts';

/**
 * Settings Routes
 * Provides endpoints for global application settings
 */

const settingsRoutes = new Hono();

/**
 * GET /api/settings/last-sync-timestamp
 * Returns the timestamp of the last Excel sync operation
 * Used by frontend for image cache busting
 */
settingsRoutes.get('/last-sync-timestamp', authMiddleware, async (c) => {
  try {
    const timestamp = await settingsRepository.getLastSyncTimestamp();
    return c.json({
      success: true,
      data: { timestamp },
    });
  } catch (error) {
    console.error('Error fetching last sync timestamp:', error);
    return c.json(
      {
        success: false,
        error: 'Failed to fetch sync timestamp',
      },
      500
    );
  }
});

export default settingsRoutes;

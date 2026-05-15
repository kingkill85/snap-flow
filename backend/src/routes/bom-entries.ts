import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { bomEntryRepository } from '../repositories/bom-entry.ts';
import { getDb } from '../config/database.ts';

const bomEntryRoutes = new Hono();

/**
 * GET /bom-entries/:id - Fetch a single BOM entry by id, tenant-scoped.
 *
 * project_bom rows don't carry tenant_id directly; we join through projects
 * and reject if the row's project belongs to a different tenant (admins see
 * everything). This is intentionally read-only — mutations still go through
 * the floorplan/placement routes.
 */
bomEntryRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);

  try {
    const entry = await bomEntryRepository.findById(id);
    if (!entry) return c.json({ error: 'BOM entry not found' }, 404);

    const role = c.get('userRole') as string | undefined;
    if (role !== 'admin') {
      const tenantId = c.get('tenantId') as number | undefined;
      if (tenantId === undefined) return c.json({ error: 'Forbidden' }, 403);
      const rows = getDb().queryEntries(
        `SELECT 1 FROM projects WHERE id = ? AND tenant_id = ?`,
        [entry.project_id, tenantId],
      );
      if (rows.length === 0) return c.json({ error: 'BOM entry not found' }, 404);
    }

    return c.json({ data: entry });
  } catch (error) {
    console.error('Get bom entry error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default bomEntryRoutes;

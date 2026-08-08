import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { placementRepository } from '../repositories/placement.ts';

import { bomService } from '../services/bom.ts';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { areaRepository } from '../repositories/area.ts';
import { authMiddleware, tenantAdminMiddleware } from '../middleware/auth.ts';

// Helper function to clean up empty BOM entries
async function cleanupEmptyBomEntry(bomEntryId: number): Promise<void> {
  const count = await placementRepository.countByBomEntry(bomEntryId);
  if (count === 0) {
    // No more placements, delete the BOM entry with image cleanup
    await bomService.deleteBomEntry(bomEntryId);
  }
}

const placementRoutes = new Hono();

// Validation schemas
const createPlacementSchema = z.object({
  floorplan_id: z.number(),
  item_variant_id: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().min(0).max(359.99).optional(),
});

const updatePlacementSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  rotation: z.number().min(0).max(359.99).optional(),
  area_id: z.number().nullable().optional(),
});

const bulkUpdateSchema = z.object({
  width: z.number().positive(),
  height: z.number().positive(),
});

// GET /placements - List all placements
placementRoutes.get('/', authMiddleware, async (c) => {
  try {
    const floorplanId = c.req.query('floorplan_id');

    if (floorplanId) {
      const placements = await placementRepository.findByFloorplan(
        parseInt(floorplanId),
      );
      return c.json({ data: placements });
    }

    const placements = await placementRepository.findAll();
    return c.json({ data: placements });
  } catch (error) {
    console.error('List placements error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /placements/bulk-update - Update dimensions for all placements of same item on floorplan
placementRoutes.post(
  '/bulk-update',
  authMiddleware,
  zValidator('json', bulkUpdateSchema),
  async (c) => {
    const { width, height } = c.req.valid('json');
    const floorplanId = c.req.query('floorplan_id');
    const itemId = c.req.query('item_id');

    if (!floorplanId || !itemId) {
      return c.json({
        error: 'Missing floorplan_id or item_id query parameter',
      }, 400);
    }

    try {
      await placementRepository.updateDimensionsForItem(
        parseInt(floorplanId),
        parseInt(itemId),
        width,
        height,
      );

      return c.json({
        message: 'Placements updated successfully',
      });
    } catch (error) {
      console.error('Bulk update placements error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// DELETE /placements/floorplan/:floorplanId - Delete all item placements on one editable floorplan
placementRoutes.delete(
  '/floorplan/:floorplanId',
  authMiddleware,
  tenantAdminMiddleware,
  async (c) => {
    const floorplanId = Number(c.req.param('floorplanId'));
    if (!Number.isInteger(floorplanId) || floorplanId <= 0) {
      return c.json({ error: 'Invalid floorplan ID' }, 400);
    }

    try {
      const floorplan = await floorplanRepository.findAccessibleForCleanup(
        floorplanId,
        c.get('tenantId'),
      );
      if (!floorplan) {
        return c.json({ error: 'Floorplan not found' }, 404);
      }
      if (floorplan.project_status !== 'active') {
        return c.json({ error: 'Floorplan is read-only' }, 403);
      }

      const deletedCount = await bomService.clearFloorplanPlacements(
        floorplanId,
      );
      return c.json({
        data: { deleted_count: deletedCount },
        message: 'Floorplan placements deleted successfully',
      });
    } catch (error) {
      console.error('Clean Slate placements error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// GET /placements/:id - Get single placement
placementRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const placement = await placementRepository.findById(id);
    if (!placement) {
      return c.json({ error: 'Placement not found' }, 404);
    }

    return c.json({ data: placement });
  } catch (error) {
    console.error('Get placement error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /placements - Create placement
// Creates BOM entry if needed, then creates placement
placementRoutes.post(
  '/',
  authMiddleware,
  zValidator('json', createPlacementSchema),
  async (c) => {
    const data = c.req.valid('json');

    try {
      // Check if floorplan exists
      const floorplan = await floorplanRepository.findById(data.floorplan_id);
      if (!floorplan) {
        return c.json({ error: 'Floorplan not found' }, 404);
      }

      // Get or create BOM entry for this variant
      const bomEntry = await bomService.createBomEntry(
        floorplan.project_id,
        data.floorplan_id,
        data.item_variant_id,
      );

      // Create placement referencing BOM entry
      const placement = await placementRepository.createWithBomEntry(
        bomEntry.id,
        data.floorplan_id,
        {
          x: data.x,
          y: data.y,
          width: data.width,
          height: data.height,
          rotation: data.rotation ?? 0,
        },
      );

      // Assign to containing area
      await areaRepository.recheckContainment(data.floorplan_id);
      // Re-fetch to get updated area_id
      const updated = await placementRepository.findById(placement!.id);

      return c.json({
        data: updated,
        message: 'Placement created successfully',
      }, 201);
    } catch (error) {
      console.error('Create placement error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// PUT /placements/:id - Update placement (position/size only)
placementRoutes.put(
  '/:id',
  authMiddleware,
  zValidator('json', updatePlacementSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid ID' }, 400);
    }
    const data = c.req.valid('json');

    try {
      const existingPlacement = await placementRepository.findById(id);
      if (!existingPlacement) {
        return c.json({ error: 'Placement not found' }, 404);
      }

      const placement = await placementRepository.update(id, data);

      // If position changed or area_id explicitly set, recheck containment
      if (placement && existingPlacement.type === 'item') {
        if (
          data.x !== undefined || data.y !== undefined ||
          data.area_id !== undefined
        ) {
          await areaRepository.recheckContainment(
            existingPlacement.floorplan_id,
          );
        }
      }

      return c.json({
        data: await placementRepository.findById(id),
        message: 'Placement updated successfully',
      });
    } catch (error) {
      console.error('Update placement error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// PUT /placements/:id/variant - Switch variant for placement
const switchVariantSchema = z.object({
  variant_id: z.number().int().positive(),
});

placementRoutes.put(
  '/:id/variant',
  authMiddleware,
  zValidator('json', switchVariantSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid ID' }, 400);
    }
    const { variant_id } = c.req.valid('json');

    try {
      const placement = await placementRepository.findById(id);
      if (!placement) {
        return c.json({ error: 'Placement not found' }, 404);
      }

      if (!placement.bom_id) {
        return c.json(
          { error: 'Cannot switch variant on an area placement' },
          400,
        );
      }

      // Switch variant in BOM entry (same placement, different BOM entry reference)
      const updatedBomEntry = await bomService.switchVariant(
        placement.bom_id,
        variant_id,
      );

      // Get placement with updated data
      const updatedPlacement = await placementRepository.findById(id);

      return c.json({
        data: {
          placement: updatedPlacement,
          bomEntry: updatedBomEntry,
        },
        message: 'Variant switched successfully',
      });
    } catch (error) {
      console.error('Switch variant error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// POST /placements/:id/update-bom - Update BOM with new variant and selected addons
// Cleanest approach: delete old BOM entry, create new one
const updateBomSchema = z.object({
  variant_id: z.number().int().positive(),
  addon_ids: z.array(z.number().int().positive()).default([]),
});

placementRoutes.post(
  '/:id/update-bom',
  authMiddleware,
  zValidator('json', updateBomSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid ID' }, 400);
    }
    const { variant_id, addon_ids } = c.req.valid('json');

    try {
      const placement = await placementRepository.findById(id);
      if (!placement) {
        return c.json({ error: 'Placement not found' }, 404);
      }

      // Recreate BOM entry with new variant and selected addons
      const newBomEntry = await bomService.recreateBomEntry(
        id,
        variant_id,
        addon_ids,
      );

      // Get placement with updated data
      const updatedPlacement = await placementRepository.findById(id);

      return c.json({
        data: {
          placement: updatedPlacement,
          bomEntry: newBomEntry,
        },
        message: 'BOM updated successfully',
      });
    } catch (error) {
      console.error('Update BOM error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

// DELETE /placements/:id - Delete placement
// Also deletes BOM entry if no more placements reference it
placementRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const placement = await placementRepository.findById(id);
    if (!placement) {
      return c.json({ error: 'Placement not found' }, 404);
    }

    const bomEntryId = placement.bom_id;

    // Delete the placement
    await placementRepository.delete(id);

    // Clean up BOM entry if no more placements
    if (bomEntryId) {
      await cleanupEmptyBomEntry(bomEntryId);
    }

    return c.json({
      message: 'Placement deleted successfully',
    });
  } catch (error) {
    console.error('Delete placement error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /placements/:id/duplicate - Duplicate a placement with all its BOM entries
const duplicatePlacementSchema = z.object({
  x: z.number(),
  y: z.number(),
});

placementRoutes.post(
  '/:id/duplicate',
  authMiddleware,
  zValidator('json', duplicatePlacementSchema),
  async (c) => {
    const id = parseInt(c.req.param('id'));
    if (isNaN(id)) {
      return c.json({ error: 'Invalid ID' }, 400);
    }
    const { x, y } = c.req.valid('json');

    try {
      const placement = await placementRepository.findById(id);
      if (!placement) {
        return c.json({ error: 'Placement not found' }, 404);
      }

      if (!placement.bom_id) {
        return c.json({ error: 'Cannot duplicate an area placement' }, 400);
      }

      // Duplicate the BOM entry (main + all children/addons)
      const newBomEntry = await bomService.duplicateBomEntry(placement.bom_id);

      // Create new placement with same dimensions/rotation but new position
      const newPlacement = await placementRepository.createWithBomEntry(
        newBomEntry.id,
        placement.floorplan_id,
        {
          x,
          y,
          width: placement.width,
          height: placement.height,
          rotation: placement.rotation,
        },
      );

      // Assign to containing area
      await areaRepository.recheckContainment(placement.floorplan_id);
      const updated = await placementRepository.findById(newPlacement!.id);

      return c.json({
        data: updated,
        message: 'Placement duplicated successfully',
      }, 201);
    } catch (error) {
      console.error('Duplicate placement error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  },
);

export default placementRoutes;

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { placementRepository } from '../repositories/placement.ts';
import { floorplanRepository } from '../repositories/floorplan.ts';
import { authMiddleware } from '../middleware/auth.ts';

const placementRoutes = new Hono();

// Validation schemas
const createPlacementSchema = z.object({
  floorplan_id: z.number().int().positive(),
  item_variant_id: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  selected_addons: z.string().optional(), // JSON array of addon IDs
});

const updatePlacementSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  item_variant_id: z.number().int().positive().optional(),
  selected_addons: z.string().optional(),
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
      const placements = await placementRepository.findByFloorplan(parseInt(floorplanId));
      return c.json({ data: placements });
    }
    
    const placements = await placementRepository.findAll();
    return c.json({ data: placements });
  } catch (error) {
    console.error('List placements error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /placements/:id - Get single placement
placementRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  
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
placementRoutes.post('/', authMiddleware, zValidator('json', createPlacementSchema), async (c) => {
  const data = c.req.valid('json');

  try {
    // Check if floorplan exists
    const floorplan = await floorplanRepository.findById(data.floorplan_id);
    if (!floorplan) {
      return c.json({ error: 'Floorplan not found' }, 404);
    }

    const placement = await placementRepository.create(data);

    return c.json({
      data: placement,
      message: 'Placement created successfully',
    }, 201);
  } catch (error) {
    console.error('Create placement error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /placements/:id - Update placement
placementRoutes.put('/:id', authMiddleware, zValidator('json', updatePlacementSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const data = c.req.valid('json');

  try {
    const existingPlacement = await placementRepository.findById(id);
    if (!existingPlacement) {
      return c.json({ error: 'Placement not found' }, 404);
    }

    const placement = await placementRepository.update(id, data);

    return c.json({
      data: placement,
      message: 'Placement updated successfully',
    });
  } catch (error) {
    console.error('Update placement error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /placements/:id - Delete placement
placementRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const placement = await placementRepository.findById(id);
    if (!placement) {
      return c.json({ error: 'Placement not found' }, 404);
    }

    await placementRepository.delete(id);
    
    return c.json({
      message: 'Placement deleted successfully',
    });
  } catch (error) {
    console.error('Delete placement error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /placements/bulk-update - Update dimensions for all placements of same item on floorplan
placementRoutes.post('/bulk-update', authMiddleware, zValidator('json', bulkUpdateSchema), async (c) => {
  const { width, height } = c.req.valid('json');
  const floorplanId = c.req.query('floorplan_id');
  const itemId = c.req.query('item_id');

  if (!floorplanId || !itemId) {
    return c.json({ error: 'Missing floorplan_id or item_id query parameter' }, 400);
  }

  try {
    await placementRepository.updateDimensionsForItem(
      parseInt(floorplanId),
      parseInt(itemId),
      width,
      height
    );
    
    return c.json({
      message: 'Placements updated successfully',
    });
  } catch (error) {
    console.error('Bulk update placements error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default placementRoutes;

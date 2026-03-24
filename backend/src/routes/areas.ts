import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.ts';
import { areaRepository } from '../repositories/area.ts';

const areaRoutes = new Hono();

// Validation schemas
const createAreaSchema = z.object({
  floorplan_id: z.number(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  name: z.string().optional(),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

const updateAreaSchema = z.object({
  name: z.string().optional(),
  color: z.string().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

const updateVerticesSchema = z.object({
  vertices: z.array(z.object({ x: z.number(), y: z.number() })).min(3),
});

// GET /areas - List areas for a floorplan
areaRoutes.get('/', authMiddleware, async (c) => {
  try {
    const floorplanId = c.req.query('floorplan_id');

    if (!floorplanId) {
      return c.json({ error: 'Missing floorplan_id query parameter' }, 400);
    }

    const areas = await areaRepository.findByFloorplan(parseInt(floorplanId));
    return c.json({ data: areas });
  } catch (error) {
    console.error('List areas error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /areas/:id - Get single area
areaRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const area = await areaRepository.findById(id);
    if (!area) {
      return c.json({ error: 'Area not found' }, 404);
    }

    return c.json({ data: area });
  } catch (error) {
    console.error('Get area error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /areas - Create area
areaRoutes.post('/', authMiddleware, zValidator('json', createAreaSchema), async (c) => {
  const data = c.req.valid('json');

  try {
    const area = await areaRepository.create({
      floorplan_id: data.floorplan_id,
      x: data.x,
      y: data.y,
      width: data.width,
      height: data.height,
      name: data.name,
      color: data.color,
      opacity: data.opacity,
    });

    // Recheck containment — new area might cover existing items
    await areaRepository.recheckContainment(data.floorplan_id);

    return c.json({
      data: area,
      message: 'Area created successfully',
    }, 201);
  } catch (error) {
    console.error('Create area error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /areas/:id - Update area properties
areaRoutes.put('/:id', authMiddleware, zValidator('json', updateAreaSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const data = c.req.valid('json');

  try {
    const existingArea = await areaRepository.findById(id);
    if (!existingArea) {
      return c.json({ error: 'Area not found' }, 404);
    }

    const area = await areaRepository.updateProperties(id, data);

    return c.json({
      data: area,
      message: 'Area updated successfully',
    });
  } catch (error) {
    console.error('Update area error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /areas/:id/vertices - Replace all vertices
areaRoutes.put('/:id/vertices', authMiddleware, zValidator('json', updateVerticesSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }
  const { vertices } = c.req.valid('json');

  try {
    const existingArea = await areaRepository.findById(id);
    if (!existingArea) {
      return c.json({ error: 'Area not found' }, 404);
    }

    const area = await areaRepository.updateVertices(id, vertices);

    // Recheck containment — area shape changed
    await areaRepository.recheckContainment(existingArea.floorplan_id);

    return c.json({
      data: area,
      message: 'Area vertices updated successfully',
    });
  } catch (error) {
    console.error('Update area vertices error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /areas/:id - Delete area
areaRoutes.delete('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) {
    return c.json({ error: 'Invalid ID' }, 400);
  }

  try {
    const area = await areaRepository.findById(id);
    if (!area) {
      return c.json({ error: 'Area not found' }, 404);
    }

    await areaRepository.delete(id);

    return c.json({
      message: 'Area deleted successfully',
    });
  } catch (error) {
    console.error('Delete area error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default areaRoutes;

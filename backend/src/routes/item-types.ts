import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';
import { itemTypeRepository } from '../repositories/item-type.ts';

const itemTypeRoutes = new Hono();

const createItemTypeSchema = z.object({
  name: z.string().min(1).max(100),
  abbreviation: z.string().min(1).max(10),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().optional(),
});

const updateItemTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  abbreviation: z.string().min(1).max(10).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

const reorderSchema = z.object({
  ids: z.array(z.number()),
});

// GET /item-types - List all
itemTypeRoutes.get('/', authMiddleware, async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === 'true';
    const types = await itemTypeRepository.findAll(includeInactive);
    return c.json({ data: types });
  } catch (error) {
    console.error('List item types error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /item-types - Create (admin)
itemTypeRoutes.post('/', authMiddleware, adminMiddleware, zValidator('json', createItemTypeSchema), async (c) => {
  const { name, abbreviation, color, sort_order } = c.req.valid('json');
  try {
    const existing = await itemTypeRepository.findByName(name);
    if (existing) return c.json({ error: 'Item type with this name already exists' }, 400);
    const createData: { name: string; abbreviation: string; color?: string; sort_order?: number } = { name, abbreviation };
    if (color !== undefined) createData.color = color;
    if (sort_order !== undefined) createData.sort_order = sort_order;
    const type = await itemTypeRepository.create(createData);
    return c.json({ data: type, message: 'Item type created successfully' }, 201);
  } catch (error) {
    console.error('Create item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /item-types/reorder - MUST be before /:id routes
itemTypeRoutes.patch('/reorder', authMiddleware, adminMiddleware, zValidator('json', reorderSchema), async (c) => {
  const { ids } = c.req.valid('json');
  try {
    await itemTypeRepository.reorder(ids);
    const types = await itemTypeRepository.findAll(true);
    return c.json({ data: types });
  } catch (error) {
    console.error('Reorder item types error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /item-types/:id
itemTypeRoutes.get('/:id', authMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  try {
    const type = await itemTypeRepository.findById(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type });
  } catch (error) {
    console.error('Get item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /item-types/:id - Update (admin)
itemTypeRoutes.put('/:id', authMiddleware, adminMiddleware, zValidator('json', updateItemTypeSchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  const { name, abbreviation, color, sort_order, is_active } = c.req.valid('json');
  try {
    if (name) {
      const existing = await itemTypeRepository.findByName(name);
      if (existing && existing.id !== id) return c.json({ error: 'Item type with this name already exists' }, 400);
    }
    const updateData: Record<string, string | number | boolean> = {};
    if (name !== undefined) updateData.name = name;
    if (abbreviation !== undefined) updateData.abbreviation = abbreviation;
    if (color !== undefined) updateData.color = color;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (is_active !== undefined) updateData.is_active = is_active;
    const type = await itemTypeRepository.update(id, updateData);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type, message: 'Item type updated successfully' });
  } catch (error) {
    console.error('Update item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /item-types/:id (admin)
itemTypeRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  try {
    const type = await itemTypeRepository.findById(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    await itemTypeRepository.delete(id);
    return c.json({ message: 'Item type deleted successfully' });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Cannot delete')) {
      return c.json({ error: error.message }, 400);
    }
    console.error('Delete item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /item-types/:id/deactivate (admin)
itemTypeRoutes.patch('/:id/deactivate', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  try {
    const type = await itemTypeRepository.deactivate(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type, message: 'Item type deactivated' });
  } catch (error) {
    console.error('Deactivate item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /item-types/:id/activate (admin)
itemTypeRoutes.patch('/:id/activate', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid ID' }, 400);
  try {
    const type = await itemTypeRepository.activate(id);
    if (!type) return c.json({ error: 'Item type not found' }, 404);
    return c.json({ data: type, message: 'Item type activated' });
  } catch (error) {
    console.error('Activate item type error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export { itemTypeRoutes };

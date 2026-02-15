import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { categoryRepository } from '../repositories/category.ts';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';

const categoryRoutes = new Hono();

// Validation schema for creating categories
const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  sort_order: z.number().optional(),
});

// Validation schema for updating categories
const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  sort_order: z.number().optional(),
  is_active: z.boolean().optional(),
});

// Validation schema for reordering
const reorderSchema = z.object({
  category_ids: z.array(z.number()),
});

// GET /categories - List all categories
// Public endpoint - returns only active categories by default
// Query param: include_inactive=true (admin only) to include inactive categories
// Categories are sorted by sort_order ASC, then name ASC
categoryRoutes.get('/', async (c) => {
  try {
    const includeInactive = c.req.query('include_inactive') === 'true';
    const categories = await categoryRepository.findAll(includeInactive);
    return c.json({
      data: categories,
    });
  } catch (error) {
    console.error('List categories error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /categories/:id - Get single category
categoryRoutes.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'));
  
  try {
    const category = await categoryRepository.findById(id);
    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }
    
    return c.json({
      data: category,
    });
  } catch (error) {
    console.error('Get category error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /categories - Create new category (admin only)
categoryRoutes.post('/', authMiddleware, adminMiddleware, zValidator('json', createCategorySchema), async (c) => {
  const { name, sort_order } = c.req.valid('json');

  try {
    // Check if category already exists
    const existingCategory = await categoryRepository.findByName(name);
    if (existingCategory) {
      return c.json({ error: 'Category with this name already exists' }, 400);
    }

    // Create category
    const category = await categoryRepository.create({
      name,
      ...(sort_order !== undefined && { sort_order }),
    });

    return c.json({
      data: category,
      message: 'Category created successfully',
    }, 201);
  } catch (error) {
    console.error('Create category error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PUT /categories/:id - Update category (admin only)
categoryRoutes.put('/:id', authMiddleware, adminMiddleware, zValidator('json', updateCategorySchema), async (c) => {
  const id = parseInt(c.req.param('id'));
  const { name, sort_order, is_active } = c.req.valid('json');

  try {
    // Check if category exists
    const existingCategory = await categoryRepository.findById(id);
    if (!existingCategory) {
      return c.json({ error: 'Category not found' }, 404);
    }

    // Check if name is already taken by another category
    if (name) {
      const categoryWithName = await categoryRepository.findByName(name);
      if (categoryWithName && categoryWithName.id !== id) {
        return c.json({ error: 'Category with this name already exists' }, 400);
      }
    }

    const updateData: { name?: string; sort_order?: number; is_active?: boolean } = {};
    if (name !== undefined) updateData.name = name;
    if (sort_order !== undefined) updateData.sort_order = sort_order;
    if (is_active !== undefined) updateData.is_active = is_active;

    const category = await categoryRepository.update(id, updateData);

    // Cascade: If deactivating category, also deactivate items and variants
    // Note: SQLite returns is_active as integer (0/1), not boolean, so we check both
    const existingIsActive = Boolean(existingCategory.is_active);
    if (is_active === false && existingIsActive) {
      await categoryRepository.deactivate(id);
      return c.json({
        data: category,
        message: 'Category deactivated successfully. All items and variants in this category have been deactivated.',
      });
    }

    return c.json({
      data: category,
      message: 'Category updated successfully',
    });
  } catch (error) {
    console.error('Update category error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /categories/:id - Delete category (admin only)
// Note: This will fail if items are using this category (foreign key constraint)
categoryRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const category = await categoryRepository.findById(id);
    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    await categoryRepository.delete(id);
    
    return c.json({
      message: 'Category deleted successfully',
    });
  } catch (error) {
    console.error('Delete category error:', error);
    // Check if it's a foreign key constraint error
    if (error instanceof Error && error.message.includes('FOREIGN KEY')) {
      return c.json({ error: 'Cannot delete category that has items assigned to it' }, 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /categories/reorder - Update sort order (admin only)
// Body: { category_ids: [3, 1, 2] }
// Sets sort_order to position in array (3=1, 1=2, 2=3)
categoryRoutes.patch('/reorder', authMiddleware, adminMiddleware, zValidator('json', reorderSchema), async (c) => {
  const { category_ids } = c.req.valid('json');

  try {
    await categoryRepository.reorder(category_ids);
    
    // Return updated categories
    const categories = await categoryRepository.findAll(true);
    return c.json({
      data: categories,
      message: 'Categories reordered successfully',
    });
  } catch (error) {
    console.error('Reorder categories error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /categories/:id/deactivate - Deactivate category (admin only)
// Cascades to all items and variants in this category
categoryRoutes.patch('/:id/deactivate', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const category = await categoryRepository.findById(id);
    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    const deactivatedCategory = await categoryRepository.deactivate(id);
    
    return c.json({
      data: deactivatedCategory,
      message: 'Category deactivated successfully. All items and variants in this category have been deactivated.',
    });
  } catch (error) {
    console.error('Deactivate category error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /categories/:id/activate - Activate category (admin only)
// Note: Does NOT cascade - items and variants must be activated individually
categoryRoutes.patch('/:id/activate', authMiddleware, adminMiddleware, async (c) => {
  const id = parseInt(c.req.param('id'));

  try {
    const category = await categoryRepository.findById(id);
    if (!category) {
      return c.json({ error: 'Category not found' }, 404);
    }

    const activatedCategory = await categoryRepository.activate(id);
    
    return c.json({
      data: activatedCategory,
      message: 'Category activated successfully. Note: Items and variants remain deactivated and must be activated individually.',
    });
  } catch (error) {
    console.error('Activate category error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default categoryRoutes;

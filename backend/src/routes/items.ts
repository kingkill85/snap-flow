import { Hono } from 'hono';
import { itemRepository } from '../repositories/item.ts';
import { categoryRepository } from '../repositories/category.ts';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';
import { uploadMiddleware } from '../middleware/upload.ts';
import { fileStorageService } from '../services/file-storage.ts';
import type { CreateItemDTO } from '../models/index.ts';

const itemRoutes = new Hono();

// GET /items - List all items
itemRoutes.get('/', async (c) => {
  try {
    const categoryId = c.req.query('category_id');
    const search = c.req.query('search');
    const page = parseInt(c.req.query('page') || '1', 10);
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);

    const filter: { category_id?: number; search?: string } = {};
    
    if (categoryId) {
      filter.category_id = parseInt(categoryId, 10);
    }
    
    if (search) {
      filter.search = search;
    }

    const result = await itemRepository.findAll(filter, { page, limit });

    return c.json({
      data: result.items,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        limit,
      },
    });
  } catch (error) {
    console.error('List items error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// GET /items/:id - Get single item
itemRoutes.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const item = await itemRepository.findById(id);

    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    return c.json({
      data: item,
    });
  } catch (error) {
    console.error('Get item error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /items - Create new item with optional image upload
itemRoutes.post(
  '/',
  authMiddleware,
  adminMiddleware,
  uploadMiddleware('items'),
  async (c) => {
    try {
      const uploadResult = c.get('uploadResult');
      const formData = c.get('formData');

      if (!formData) {
        return c.json({ error: 'No form data provided' }, 400);
      }

      // Parse item data from form
      const categoryIdStr = formData.get('category_id')?.toString();
      const name = formData.get('name')?.toString();
      const description = formData.get('description')?.toString();
      const modelNumber = formData.get('model_number')?.toString();
      const dimensions = formData.get('dimensions')?.toString();
      const priceStr = formData.get('price')?.toString();
      
      const categoryId = categoryIdStr ? parseInt(categoryIdStr) : NaN;
      const price = priceStr ? parseFloat(priceStr) : NaN;

      // Validate required fields
      if (!categoryIdStr || isNaN(categoryId) || !name || isNaN(price)) {
        if (uploadResult?.success && uploadResult.filePath) {
          await fileStorageService.deleteFile(uploadResult.filePath);
        }
        return c.json({ error: 'Missing required fields: category_id, name, price' }, 400);
      }

      // Validate category exists
      const category = await categoryRepository.findById(categoryId);
      if (!category) {
        if (uploadResult?.success && uploadResult.filePath) {
          await fileStorageService.deleteFile(uploadResult.filePath);
        }
        return c.json({ error: 'Category not found' }, 400);
      }

      // Build create data
      const createData: CreateItemDTO = {
        category_id: categoryId,
        name: name,
        price: price,
      };
      
      if (description) createData.description = description;
      if (modelNumber) createData.model_number = modelNumber;
      if (dimensions) createData.dimensions = dimensions;
      if (uploadResult?.success && uploadResult.filePath) {
        createData.image_path = uploadResult.filePath;
      }

      const item = await itemRepository.create(createData);

      return c.json({
        data: item,
        message: 'Item created successfully',
      }, 201);
    } catch (error) {
      console.error('Create item error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  }
);

// PUT /items/:id - Update item
itemRoutes.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  uploadMiddleware('items'),
  async (c) => {
    try {
      const id = parseInt(c.req.param('id'));
      const uploadResult = c.get('uploadResult');
      const formData = c.get('formData');

      const existingItem = await itemRepository.findById(id);
      if (!existingItem) {
        if (uploadResult?.success && uploadResult.filePath) {
          await fileStorageService.deleteFile(uploadResult.filePath);
        }
        return c.json({ error: 'Item not found' }, 404);
      }

      if (!formData) {
        return c.json({ error: 'No form data provided' }, 400);
      }

      // Parse optional fields
      const categoryIdStr = formData.get('category_id')?.toString();
      const name = formData.get('name')?.toString();
      const description = formData.get('description')?.toString();
      const modelNumber = formData.get('model_number')?.toString();
      const dimensions = formData.get('dimensions')?.toString();
      const priceStr = formData.get('price')?.toString();
      
      const categoryId = categoryIdStr ? parseInt(categoryIdStr) : undefined;
      const price = priceStr ? parseFloat(priceStr) : undefined;

      if (categoryId) {
        const category = await categoryRepository.findById(categoryId);
        if (!category) {
          if (uploadResult?.success && uploadResult.filePath) {
            await fileStorageService.deleteFile(uploadResult.filePath);
          }
          return c.json({ error: 'Category not found' }, 400);
        }
      }

      const hasFields = categoryId || name || description !== undefined || 
                        modelNumber !== undefined || dimensions !== undefined || 
                        price !== undefined;
      
      if (!hasFields && !uploadResult?.success) {
        return c.json({ error: 'No fields to update' }, 400);
      }

      if (uploadResult?.success && uploadResult.filePath && existingItem.image_path) {
        await fileStorageService.deleteFile(existingItem.image_path);
      }

      // Build update data
      const updateData: { category_id?: number; name?: string; description?: string; model_number?: string; dimensions?: string; price?: number; image_path?: string } = {};
      if (categoryId !== undefined) updateData.category_id = categoryId;
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (modelNumber !== undefined) updateData.model_number = modelNumber;
      if (dimensions !== undefined) updateData.dimensions = dimensions;
      if (price !== undefined) updateData.price = price;
      if (uploadResult?.success && uploadResult.filePath) updateData.image_path = uploadResult.filePath;

      const item = await itemRepository.update(id, updateData);

      return c.json({
        data: item,
        message: 'Item updated successfully',
      });
    } catch (error) {
      console.error('Update item error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  }
);

// DELETE /items/:id - Delete item
itemRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    const existingItem = await itemRepository.findById(id);
    if (!existingItem) {
      return c.json({ error: 'Item not found' }, 404);
    }

    if (existingItem.image_path) {
      await fileStorageService.deleteFile(existingItem.image_path);
    }

    await itemRepository.delete(id);

    return c.json({
      message: 'Item deleted successfully',
    });
  } catch (error) {
    console.error('Delete item error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default itemRoutes;

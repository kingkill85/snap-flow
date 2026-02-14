import { Hono } from 'hono';
import { itemRepository } from '../repositories/item.ts';
import { itemVariantRepository } from '../repositories/item-variant.ts';
import { itemAddonRepository } from '../repositories/item-addon.ts';
import { variantAddonRepository } from '../repositories/variant-addon.ts';
import { categoryRepository } from '../repositories/category.ts';
import { authMiddleware, adminMiddleware } from '../middleware/auth.ts';
import { uploadMiddleware } from '../middleware/upload.ts';
import { fileStorageService } from '../services/file-storage.ts';
import type { CreateItemDTO, UpdateItemDTO, CreateItemVariantDTO, CreateItemAddonDTO, CreateVariantAddonDTO } from '../models/index.ts';
import { excelImportService } from '../services/excel-import.ts';

// Extend Hono context types
declare module 'hono' {
  interface ContextVariableMap {
    uploadResult: { success: boolean; filePath?: string; error?: string; originalName?: string };
    formData: FormData;
    userId: number;
    userEmail: string;
    userRole: string;
  }
}

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

// GET /items/:id - Get single item with variants and add-ons
itemRoutes.get('/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'));
    const item = await itemRepository.findById(id, true); // Include relations

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

// POST /items - Create new base item (without variants)
itemRoutes.post(
  '/',
  authMiddleware,
  adminMiddleware,
  async (c) => {
    try {
      const body = await c.req.json();
      const { category_id, name, description, base_model_number, dimensions } = body;

      // Validate required fields
      if (!category_id || !name) {
        return c.json({ error: 'Missing required fields: category_id, name' }, 400);
      }

      const categoryIdNum = parseInt(category_id);
      if (isNaN(categoryIdNum)) {
        return c.json({ error: 'Invalid category_id' }, 400);
      }

      // Validate category exists
      const category = await categoryRepository.findById(categoryIdNum);
      if (!category) {
        return c.json({ error: 'Category not found' }, 400);
      }

      const createData: CreateItemDTO = {
        category_id: categoryIdNum,
        name,
      };
      
      if (description) createData.description = description;
      if (base_model_number) createData.base_model_number = base_model_number;
      if (dimensions) createData.dimensions = dimensions;

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

// PUT /items/:id - Update base item
itemRoutes.put(
  '/:id',
  authMiddleware,
  adminMiddleware,
  async (c) => {
    try {
      const id = parseInt(c.req.param('id'));
      const body = await c.req.json();
      const { category_id, name, description, base_model_number, dimensions } = body;

      const existingItem = await itemRepository.findById(id);
      if (!existingItem) {
        return c.json({ error: 'Item not found' }, 404);
      }

      if (category_id !== undefined) {
        const categoryIdNum = parseInt(category_id);
        if (isNaN(categoryIdNum)) {
          return c.json({ error: 'Invalid category_id' }, 400);
        }
        const category = await categoryRepository.findById(categoryIdNum);
        if (!category) {
          return c.json({ error: 'Category not found' }, 400);
        }
      }

      const updateData: UpdateItemDTO = {};
      if (category_id !== undefined) updateData.category_id = parseInt(category_id);
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (base_model_number !== undefined) updateData.base_model_number = base_model_number;
      if (dimensions !== undefined) updateData.dimensions = dimensions;

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

// DELETE /items/:id - Delete item and all its variants
itemRoutes.delete('/:id', authMiddleware, adminMiddleware, async (c) => {
  try {
    const id = parseInt(c.req.param('id'));

    const existingItem = await itemRepository.findById(id, true);
    if (!existingItem) {
      return c.json({ error: 'Item not found' }, 404);
    }

    // Delete variant images first
    if (existingItem.variants) {
      for (const variant of existingItem.variants) {
        if (variant.image_path) {
          await fileStorageService.deleteFile(variant.image_path);
        }
      }
    }

    await itemRepository.delete(id);

    return c.json({
      message: 'Item and all variants deleted successfully',
    });
  } catch (error) {
    console.error('Delete item error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ==========================================
// VARIANT ROUTES
// ==========================================

// GET /items/:id/variants - Get all variants for an item
itemRoutes.get('/:id/variants', async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    
    const item = await itemRepository.findById(itemId);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const variants = await itemVariantRepository.findByItemId(itemId);

    return c.json({
      data: variants,
    });
  } catch (error) {
    console.error('Get variants error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /items/:id/variants - Create new variant with image
itemRoutes.post(
  '/:id/variants',
  authMiddleware,
  adminMiddleware,
  uploadMiddleware('items'),
  async (c) => {
    try {
      const itemId = parseInt(c.req.param('id'));
      const uploadResult = c.get('uploadResult');
      const formData = c.get('formData');

      const item = await itemRepository.findById(itemId);
      if (!item) {
        if (uploadResult?.success && uploadResult.filePath) {
          await fileStorageService.deleteFile(uploadResult.filePath);
        }
        return c.json({ error: 'Item not found' }, 404);
      }

      if (!formData) {
        return c.json({ error: 'No form data provided' }, 400);
      }

      const styleName = formData.get('style_name')?.toString();
      const priceStr = formData.get('price')?.toString();
      const price = priceStr ? parseFloat(priceStr) : NaN;

      if (!styleName || isNaN(price)) {
        if (uploadResult?.success && uploadResult.filePath) {
          await fileStorageService.deleteFile(uploadResult.filePath);
        }
        return c.json({ error: 'Missing required fields: style_name, price' }, 400);
      }

      const createData: CreateItemVariantDTO = {
        item_id: itemId,
        style_name: styleName,
        price,
      };

      if (uploadResult?.success && uploadResult.filePath) {
        createData.image_path = uploadResult.filePath;
      }

      const variant = await itemVariantRepository.create(createData);

      return c.json({
        data: variant,
        message: 'Variant created successfully',
      }, 201);
    } catch (error) {
      console.error('Create variant error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  }
);

// PUT /items/:id/variants/:variantId - Update variant
itemRoutes.put(
  '/:id/variants/:variantId',
  authMiddleware,
  adminMiddleware,
  uploadMiddleware('items'),
  async (c) => {
    try {
      const itemId = parseInt(c.req.param('id'));
      const variantId = parseInt(c.req.param('variantId'));
      const uploadResult = c.get('uploadResult');
      const formData = c.get('formData');

      const item = await itemRepository.findById(itemId);
      if (!item) {
        if (uploadResult?.success && uploadResult.filePath) {
          await fileStorageService.deleteFile(uploadResult.filePath);
        }
        return c.json({ error: 'Item not found' }, 404);
      }

      const existingVariant = await itemVariantRepository.findById(variantId);
      if (!existingVariant || existingVariant.item_id !== itemId) {
        if (uploadResult?.success && uploadResult.filePath) {
          await fileStorageService.deleteFile(uploadResult.filePath);
        }
        return c.json({ error: 'Variant not found' }, 404);
      }

      if (!formData) {
        return c.json({ error: 'No form data provided' }, 400);
      }

      const styleName = formData.get('style_name')?.toString();
      const priceStr = formData.get('price')?.toString();
      const price = priceStr ? parseFloat(priceStr) : undefined;
      const removeImage = formData.get('remove_image')?.toString() === 'true';

      const updateData: { style_name?: string; price?: number; image_path?: string | null } = {};
      if (styleName !== undefined) updateData.style_name = styleName;
      if (price !== undefined) updateData.price = price;
      if (uploadResult?.success && uploadResult.filePath) {
        // New image uploaded - delete old one if exists
        if (existingVariant.image_path) {
          await fileStorageService.deleteFile(existingVariant.image_path);
        }
        updateData.image_path = uploadResult.filePath;
      } else if (removeImage) {
        // Remove image flag set - delete file and set to null
        if (existingVariant.image_path) {
          await fileStorageService.deleteFile(existingVariant.image_path);
        }
        updateData.image_path = null;
      }

      const variant = await itemVariantRepository.update(variantId, updateData);

      return c.json({
        data: variant,
        message: 'Variant updated successfully',
      });
    } catch (error) {
      console.error('Update variant error:', error);
      return c.json({ error: 'Internal server error' }, 500);
    }
  }
);

// DELETE /items/:id/variants/:variantId - Delete variant
itemRoutes.delete('/:id/variants/:variantId', authMiddleware, adminMiddleware, async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    const variantId = parseInt(c.req.param('variantId'));

    const item = await itemRepository.findById(itemId);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const existingVariant = await itemVariantRepository.findById(variantId);
    if (!existingVariant || existingVariant.item_id !== itemId) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    if (existingVariant.image_path) {
      await fileStorageService.deleteFile(existingVariant.image_path);
    }

    await itemVariantRepository.delete(variantId);

    return c.json({
      message: 'Variant deleted successfully',
    });
  } catch (error) {
    console.error('Delete variant error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// PATCH /items/:id/variants/reorder - Reorder variants
itemRoutes.patch('/:id/variants/reorder', authMiddleware, adminMiddleware, async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    const { variant_ids } = await c.req.json();

    if (!Array.isArray(variant_ids)) {
      return c.json({ error: 'variant_ids must be an array' }, 400);
    }

    const item = await itemRepository.findById(itemId);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    await itemVariantRepository.reorder(itemId, variant_ids);

    return c.json({
      message: 'Variants reordered successfully',
    });
  } catch (error) {
    console.error('Reorder variants error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ==========================================
// ADD-ON ROUTES
// ==========================================

// GET /items/:id/addons - Get all add-ons for an item
itemRoutes.get('/:id/addons', async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    
    const item = await itemRepository.findById(itemId);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const addons = await itemAddonRepository.findByParentItemId(itemId);

    return c.json({
      data: addons,
    });
  } catch (error) {
    console.error('Get addons error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /items/:id/addons - Add add-on relationship
itemRoutes.post('/:id/addons', authMiddleware, adminMiddleware, async (c) => {
  try {
    const parentItemId = parseInt(c.req.param('id'));
    const { addon_item_id, slot_number, is_required } = await c.req.json();

    if (!addon_item_id || !slot_number) {
      return c.json({ error: 'Missing required fields: addon_item_id, slot_number' }, 400);
    }

    const parentItem = await itemRepository.findById(parentItemId);
    if (!parentItem) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const addonItem = await itemRepository.findById(parseInt(addon_item_id));
    if (!addonItem) {
      return c.json({ error: 'Add-on item not found' }, 404);
    }

    // Prevent circular reference
    if (parentItemId === parseInt(addon_item_id)) {
      return c.json({ error: 'Item cannot be an add-on of itself' }, 400);
    }

    const slotNum = parseInt(slot_number);
    if (slotNum < 1 || slotNum > 4) {
      return c.json({ error: 'slot_number must be between 1 and 4' }, 400);
    }

    const createData: CreateItemAddonDTO = {
      parent_item_id: parentItemId,
      addon_item_id: parseInt(addon_item_id),
      slot_number: slotNum,
      is_required: is_required ?? (slotNum <= 2), // Auto-set required for slots 1-2
    };

    const addon = await itemAddonRepository.create(createData);

    return c.json({
      data: addon,
      message: 'Add-on added successfully',
    }, 201);
  } catch (error) {
    console.error('Create addon error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /items/:id/addons/:addonId - Remove add-on relationship
itemRoutes.delete('/:id/addons/:addonId', authMiddleware, adminMiddleware, async (c) => {
  try {
    const parentItemId = parseInt(c.req.param('id'));
    const addonId = parseInt(c.req.param('addonId'));

    const parentItem = await itemRepository.findById(parentItemId);
    if (!parentItem) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const addon = await itemAddonRepository.findById(addonId);
    if (!addon || addon.parent_item_id !== parentItemId) {
      return c.json({ error: 'Add-on not found' }, 404);
    }

    await itemAddonRepository.delete(addonId);

    return c.json({
      message: 'Add-on removed successfully',
    });
  } catch (error) {
    console.error('Delete addon error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// ==========================================
// IMPORT ROUTES
// ==========================================

// POST /items/import-preview - Preview Excel import
itemRoutes.post('/import-preview', authMiddleware, adminMiddleware, uploadMiddleware('imports'), async (c) => {
  try {
    const uploadResult = c.get('uploadResult');

    if (!uploadResult?.success || !uploadResult.filePath) {
      return c.json({ error: 'No file uploaded' }, 400);
    }

    const preview = await excelImportService.parseExcel(uploadResult.filePath);

    // Clean up uploaded file
    await fileStorageService.deleteFile(uploadResult.filePath);

    return c.json({
      data: preview,
    });
  } catch (error) {
    console.error('Import preview error:', error);
    return c.json({ error: 'Failed to parse Excel file' }, 500);
  }
});

// POST /items/import - Execute Excel import
itemRoutes.post('/import', authMiddleware, adminMiddleware, async (c) => {
  try {
    const { preview } = await c.req.json();

    if (!preview) {
      return c.json({ error: 'No preview data provided' }, 400);
    }

    const result = await excelImportService.executeImport(preview);

    return c.json({
      data: result,
    });
  } catch (error) {
    console.error('Import execution error:', error);
    return c.json({ error: 'Failed to execute import' }, 500);
  }
});

// ==========================================
// VARIANT ADD-ON ROUTES (Add-ons per variant)
// ==========================================

// GET /items/:id/variants/:variantId/addons - Get all add-ons for a variant
itemRoutes.get('/:id/variants/:variantId/addons', async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    const variantId = parseInt(c.req.param('variantId'));
    
    const item = await itemRepository.findById(itemId);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const variant = await itemVariantRepository.findById(variantId);
    if (!variant || variant.item_id !== itemId) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    const addons = await variantAddonRepository.findByVariantId(variantId);

    return c.json({
      data: addons,
    });
  } catch (error) {
    console.error('Get variant addons error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// POST /items/:id/variants/:variantId/addons - Add add-on to variant
itemRoutes.post('/:id/variants/:variantId/addons', authMiddleware, adminMiddleware, async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    const variantId = parseInt(c.req.param('variantId'));
    const { addon_variant_id, is_optional } = await c.req.json();

    if (!addon_variant_id) {
      return c.json({ error: 'addon_variant_id is required' }, 400);
    }

    const item = await itemRepository.findById(itemId);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const variant = await itemVariantRepository.findById(variantId);
    if (!variant || variant.item_id !== itemId) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    // Prevent self-reference
    if (variantId === parseInt(addon_variant_id)) {
      return c.json({ error: 'Variant cannot be an add-on of itself' }, 400);
    }

    const createData: CreateVariantAddonDTO = {
      variant_id: variantId,
      addon_variant_id: parseInt(addon_variant_id),
      is_optional: is_optional ?? true,
    };

    const addon = await variantAddonRepository.create(createData);

    return c.json({
      data: addon,
      message: 'Add-on added successfully',
    }, 201);
  } catch (error) {
    console.error('Create variant addon error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

// DELETE /items/:id/variants/:variantId/addons/:addonId - Remove add-on from variant
itemRoutes.delete('/:id/variants/:variantId/addons/:addonId', authMiddleware, adminMiddleware, async (c) => {
  try {
    const itemId = parseInt(c.req.param('id'));
    const variantId = parseInt(c.req.param('variantId'));
    const addonId = parseInt(c.req.param('addonId'));

    const item = await itemRepository.findById(itemId);
    if (!item) {
      return c.json({ error: 'Item not found' }, 404);
    }

    const variant = await itemVariantRepository.findById(variantId);
    if (!variant || variant.item_id !== itemId) {
      return c.json({ error: 'Variant not found' }, 404);
    }

    const addon = await variantAddonRepository.findById(addonId);
    if (!addon || addon.variant_id !== variantId) {
      return c.json({ error: 'Add-on not found' }, 404);
    }

    await variantAddonRepository.delete(addonId);

    return c.json({
      message: 'Add-on removed successfully',
    });
  } catch (error) {
    console.error('Delete variant addon error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default itemRoutes;

import { getDb } from '../config/database.ts';
import type { Item, CreateItemDTO, UpdateItemDTO } from '../models/index.ts';
import { itemVariantRepository } from './item-variant.ts';
import { itemAddonRepository } from './item-addon.ts';

export interface ItemFilter {
  category_id?: number;
  search?: string;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface PaginatedItemsResult {
  items: Item[];
  total: number;
  page: number;
  totalPages: number;
}

/**
 * Item Repository
 * Handles all database operations for items (base products)
 */
export class ItemRepository {
  async findAll(
    filter?: ItemFilter & { include_inactive?: boolean },
    pagination?: PaginationOptions
  ): Promise<PaginatedItemsResult> {
    let whereClause = '';
    const whereConditions: string[] = [];
    const values: (string | number | boolean)[] = [];

    // Filter by active status unless include_inactive is true
    if (!filter?.include_inactive) {
      whereConditions.push('i.is_active = true');
    }

    if (filter?.category_id) {
      whereConditions.push('i.category_id = ?');
      values.push(filter.category_id);
    }

    if (filter?.search) {
      whereConditions.push('(i.name LIKE ? OR i.description LIKE ? OR i.base_model_number LIKE ?)');
      const searchPattern = `%${filter.search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    if (whereConditions.length > 0) {
      whereClause = 'WHERE ' + whereConditions.join(' AND ');
    }

    // Get total count
    const countResult = getDb().query(`SELECT COUNT(*) as total FROM items i ${whereClause}`, values);
    const total = countResult[0][0] as number;

    // Build query with first variant image
    let query = `
      SELECT 
        i.id, 
        i.category_id, 
        i.name, 
        i.description, 
        i.base_model_number, 
        i.dimensions, 
        i.created_at, 
        i.is_active,
        (SELECT iv.image_path FROM item_variants iv 
         WHERE iv.item_id = i.id
         ORDER BY iv.sort_order ASC, iv.id ASC 
         LIMIT 1) as preview_image
      FROM items i
      ${whereClause}
      ORDER BY i.name ASC
    `;

    // Add pagination
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const offset = (page - 1) * limit;

    query += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    const result = getDb().queryEntries(query, values);

    return {
      items: result as unknown as Item[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number, includeRelations: boolean = false): Promise<Item | null> {
    const result = getDb().queryEntries(`
      SELECT id, category_id, name, description, base_model_number, dimensions, created_at, is_active
      FROM items
      WHERE id = ?
    `, [id]);

    if (result.length === 0) {
      return null;
    }

    const item = result[0] as unknown as Item;

    if (includeRelations) {
      item.variants = await itemVariantRepository.findByItemId(id);
      item.addons = await itemAddonRepository.findByParentItemId(id);
    }

    return item;
  }

  async findByBaseModelNumber(baseModelNumber: string): Promise<Item | null> {
    const result = getDb().queryEntries(`
      SELECT id, category_id, name, description, base_model_number, dimensions, created_at, is_active
      FROM items
      WHERE base_model_number = ?
    `, [baseModelNumber]);
    return result.length > 0 ? (result[0] as unknown as Item) : null;
  }

  async findByName(name: string): Promise<Item | null> {
    const result = getDb().queryEntries(`
      SELECT id, category_id, name, description, base_model_number, dimensions, created_at, is_active
      FROM items
      WHERE name = ?
    `, [name]);
    return result.length > 0 ? (result[0] as unknown as Item) : null;
  }

  async findByCategory(categoryId: number, includeInactive = false): Promise<Item[]> {
    const query = includeInactive
      ? `
        SELECT id, category_id, name, description, base_model_number, dimensions, created_at, is_active
        FROM items
        WHERE category_id = ?
        ORDER BY name ASC
      `
      : `
        SELECT id, category_id, name, description, base_model_number, dimensions, created_at, is_active
        FROM items
        WHERE category_id = ? AND is_active = true
        ORDER BY name ASC
      `;
    const result = getDb().queryEntries(query, [categoryId]);
    return result as unknown as Item[];
  }

  async create(data: CreateItemDTO): Promise<Item> {
    const isActive = data.is_active ?? true;
    const result = getDb().queryEntries(`
      INSERT INTO items (category_id, name, description, base_model_number, dimensions, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, category_id, name, description, base_model_number, dimensions, created_at, is_active
    `, [
      data.category_id,
      data.name,
      data.description || null,
      data.base_model_number || null,
      data.dimensions || null,
      isActive,
    ]);

    return result[0] as unknown as Item;
  }

  async update(id: number, data: UpdateItemDTO): Promise<Item | null> {
    const sets: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (data.category_id !== undefined) {
      sets.push('category_id = ?');
      values.push(data.category_id);
    }
    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.description !== undefined) {
      sets.push('description = ?');
      values.push(data.description);
    }
    if (data.base_model_number !== undefined) {
      sets.push('base_model_number = ?');
      values.push(data.base_model_number);
    }
    if (data.dimensions !== undefined) {
      sets.push('dimensions = ?');
      values.push(data.dimensions);
    }
    if (data.is_active !== undefined) {
      sets.push('is_active = ?');
      values.push(data.is_active);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE items
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, category_id, name, description, base_model_number, dimensions, created_at, is_active
    `, values);

    return result.length > 0 ? (result[0] as unknown as Item) : null;
  }

  async deactivate(id: number): Promise<Item | null> {
    // Deactivate the item
    const result = getDb().queryEntries(`
      UPDATE items
      SET is_active = false
      WHERE id = ?
      RETURNING id, category_id, name, description, base_model_number, dimensions, created_at, is_active
    `, [id]);

    if (result.length === 0) {
      return null;
    }

    // Cascade: Deactivate all variants of this item
    getDb().query(`
      UPDATE item_variants
      SET is_active = false
      WHERE item_id = ?
    `, [id]);

    return result[0] as unknown as Item;
  }

  async activate(id: number): Promise<Item | null> {
    const result = getDb().queryEntries(`
      UPDATE items
      SET is_active = true
      WHERE id = ?
      RETURNING id, category_id, name, description, base_model_number, dimensions, created_at, is_active
    `, [id]);

    return result.length > 0 ? (result[0] as unknown as Item) : null;
  }

  async delete(id: number): Promise<void> {
    // Delete related variants and addons first (cascade should handle this, but be explicit)
    await itemVariantRepository.deleteByItemId(id);
    await itemAddonRepository.deleteByParentItemId(id);
    
    getDb().query(`DELETE FROM items WHERE id = ?`, [id]);
  }

  async findOrCreateByBaseModelNumber(
    categoryId: number,
    name: string,
    baseModelNumber: string,
    description?: string,
    dimensions?: string
  ): Promise<Item> {
    const existing = await this.findByBaseModelNumber(baseModelNumber);
    if (existing) {
      return existing;
    }

    const createData: CreateItemDTO = {
      category_id: categoryId,
      name,
      base_model_number: baseModelNumber,
    };
    if (description) {
      createData.description = description;
    }
    if (dimensions) {
      createData.dimensions = dimensions;
    }
    return this.create(createData);
  }

  async updateByBaseModelNumber(
    baseModelNumber: string,
    data: UpdateItemDTO
  ): Promise<Item | null> {
    const item = await this.findByBaseModelNumber(baseModelNumber);
    if (!item) {
      return null;
    }

    return this.update(item.id, data);
  }
}

export const itemRepository = new ItemRepository();

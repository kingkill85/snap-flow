import { getDb, withTransactionAsync } from '../config/database.ts';
import type { Item, CreateItemDTO, UpdateItemDTO } from '../models/index.ts';
import { itemVariantRepository } from './item-variant.ts';
import { bomEntryRepository } from './bom-entry.ts';

export interface ItemFilter {
  category_id?: number | null;
  type_id?: number;
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

    if (filter?.category_id !== undefined) {
      if (filter.category_id === null) {
        whereConditions.push('i.category_id IS NULL');
      } else {
        whereConditions.push('i.category_id = ?');
        values.push(filter.category_id);
      }
    }

    if (filter?.type_id !== undefined) {
      whereConditions.push('i.type_id = ?');
      values.push(filter.type_id);
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
    const countResult = getDb().query(`SELECT COUNT(*) as total FROM items i LEFT JOIN item_types it ON i.type_id = it.id ${whereClause}`, values);
    const total = countResult[0][0] as number;

    // Active-only catalog requests must not expose inactive variant images.
    // Admin inactive-inclusive requests may use an inactive variant as preview.
    const previewVariantFilter = filter?.include_inactive ? '' : 'AND iv.is_active = true';

    // Build query with first variant image
    let query = `
      SELECT
        i.id,
        i.category_id,
        i.type_id,
        i.name,
        i.description,
        i.base_model_number,
        i.dimensions,
        i.created_at,
        i.is_active,
        it.name as type_name,
        it.abbreviation as type_abbreviation,
        it.color as type_color,
        (SELECT iv.image_path FROM item_variants iv
         WHERE iv.item_id = i.id ${previewVariantFilter}
         ORDER BY iv.sort_order ASC, iv.id ASC
         LIMIT 1) as preview_image
      FROM items i
      LEFT JOIN item_types it ON i.type_id = it.id
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
    
    // Load variants for each item
    const itemsWithVariants = await Promise.all(
      (result as unknown as Item[]).map(async (item) => {
        item.variants = await itemVariantRepository.findByItemId(item.id);
        return item;
      })
    );

    return {
      items: itemsWithVariants,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number, includeRelations: boolean = false): Promise<Item | null> {
    const result = getDb().queryEntries(`
      SELECT i.id, i.category_id, i.type_id, i.name, i.description, i.base_model_number, i.dimensions, i.created_at, i.is_active,
        it.name as type_name, it.abbreviation as type_abbreviation, it.color as type_color
      FROM items i
      LEFT JOIN item_types it ON i.type_id = it.id
      WHERE i.id = ?
    `, [id]);

    if (result.length === 0) {
      return null;
    }

    const item = result[0] as unknown as Item & Record<string, unknown>;

    // Convert is_active to boolean (SQLite stores as 0/1)
    if (item && item.is_active !== undefined) {
      item.is_active = Boolean(item.is_active);
    }

    if (includeRelations) {
      item.variants = await itemVariantRepository.findByItemId(id);
    }

    return item as unknown as Item;
  }

  findByBaseModelNumber(baseModelNumber: string): Promise<Item | null> {
    const result = getDb().queryEntries(`
      SELECT i.id, i.category_id, i.type_id, i.name, i.description, i.base_model_number, i.dimensions, i.created_at, i.is_active,
        it.name as type_name, it.abbreviation as type_abbreviation, it.color as type_color
      FROM items i
      LEFT JOIN item_types it ON i.type_id = it.id
      WHERE i.base_model_number = ?
    `, [baseModelNumber]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Item) : null);
  }

  findByName(name: string): Promise<Item | null> {
    const result = getDb().queryEntries(`
      SELECT i.id, i.category_id, i.type_id, i.name, i.description, i.base_model_number, i.dimensions, i.created_at, i.is_active,
        it.name as type_name, it.abbreviation as type_abbreviation, it.color as type_color
      FROM items i
      LEFT JOIN item_types it ON i.type_id = it.id
      WHERE i.name = ?
    `, [name]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Item) : null);
  }

  findByCategory(categoryId: number, includeInactive = false): Promise<Item[]> {
    const query = includeInactive
      ? `
        SELECT i.id, i.category_id, i.type_id, i.name, i.description, i.base_model_number, i.dimensions, i.created_at, i.is_active,
          it.name as type_name, it.abbreviation as type_abbreviation, it.color as type_color
        FROM items i
        LEFT JOIN item_types it ON i.type_id = it.id
        WHERE i.category_id = ?
        ORDER BY i.name ASC
      `
      : `
        SELECT i.id, i.category_id, i.type_id, i.name, i.description, i.base_model_number, i.dimensions, i.created_at, i.is_active,
          it.name as type_name, it.abbreviation as type_abbreviation, it.color as type_color
        FROM items i
        LEFT JOIN item_types it ON i.type_id = it.id
        WHERE i.category_id = ? AND i.is_active = true
        ORDER BY i.name ASC
      `;
    const result = getDb().queryEntries(query, [categoryId]);
    return Promise.resolve(result as unknown as Item[]);
  }

  create(data: CreateItemDTO): Promise<Item> {
    const isActive = data.is_active ?? true;
    const result = getDb().queryEntries(`
      INSERT INTO items (category_id, type_id, name, description, base_model_number, dimensions, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, category_id, type_id, name, description, base_model_number, dimensions, created_at, is_active
    `, [
      data.category_id,
      data.type_id,
      data.name,
      data.description || null,
      data.base_model_number || null,
      data.dimensions || null,
      isActive,
    ]);

    return Promise.resolve(result[0] as unknown as Item);
  }

  update(id: number, data: UpdateItemDTO): Promise<Item | null> {
    const sets: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    if (data.category_id !== undefined) {
      sets.push('category_id = ?');
      values.push(data.category_id);
    }
    if (data.type_id !== undefined) {
      sets.push('type_id = ?');
      values.push(data.type_id);
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
      RETURNING id, category_id, type_id, name, description, base_model_number, dimensions, created_at, is_active
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Item) : null);
  }

  deactivate(id: number): Promise<Item | null> {
    // Deactivate the item
    const result = getDb().queryEntries(`
      UPDATE items
      SET is_active = false
      WHERE id = ?
      RETURNING id, category_id, type_id, name, description, base_model_number, dimensions, created_at, is_active
    `, [id]);

    if (result.length === 0) {
      return Promise.resolve(null);
    }

    // Cascade: Deactivate all variants of this item
    getDb().query(`
      UPDATE item_variants
      SET is_active = false
      WHERE item_id = ?
    `, [id]);

    return Promise.resolve(result[0] as unknown as Item);
  }

  deactivateMissingForType(typeId: number, importedBaseModelNumbers: string[]): Promise<Item[]> {
    const values: (number | string)[] = [typeId];
    let importedPredicate = '';

    if (importedBaseModelNumbers.length > 0) {
      importedPredicate = `AND base_model_number NOT IN (${importedBaseModelNumbers.map(() => '?').join(', ')})`;
      values.push(...importedBaseModelNumbers);
    }

    const deactivated = getDb().queryEntries(`
      UPDATE items
      SET is_active = false
      WHERE type_id = ?
        AND is_active = true
        ${importedPredicate}
      RETURNING id, category_id, type_id, name, description, base_model_number, dimensions, created_at, is_active
    `, values) as unknown as Item[];

    if (deactivated.length > 0) {
      const placeholders = deactivated.map(() => '?').join(', ');
      getDb().query(`
        UPDATE item_variants
        SET is_active = false
        WHERE item_id IN (${placeholders})
      `, deactivated.map((item) => item.id));
    }

    return Promise.resolve(deactivated);
  }

  activate(id: number): Promise<Item | null> {
    const result = getDb().queryEntries(`
      UPDATE items
      SET is_active = true
      WHERE id = ?
      RETURNING id, category_id, type_id, name, description, base_model_number, dimensions, created_at, is_active
    `, [id]);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Item) : null);
  }

  async delete(id: number): Promise<void> {
    await withTransactionAsync(async () => {
      // Clear item_id in project_bom to preserve BOM history
      await bomEntryRepository.clearItemId(id);

      // Delete related variants (use Internal to avoid nested transaction)
      await itemVariantRepository.deleteByItemIdInternal(id);

      getDb().query(`DELETE FROM items WHERE id = ?`, [id]);
    });
  }

  async findOrCreateByBaseModelNumber(
    categoryId: number,
    name: string,
    baseModelNumber: string,
    description?: string,
    dimensions?: string,
    typeId?: number
  ): Promise<Item> {
    const existing = await this.findByBaseModelNumber(baseModelNumber);
    if (existing) {
      return existing;
    }

    const createData: CreateItemDTO = {
      category_id: categoryId,
      type_id: typeId ?? 0,
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

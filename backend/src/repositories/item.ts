import { db } from '../config/database.ts';
import type { Item, CreateItemDTO, UpdateItemDTO } from '../models/index.ts';

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
 * Handles all database operations for items
 */
export class ItemRepository {
  async findAll(filter?: ItemFilter, pagination?: PaginationOptions): Promise<PaginatedItemsResult> {
    let whereClause = '';
    const whereConditions: string[] = [];
    const values: (string | number)[] = [];

    if (filter?.category_id) {
      whereConditions.push('category_id = ?');
      values.push(filter.category_id);
    }

    if (filter?.search) {
      whereConditions.push('(name LIKE ? OR description LIKE ? OR model_number LIKE ?)');
      const searchPattern = `%${filter.search}%`;
      values.push(searchPattern, searchPattern, searchPattern);
    }

    if (whereConditions.length > 0) {
      whereClause = 'WHERE ' + whereConditions.join(' AND ');
    }

    // Get total count
    const countResult = db.query(`SELECT COUNT(*) as total FROM items ${whereClause}`, values);
    const total = countResult[0][0] as number;

    // Build query
    let query = `
      SELECT id, category_id, name, description, model_number, dimensions, price, image_path, created_at
      FROM items
      ${whereClause}
      ORDER BY name ASC
    `;

    // Add pagination
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 20;
    const offset = (page - 1) * limit;

    query += ` LIMIT ? OFFSET ?`;
    values.push(limit, offset);

    const result = db.queryEntries(query, values);

    return {
      items: result as unknown as Item[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Item | null> {
    const result = db.queryEntries(`
      SELECT id, category_id, name, description, model_number, dimensions, price, image_path, created_at
      FROM items
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as Item) : null;
  }

  async findByModelNumber(modelNumber: string): Promise<Item | null> {
    const result = db.queryEntries(`
      SELECT id, category_id, name, description, model_number, dimensions, price, image_path, created_at
      FROM items
      WHERE model_number = ?
    `, [modelNumber]);
    return result.length > 0 ? (result[0] as unknown as Item) : null;
  }

  async findByCategory(categoryId: number): Promise<Item[]> {
    const result = db.queryEntries(`
      SELECT id, category_id, name, description, model_number, dimensions, price, image_path, created_at
      FROM items
      WHERE category_id = ?
      ORDER BY name ASC
    `, [categoryId]);
    return result as unknown as Item[];
  }

  async create(data: CreateItemDTO): Promise<Item> {
    const result = db.queryEntries(`
      INSERT INTO items (category_id, name, description, model_number, dimensions, price, image_path)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      RETURNING id, category_id, name, description, model_number, dimensions, price, image_path, created_at
    `, [
      data.category_id,
      data.name,
      data.description || null,
      data.model_number || null,
      data.dimensions || null,
      data.price,
      data.image_path || null,
    ]);

    return result[0] as unknown as Item;
  }

  async update(id: number, data: UpdateItemDTO): Promise<Item | null> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

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
    if (data.model_number !== undefined) {
      sets.push('model_number = ?');
      values.push(data.model_number);
    }
    if (data.dimensions !== undefined) {
      sets.push('dimensions = ?');
      values.push(data.dimensions);
    }
    if (data.price !== undefined) {
      sets.push('price = ?');
      values.push(data.price);
    }
    if (data.image_path !== undefined) {
      sets.push('image_path = ?');
      values.push(data.image_path);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = db.queryEntries(`
      UPDATE items
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, category_id, name, description, model_number, dimensions, price, image_path, created_at
    `, values);

    return result.length > 0 ? (result[0] as unknown as Item) : null;
  }

  async delete(id: number): Promise<void> {
    db.query(`DELETE FROM items WHERE id = ?`, [id]);
  }

  async bulkCreate(items: CreateItemDTO[]): Promise<Item[]> {
    const createdItems: Item[] = [];

    for (const item of items) {
      const created = await this.create(item);
      createdItems.push(created);
    }

    return createdItems;
  }
}

export const itemRepository = new ItemRepository();

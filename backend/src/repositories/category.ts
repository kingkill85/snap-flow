import { db } from '../config/database.ts';
import type { Category, CreateCategoryDTO, UpdateCategoryDTO } from '../models/index.ts';

/**
 * Category Repository
 * Handles all database operations for categories
 */
export class CategoryRepository {
  async findAll(): Promise<Category[]> {
    const result = db.queryEntries(`
      SELECT id, name, sort_order 
      FROM categories 
      ORDER BY sort_order ASC, name ASC
    `);
    return result as unknown as Category[];
  }

  async findById(id: number): Promise<Category | null> {
    const result = db.queryEntries(`
      SELECT id, name, sort_order 
      FROM categories 
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as Category) : null;
  }

  async findByName(name: string): Promise<Category | null> {
    const result = db.queryEntries(`
      SELECT id, name, sort_order 
      FROM categories 
      WHERE name = ?
    `, [name]);
    return result.length > 0 ? (result[0] as unknown as Category) : null;
  }

  async getNextSortOrder(): Promise<number> {
    const result = db.query(`SELECT MAX(sort_order) as max_order FROM categories`);
    return ((result[0][0] as number) || 0) + 1;
  }

  async create(data: CreateCategoryDTO): Promise<Category> {
    const sortOrder = data.sort_order ?? await this.getNextSortOrder();
    
    const result = db.queryEntries(`
      INSERT INTO categories (name, sort_order) 
      VALUES (?, ?)
      RETURNING id, name, sort_order
    `, [data.name, sortOrder]);
    
    return result[0] as unknown as Category;
  }

  async update(id: number, data: UpdateCategoryDTO): Promise<Category | null> {
    const sets: string[] = [];
    const values: (string | number | undefined)[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.sort_order !== undefined) {
      sets.push('sort_order = ?');
      values.push(data.sort_order);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = db.queryEntries(`
      UPDATE categories 
      SET ${sets.join(', ')} 
      WHERE id = ?
      RETURNING id, name, sort_order
    `, values);

    return result.length > 0 ? (result[0] as unknown as Category) : null;
  }

  async delete(id: number): Promise<void> {
    db.query(`DELETE FROM categories WHERE id = ?`, [id]);
  }

  async reorder(categoryIds: number[]): Promise<void> {
    for (let i = 0; i < categoryIds.length; i++) {
      db.query(`
        UPDATE categories 
        SET sort_order = ? 
        WHERE id = ?
      `, [i + 1, categoryIds[i]]);
    }
  }
}

export const categoryRepository = new CategoryRepository();

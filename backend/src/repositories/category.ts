import { getDb } from '../config/database.ts';
import type { Category, CreateCategoryDTO, UpdateCategoryDTO } from '../models/index.ts';

/**
 * Category Repository
 * Handles all database operations for categories
 */
export class CategoryRepository {
  findAll(includeInactive = false): Promise<Category[]> {
    const query = includeInactive
      ? `
        SELECT id, name, sort_order, is_active 
        FROM categories 
        ORDER BY sort_order ASC, name ASC
      `
      : `
        SELECT id, name, sort_order, is_active 
        FROM categories 
        WHERE is_active = true
        ORDER BY sort_order ASC, name ASC
      `;
    const result = getDb().queryEntries(query);
    return Promise.resolve(result as unknown as Category[]);
  }

  findById(id: number): Promise<Category | null> {
    const result = getDb().queryEntries(`
      SELECT id, name, sort_order, is_active 
      FROM categories 
      WHERE id = ?
    `, [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Category) : null);
  }

  findByName(name: string): Promise<Category | null> {
    const result = getDb().queryEntries(`
      SELECT id, name, sort_order, is_active 
      FROM categories 
      WHERE name = ?
    `, [name]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Category) : null);
  }

  deactivate(id: number): Promise<Category | null> {
    // Deactivate the category
    const result = getDb().queryEntries(`
      UPDATE categories 
      SET is_active = false 
      WHERE id = ?
      RETURNING id, name, sort_order, is_active
    `, [id]);
    
    if (result.length === 0) {
      return Promise.resolve(null);
    }

    // Cascade: Deactivate all items in this category
    getDb().query(`
      UPDATE items 
      SET is_active = false 
      WHERE category_id = ?
    `, [id]);

    // Cascade: Deactivate all variants of items in this category
    getDb().query(`
      UPDATE item_variants 
      SET is_active = false 
      WHERE item_id IN (SELECT id FROM items WHERE category_id = ?)
    `, [id]);

    return Promise.resolve(result[0] as unknown as Category);
  }

  activate(id: number): Promise<Category | null> {
    const result = getDb().queryEntries(`
      UPDATE categories 
      SET is_active = true 
      WHERE id = ?
      RETURNING id, name, sort_order, is_active
    `, [id]);
    
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Category) : null);
  }

  getNextSortOrder(): Promise<number> {
    const result = getDb().query(`SELECT MAX(sort_order) as max_order FROM categories`);
    return Promise.resolve(((result[0][0] as number) || 0) + 1);
  }

  async create(data: CreateCategoryDTO): Promise<Category> {
    const sortOrder = data.sort_order ?? await this.getNextSortOrder();
    const isActive = data.is_active ?? true;
    
    const result = getDb().queryEntries(`
      INSERT INTO categories (name, sort_order, is_active) 
      VALUES (?, ?, ?)
      RETURNING id, name, sort_order, is_active
    `, [data.name, sortOrder, isActive]);
    
    return result[0] as unknown as Category;
  }

  update(id: number, data: UpdateCategoryDTO): Promise<Category | null> {
    const sets: string[] = [];
    const values: (string | number | boolean | undefined)[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.sort_order !== undefined) {
      sets.push('sort_order = ?');
      values.push(data.sort_order);
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
      UPDATE categories 
      SET ${sets.join(', ')} 
      WHERE id = ?
      RETURNING id, name, sort_order, is_active
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Category) : null);
  }

  delete(id: number): Promise<void> {
    // Set category_id to NULL for all items in this category (preserve items)
    getDb().query(`UPDATE items SET category_id = NULL WHERE category_id = ?`, [id]);
    
    // Now delete the category
    getDb().query(`DELETE FROM categories WHERE id = ?`, [id]);
    return Promise.resolve();
  }

  reorder(categoryIds: number[]): Promise<void> {
    for (let i = 0; i < categoryIds.length; i++) {
      getDb().query(`
        UPDATE categories 
        SET sort_order = ? 
        WHERE id = ?
      `, [i + 1, categoryIds[i]]);
    }
    return Promise.resolve();
  }
}

export const categoryRepository = new CategoryRepository();

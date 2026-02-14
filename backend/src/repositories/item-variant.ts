import { getDb } from '../config/database.ts';
import type { ItemVariant, CreateItemVariantDTO } from '../models/index.ts';

/**
 * Item Variant Repository
 * Handles all database operations for item variants
 */
export class ItemVariantRepository {
  async findByItemId(itemId: number): Promise<ItemVariant[]> {
    const result = getDb().queryEntries(`
      SELECT id, item_id, style_name, price, image_path, sort_order, created_at
      FROM item_variants
      WHERE item_id = ?
      ORDER BY sort_order ASC, id ASC
    `, [itemId]);
    return result as unknown as ItemVariant[];
  }

  async findById(id: number): Promise<ItemVariant | null> {
    const result = getDb().queryEntries(`
      SELECT id, item_id, style_name, price, image_path, sort_order, created_at
      FROM item_variants
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as ItemVariant) : null;
  }

  async create(data: CreateItemVariantDTO): Promise<ItemVariant> {
    const result = getDb().queryEntries(`
      INSERT INTO item_variants (item_id, style_name, price, image_path, sort_order)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, item_id, style_name, price, image_path, sort_order, created_at
    `, [
      data.item_id,
      data.style_name,
      data.price,
      data.image_path || null,
      data.sort_order || 0,
    ]);

    return result[0] as unknown as ItemVariant;
  }

  async update(id: number, data: { style_name?: string; price?: number; image_path?: string | null; sort_order?: number }): Promise<ItemVariant | null> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.style_name !== undefined) {
      sets.push('style_name = ?');
      values.push(data.style_name);
    }
    if (data.price !== undefined) {
      sets.push('price = ?');
      values.push(data.price);
    }
    if (data.image_path !== undefined) {
      sets.push('image_path = ?');
      values.push(data.image_path);
    }
    if (data.sort_order !== undefined) {
      sets.push('sort_order = ?');
      values.push(data.sort_order);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE item_variants
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, item_id, style_name, price, image_path, sort_order, created_at
    `, values);

    return result.length > 0 ? (result[0] as unknown as ItemVariant) : null;
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM item_variants WHERE id = ?`, [id]);
  }

  async deleteByItemId(itemId: number): Promise<void> {
    getDb().query(`DELETE FROM item_variants WHERE item_id = ?`, [itemId]);
  }

  async reorder(itemId: number, variantIds: number[]): Promise<void> {
    for (let i = 0; i < variantIds.length; i++) {
      getDb().query(`
        UPDATE item_variants
        SET sort_order = ?
        WHERE id = ? AND item_id = ?
      `, [i + 1, variantIds[i], itemId]);
    }
  }
}

export const itemVariantRepository = new ItemVariantRepository();

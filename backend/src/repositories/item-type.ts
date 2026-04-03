import { getDb, withTransaction } from '../config/database.ts';
import type { ItemType, CreateItemTypeDTO, UpdateItemTypeDTO } from '../models/index.ts';

export class ItemTypeRepository {
  findAll(includeInactive = false): Promise<ItemType[]> {
    let sql = 'SELECT id, name, abbreviation, color, sort_order, is_active, created_at FROM item_types';
    if (!includeInactive) {
      sql += ' WHERE is_active = 1';
    }
    sql += ' ORDER BY sort_order ASC, name ASC';
    const result = getDb().queryEntries(sql);
    return Promise.resolve(result as unknown as ItemType[]);
  }

  findById(id: number): Promise<ItemType | null> {
    const result = getDb().queryEntries(
      'SELECT id, name, abbreviation, color, sort_order, is_active, created_at FROM item_types WHERE id = ?',
      [id]
    );
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ItemType) : null);
  }

  findByName(name: string): Promise<ItemType | null> {
    const result = getDb().queryEntries(
      'SELECT id, name, abbreviation, color, sort_order, is_active, created_at FROM item_types WHERE name = ?',
      [name]
    );
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ItemType) : null);
  }

  async create(data: CreateItemTypeDTO): Promise<ItemType> {
    const sortOrder = data.sort_order ?? await this.getNextSortOrder();
    const isActive = data.is_active ?? true;
    const color = data.color ?? '#3b82f6';

    const result = getDb().queryEntries(`
      INSERT INTO item_types (name, abbreviation, color, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, name, abbreviation, color, sort_order, is_active, created_at
    `, [data.name, data.abbreviation, color, sortOrder, isActive]);

    return result[0] as unknown as ItemType;
  }

  update(id: number, data: UpdateItemTypeDTO): Promise<ItemType | null> {
    const sets: string[] = [];
    const values: (string | number | boolean | undefined)[] = [];

    if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
    if (data.abbreviation !== undefined) { sets.push('abbreviation = ?'); values.push(data.abbreviation); }
    if (data.color !== undefined) { sets.push('color = ?'); values.push(data.color); }
    if (data.sort_order !== undefined) { sets.push('sort_order = ?'); values.push(data.sort_order); }
    if (data.is_active !== undefined) { sets.push('is_active = ?'); values.push(data.is_active); }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const result = getDb().queryEntries(`
      UPDATE item_types SET ${sets.join(', ')} WHERE id = ?
      RETURNING id, name, abbreviation, color, sort_order, is_active, created_at
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ItemType) : null);
  }

  deactivate(id: number): Promise<ItemType | null> {
    return this.update(id, { is_active: false });
  }

  activate(id: number): Promise<ItemType | null> {
    return this.update(id, { is_active: true });
  }

  delete(id: number): Promise<void> {
    const items = getDb().queryEntries('SELECT id FROM items WHERE type_id = ? LIMIT 1', [id]);
    if (items.length > 0) {
      throw new Error('Cannot delete item type that has items assigned to it');
    }
    getDb().query('DELETE FROM item_types WHERE id = ?', [id]);
    return Promise.resolve();
  }

  hasItems(id: number): Promise<boolean> {
    const result = getDb().queryEntries('SELECT COUNT(*) as count FROM items WHERE type_id = ?', [id]);
    return Promise.resolve((result[0] as unknown as { count: number }).count > 0);
  }

  reorder(typeIds: number[]): Promise<void> {
    withTransaction(() => {
      for (let i = 0; i < typeIds.length; i++) {
        getDb().query('UPDATE item_types SET sort_order = ? WHERE id = ?', [i + 1, typeIds[i]]);
      }
    });
    return Promise.resolve();
  }

  getNextSortOrder(): Promise<number> {
    const result = getDb().queryEntries('SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM item_types');
    return Promise.resolve((result[0] as unknown as { next: number }).next);
  }
}

export const itemTypeRepository = new ItemTypeRepository();

import { getDb } from '../config/database.ts';
import type { FloorplanBomEntry, CreateBomEntryDTO, UpdateBomEntryDTO } from '../models/index.ts';

/**
 * Floorplan BOM Entry Repository
 * Handles all database operations for BOM entries
 */
export class BomEntryRepository {
  async findAll(): Promise<FloorplanBomEntry[]> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
             name_snapshot, model_number_snapshot, price_snapshot, picture_path,
             created_at, updated_at
      FROM floorplan_bom_entries
      ORDER BY created_at DESC
    `);
    return result as unknown as FloorplanBomEntry[];
  }

  async findByFloorplan(floorplanId: number): Promise<FloorplanBomEntry[]> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
             name_snapshot, model_number_snapshot, price_snapshot, picture_path,
             created_at, updated_at
      FROM floorplan_bom_entries
      WHERE floorplan_id = ?
      ORDER BY parent_bom_entry_id NULLS FIRST, created_at DESC
    `, [floorplanId]);
    return result as unknown as FloorplanBomEntry[];
  }

  async findById(id: number): Promise<FloorplanBomEntry | null> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
             name_snapshot, model_number_snapshot, price_snapshot, picture_path,
             created_at, updated_at
      FROM floorplan_bom_entries
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as FloorplanBomEntry) : null;
  }

  async findByVariantAddons(
    floorplanId: number, 
    variantId: number, 
    parentId: number | null = null
  ): Promise<FloorplanBomEntry | null> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
             name_snapshot, model_number_snapshot, price_snapshot, picture_path,
             created_at, updated_at
      FROM floorplan_bom_entries
      WHERE floorplan_id = ? AND variant_id = ? 
        AND (parent_bom_entry_id = ? OR (parent_bom_entry_id IS NULL AND ? IS NULL))
    `, [floorplanId, variantId, parentId, parentId]);
    return result.length > 0 ? (result[0] as unknown as FloorplanBomEntry) : null;
  }

  async findByItem(floorplanId: number, itemId: number): Promise<FloorplanBomEntry[]> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
             name_snapshot, model_number_snapshot, price_snapshot, picture_path,
             created_at, updated_at
      FROM floorplan_bom_entries
      WHERE floorplan_id = ? AND item_id = ? AND parent_bom_entry_id IS NULL
      ORDER BY created_at DESC
    `, [floorplanId, itemId]);
    return result as unknown as FloorplanBomEntry[];
  }

  async findChildren(parentId: number): Promise<FloorplanBomEntry[]> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
             name_snapshot, model_number_snapshot, price_snapshot, picture_path,
             created_at, updated_at
      FROM floorplan_bom_entries
      WHERE parent_bom_entry_id = ?
      ORDER BY created_at ASC
    `, [parentId]);
    return result as unknown as FloorplanBomEntry[];
  }

  async create(data: CreateBomEntryDTO): Promise<FloorplanBomEntry> {
    const result = getDb().queryEntries(`
      INSERT INTO floorplan_bom_entries 
      (floorplan_id, item_id, variant_id, parent_bom_entry_id,
       name_snapshot, model_number_snapshot, price_snapshot, picture_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
                name_snapshot, model_number_snapshot, price_snapshot, picture_path,
                created_at, updated_at
    `, [
      data.floorplan_id,
      data.item_id,
      data.variant_id,
      data.parent_bom_entry_id ?? null,
      data.name_snapshot,
      data.model_number_snapshot ?? null,
      data.price_snapshot,
      data.picture_path ?? null
    ]);

    return result[0] as unknown as FloorplanBomEntry;
  }

  async update(id: number, data: UpdateBomEntryDTO): Promise<FloorplanBomEntry | null> {
    const sets: string[] = [];
    const values: (string | number | null | undefined)[] = [];

    if (data.variant_id !== undefined) {
      sets.push('variant_id = ?');
      values.push(data.variant_id);
    }
    if (data.name_snapshot !== undefined) {
      sets.push('name_snapshot = ?');
      values.push(data.name_snapshot);
    }
    if (data.model_number_snapshot !== undefined) {
      sets.push('model_number_snapshot = ?');
      values.push(data.model_number_snapshot);
    }
    if (data.price_snapshot !== undefined) {
      sets.push('price_snapshot = ?');
      values.push(data.price_snapshot);
    }
    if (data.picture_path !== undefined) {
      sets.push('picture_path = ?');
      values.push(data.picture_path);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    // Always update the updated_at timestamp
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE floorplan_bom_entries
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, floorplan_id, item_id, variant_id, parent_bom_entry_id,
                name_snapshot, model_number_snapshot, price_snapshot, picture_path,
                created_at, updated_at
    `, values);

    return result.length > 0 ? (result[0] as unknown as FloorplanBomEntry) : null;
  }

  async delete(id: number): Promise<void> {
    // Cascade delete will handle children and placements
    getDb().query(`DELETE FROM floorplan_bom_entries WHERE id = ?`, [id]);
  }

  async deleteByFloorplan(floorplanId: number): Promise<void> {
    getDb().query(`DELETE FROM floorplan_bom_entries WHERE floorplan_id = ?`, [floorplanId]);
  }

  async getPlacementCount(bomEntryId: number): Promise<number> {
    const result = getDb().queryEntries(`
      SELECT COUNT(*) as count FROM placements WHERE bom_entry_id = ?
    `, [bomEntryId]);
    return (result[0] as { count: number }).count;
  }
}

export const bomEntryRepository = new BomEntryRepository();

import { getDb } from '../config/database.ts';
import type { Placement, CreatePlacementDTO, UpdatePlacementDTO } from '../models/index.ts';

/**
 * Placement Repository
 * Handles all database operations for placements (items placed on floorplans)
 * Placements now reference BOM entries instead of variants directly
 */
export class PlacementRepository {
  async findAll(): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_entry_id, p.x, p.y, p.width, p.height, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id, b.selected_addons
      FROM placements p
      JOIN floorplan_bom_entries b ON p.bom_entry_id = b.id
      ORDER BY p.created_at DESC
    `);
    return result as unknown as Placement[];
  }

  async findByFloorplan(floorplanId: number): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_entry_id, p.x, p.y, p.width, p.height, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id, b.selected_addons
      FROM placements p
      JOIN floorplan_bom_entries b ON p.bom_entry_id = b.id
      WHERE b.floorplan_id = ?
      ORDER BY p.created_at DESC
    `, [floorplanId]);
    return result as unknown as Placement[];
  }

  async findById(id: number): Promise<Placement | null> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_entry_id, p.x, p.y, p.width, p.height, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id, b.selected_addons
      FROM placements p
      JOIN floorplan_bom_entries b ON p.bom_entry_id = b.id
      WHERE p.id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as Placement) : null;
  }

  async findByBomEntry(bomEntryId: number): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_entry_id, p.x, p.y, p.width, p.height, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id, b.selected_addons
      FROM placements p
      JOIN floorplan_bom_entries b ON p.bom_entry_id = b.id
      WHERE p.bom_entry_id = ?
      ORDER BY p.created_at DESC
    `, [bomEntryId]);
    return result as unknown as Placement[];
  }

  async create(data: CreatePlacementDTO): Promise<Placement> {
    const result = getDb().queryEntries(`
      INSERT INTO placements (bom_entry_id, x, y, width, height)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, bom_entry_id, x, y, width, height, created_at
    `, [
      data.floorplan_id, // This should be bom_entry_id now
      data.x,
      data.y,
      data.width,
      data.height,
    ]);

    const inserted = result[0] as Record<string, unknown>;
    
    // Get full placement data with BOM info
    return this.findById(inserted.id as number) as Promise<Placement>;
  }

  async createWithBomEntry(bomEntryId: number, data: Omit<CreatePlacementDTO, 'floorplan_id' | 'item_variant_id'>): Promise<Placement> {
    const result = getDb().queryEntries(`
      INSERT INTO placements (bom_entry_id, x, y, width, height)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, bom_entry_id, x, y, width, height, created_at
    `, [
      bomEntryId,
      data.x,
      data.y,
      data.width,
      data.height,
    ]);

    const inserted = result[0] as Record<string, unknown>;
    return this.findById(inserted.id as number) as Promise<Placement>;
  }

  async update(id: number, data: UpdatePlacementDTO): Promise<Placement | null> {
    const sets: string[] = [];
    const values: (string | number | null | undefined)[] = [];

    if (data.x !== undefined) {
      sets.push('x = ?');
      values.push(data.x);
    }
    if (data.y !== undefined) {
      sets.push('y = ?');
      values.push(data.y);
    }
    if (data.width !== undefined) {
      sets.push('width = ?');
      values.push(data.width);
    }
    if (data.height !== undefined) {
      sets.push('height = ?');
      values.push(data.height);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE placements
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, bom_entry_id, x, y, width, height, created_at
    `, values);

    if (result.length === 0) return null;
    
    const inserted = result[0] as Record<string, unknown>;
    return this.findById(inserted.id as number);
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM placements WHERE id = ?`, [id]);
  }

  async deleteByBomEntry(bomEntryId: number): Promise<void> {
    getDb().query(`DELETE FROM placements WHERE bom_entry_id = ?`, [bomEntryId]);
  }

  async countByBomEntry(bomEntryId: number): Promise<number> {
    const result = getDb().queryEntries(`
      SELECT COUNT(*) as count FROM placements WHERE bom_entry_id = ?
    `, [bomEntryId]);
    return (result[0] as { count: number }).count;
  }

  async updateDimensionsForItem(floorplanId: number, itemId: number, width: number, height: number): Promise<void> {
    getDb().query(`
      UPDATE placements
      SET width = ?, height = ?
      WHERE bom_entry_id IN (
        SELECT id FROM floorplan_bom_entries 
        WHERE floorplan_id = ? AND item_id = ?
      )
    `, [width, height, floorplanId, itemId]);
  }
}

export const placementRepository = new PlacementRepository();

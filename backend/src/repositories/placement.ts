import { getDb } from '../config/database.ts';
import type { Placement, CreatePlacementDTO, UpdatePlacementDTO } from '../models/index.ts';

/**
 * Placement Repository
 * Handles all database operations for placements (items placed on floorplans)
 * Placements now reference BOM entries instead of variants directly
 */
export class PlacementRepository {
  findAll(): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_id, p.x, p.y, p.width, p.height, p.rotation, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id
      FROM placements p
      JOIN project_bom b ON p.bom_id = b.id
      ORDER BY p.created_at DESC
    `);
    return Promise.resolve(result as unknown as Placement[]);
  }

  findByFloorplan(floorplanId: number): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_id, p.x, p.y, p.width, p.height, p.rotation, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id,
             b.picture_path as item_variant_image_path
      FROM placements p
      JOIN project_bom b ON p.bom_id = b.id
      WHERE b.floorplan_id = ?
      ORDER BY p.created_at DESC
    `, [floorplanId]);
    return Promise.resolve(result as unknown as Placement[]);
  }

  findById(id: number): Promise<Placement | null> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_id, p.x, p.y, p.width, p.height, p.rotation, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id
      FROM placements p
      JOIN project_bom b ON p.bom_id = b.id
      WHERE p.id = ?
    `, [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Placement) : null);
  }

  findByBomEntry(bomId: number): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT p.id, p.bom_id, p.x, p.y, p.width, p.height, p.rotation, p.created_at,
             b.floorplan_id, b.item_id, b.variant_id as item_variant_id
      FROM placements p
      JOIN project_bom b ON p.bom_id = b.id
      WHERE p.bom_id = ?
      ORDER BY p.created_at DESC
    `, [bomId]);
    return Promise.resolve(result as unknown as Placement[]);
  }

  create(data: CreatePlacementDTO): Promise<Placement> {
    const result = getDb().queryEntries(`
      INSERT INTO placements (bom_id, x, y, width, height, rotation)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, bom_id, x, y, width, height, rotation, created_at
    `, [
      data.floorplan_id, // This should be bom_id now
      data.x,
      data.y,
      data.width,
      data.height,
      data.rotation ?? 0.0,
    ]);

    const inserted = result[0] as Record<string, unknown>;
    
    // Get full placement data with BOM info
    return this.findById(inserted.id as number) as Promise<Placement>;
  }

  createWithBomEntry(bomId: number, data: Omit<CreatePlacementDTO, 'floorplan_id' | 'item_variant_id'>): Promise<Placement> {
    const result = getDb().queryEntries(`
      INSERT INTO placements (bom_id, x, y, width, height, rotation)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, bom_id, x, y, width, height, rotation, created_at
    `, [
      bomId,
      data.x,
      data.y,
      data.width,
      data.height,
      data.rotation ?? 0.0,
    ]);

    const inserted = result[0] as Record<string, unknown>;
    return this.findById(inserted.id as number) as Promise<Placement>;
  }

  update(id: number, data: UpdatePlacementDTO): Promise<Placement | null> {
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
    if (data.rotation !== undefined) {
      sets.push('rotation = ?');
      values.push(data.rotation);
    }
    if (data.bom_id !== undefined) {
      sets.push('bom_id = ?');
      values.push(data.bom_id);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE placements
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, bom_id, x, y, width, height, rotation, created_at
    `, values);

    if (result.length === 0) return Promise.resolve(null);
    
    const inserted = result[0] as Record<string, unknown>;
    return this.findById(inserted.id as number);
  }

  delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM placements WHERE id = ?`, [id]);
    return Promise.resolve();
  }

  deleteByBomEntry(bomId: number): Promise<void> {
    getDb().query(`DELETE FROM placements WHERE bom_id = ?`, [bomId]);
    return Promise.resolve();
  }

  countByBomEntry(bomId: number): Promise<number> {
    const result = getDb().queryEntries(`
      SELECT COUNT(*) as count FROM placements WHERE bom_id = ?
    `, [bomId]);
    return Promise.resolve((result[0] as { count: number }).count);
  }

  updateDimensionsForItem(floorplanId: number, itemId: number, width: number, height: number): Promise<void> {
    getDb().query(`
      UPDATE placements
      SET width = ?, height = ?
      WHERE bom_id IN (
        SELECT id FROM project_bom 
        WHERE floorplan_id = ? AND item_id = ?
      )
    `, [width, height, floorplanId, itemId]);
    return Promise.resolve();
  }

  findByBomId(bomId: number): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT id, bom_id, x, y, width, height, rotation, created_at
      FROM placements
      WHERE bom_id = ?
    `, [bomId]);
    return Promise.resolve(result as unknown as Placement[]);
  }
}

export const placementRepository = new PlacementRepository();

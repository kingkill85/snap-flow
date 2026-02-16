import { getDb } from '../config/database.ts';
import type { Placement, CreatePlacementDTO, UpdatePlacementDTO } from '../models/index.ts';

/**
 * Placement Repository
 * Handles all database operations for placements (items placed on floorplans)
 */
export class PlacementRepository {
  async findAll(): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, item_variant_id, x, y, width, height, selected_addons, created_at
      FROM placements
      ORDER BY created_at DESC
    `);
    return result as unknown as Placement[];
  }

  async findByFloorplan(floorplanId: number): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, item_variant_id, x, y, width, height, selected_addons, created_at
      FROM placements
      WHERE floorplan_id = ?
      ORDER BY created_at DESC
    `, [floorplanId]);
    return result as unknown as Placement[];
  }

  async findById(id: number): Promise<Placement | null> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, item_variant_id, x, y, width, height, selected_addons, created_at
      FROM placements
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as Placement) : null;
  }

  async findByItemAndFloorplan(itemId: number, floorplanId: number): Promise<Placement[]> {
    const result = getDb().queryEntries(`
      SELECT id, floorplan_id, item_id, item_variant_id, x, y, width, height, selected_addons, created_at
      FROM placements
      WHERE item_id = ? AND floorplan_id = ?
      ORDER BY created_at DESC
    `, [itemId, floorplanId]);
    return result as unknown as Placement[];
  }

  async create(data: CreatePlacementDTO): Promise<Placement> {
    // Get the item_id from the variant
    const variantResult = getDb().queryEntries(`
      SELECT item_id FROM item_variants WHERE id = ?
    `, [data.item_variant_id]);
    const itemId = variantResult.length > 0 ? (variantResult[0] as { item_id: number }).item_id : null;

    const result = getDb().queryEntries(`
      INSERT INTO placements (floorplan_id, item_id, item_variant_id, x, y, width, height, selected_addons)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, floorplan_id, item_id, item_variant_id, x, y, width, height, selected_addons, created_at
    `, [
      data.floorplan_id,
      itemId,
      data.item_variant_id,
      data.x,
      data.y,
      data.width,
      data.height,
      data.selected_addons || null,
    ]);

    return result[0] as unknown as Placement;
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
    if (data.item_variant_id !== undefined) {
      sets.push('item_variant_id = ?');
      values.push(data.item_variant_id);
    }
    if (data.selected_addons !== undefined) {
      sets.push('selected_addons = ?');
      values.push(data.selected_addons);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE placements
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, floorplan_id, item_id, item_variant_id, x, y, width, height, selected_addons, created_at
    `, values);

    return result.length > 0 ? (result[0] as unknown as Placement) : null;
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM placements WHERE id = ?`, [id]);
  }

  async deleteByFloorplan(floorplanId: number): Promise<void> {
    getDb().query(`DELETE FROM placements WHERE floorplan_id = ?`, [floorplanId]);
  }

  async deleteByItemAndFloorplan(itemId: number, floorplanId: number): Promise<void> {
    getDb().query(`DELETE FROM placements WHERE item_id = ? AND floorplan_id = ?`, [itemId, floorplanId]);
  }

  async updateDimensionsForItem(floorplanId: number, itemId: number, width: number, height: number): Promise<void> {
    getDb().query(`
      UPDATE placements
      SET width = ?, height = ?
      WHERE floorplan_id = ? AND item_id = ?
    `, [width, height, floorplanId, itemId]);
  }
}

export const placementRepository = new PlacementRepository();

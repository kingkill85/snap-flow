import { getDb, withTransaction, withTransactionAsync } from '../config/database.ts';
import type { ProjectBom, CreateBomEntryDTO, UpdateBomEntryDTO } from '../models/index.ts';
import { placementRepository } from './placement.ts';
import { fileStorageService } from '../services/file-storage.ts';

/**
 * Project BOM Repository
 * Handles all database operations for project bill of materials
 */
export class BomEntryRepository {
  findAll(): Promise<ProjectBom[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
             item_name, item_type_name, style_name, model_number, unit_price, picture_path,
             created_at, updated_at
      FROM project_bom
      ORDER BY created_at DESC
    `);
    return Promise.resolve(result as unknown as ProjectBom[]);
  }

  findByFloorplan(floorplanId: number): Promise<ProjectBom[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
             item_name, item_type_name, style_name, model_number, unit_price, picture_path,
             created_at, updated_at
      FROM project_bom
      WHERE floorplan_id = ?
      ORDER BY parent_bom_id NULLS FIRST, created_at DESC
    `, [floorplanId]);
    return Promise.resolve(result as unknown as ProjectBom[]);
  }

  findById(id: number): Promise<ProjectBom | null> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
             item_name, item_type_name, style_name, model_number, unit_price, picture_path,
             created_at, updated_at
      FROM project_bom
      WHERE id = ?
    `, [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ProjectBom) : null);
  }

  findByVariantAddons(
    floorplanId: number, 
    variantId: number, 
    parentId: number | null = null
  ): Promise<ProjectBom | null> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
             item_name, item_type_name, style_name, model_number, unit_price, picture_path,
             created_at, updated_at
      FROM project_bom
      WHERE floorplan_id = ? AND variant_id = ? 
        AND (parent_bom_id = ? OR (parent_bom_id IS NULL AND ? IS NULL))
    `, [floorplanId, variantId, parentId, parentId]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ProjectBom) : null);
  }

  findByItem(floorplanId: number, itemId: number): Promise<ProjectBom[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
             item_name, item_type_name, style_name, model_number, unit_price, picture_path,
             created_at, updated_at
      FROM project_bom
      WHERE floorplan_id = ? AND item_id = ? AND parent_bom_id IS NULL
      ORDER BY created_at DESC
    `, [floorplanId, itemId]);
    return Promise.resolve(result as unknown as ProjectBom[]);
  }

  findChildren(parentId: number): Promise<ProjectBom[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
             item_name, item_type_name, style_name, model_number, unit_price, picture_path,
             created_at, updated_at
      FROM project_bom
      WHERE parent_bom_id = ?
      ORDER BY created_at ASC
    `, [parentId]);
    return Promise.resolve(result as unknown as ProjectBom[]);
  }

  create(data: CreateBomEntryDTO): Promise<ProjectBom> {
    const result = getDb().queryEntries(`
      INSERT INTO project_bom
      (project_id, floorplan_id, item_id, variant_id, parent_bom_id,
       item_name, item_type_name, style_name, model_number, unit_price, picture_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
                item_name, item_type_name, style_name, model_number, unit_price, picture_path,
                created_at, updated_at
    `, [
      data.project_id,
      data.floorplan_id,
      data.item_id,
      data.variant_id,
      data.parent_bom_id ?? null,
      data.item_name,
      data.item_type_name ?? null,
      data.style_name ?? null,
      data.model_number ?? null,
      data.unit_price,
      data.picture_path ?? null
    ]);

    return Promise.resolve(result[0] as unknown as ProjectBom);
  }

  update(id: number, data: UpdateBomEntryDTO): Promise<ProjectBom | null> {
    const sets: string[] = [];
    const values: (string | number | null | undefined)[] = [];

    if (data.variant_id !== undefined) {
      sets.push('variant_id = ?');
      values.push(data.variant_id);
    }
    if (data.item_name !== undefined) {
      sets.push('item_name = ?');
      values.push(data.item_name);
    }
    if (data.item_type_name !== undefined) {
      sets.push('item_type_name = ?');
      values.push(data.item_type_name);
    }
    if (data.style_name !== undefined) {
      sets.push('style_name = ?');
      values.push(data.style_name);
    }
    if (data.model_number !== undefined) {
      sets.push('model_number = ?');
      values.push(data.model_number);
    }
    if (data.unit_price !== undefined) {
      sets.push('unit_price = ?');
      values.push(data.unit_price);
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
      UPDATE project_bom
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
                item_name, item_type_name, style_name, model_number, unit_price, picture_path,
                created_at, updated_at
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as ProjectBom) : null);
  }

  async delete(id: number): Promise<void> {
    // Collect image paths before deleting (for file cleanup after transaction)
    const children = getDb().queryEntries<{ picture_path: string | null }>(
      `SELECT picture_path FROM project_bom WHERE parent_bom_id = ?`, [id]
    );
    const parent = getDb().queryEntries<{ picture_path: string | null }>(
      `SELECT picture_path FROM project_bom WHERE id = ?`, [id]
    );
    const imagePaths = [
      ...children.map(c => c.picture_path),
      ...parent.map(p => p.picture_path),
    ].filter((p): p is string => p !== null && p !== undefined);

    await withTransactionAsync(async () => {
      // Delete placements referencing children
      getDb().query(`DELETE FROM placements WHERE bom_id IN (SELECT id FROM project_bom WHERE parent_bom_id = ?)`, [id]);
      // Delete placements referencing parent
      await placementRepository.deleteByBomEntry(id);
      // Delete children BOM entries
      getDb().query(`DELETE FROM project_bom WHERE parent_bom_id = ?`, [id]);
      // Delete parent BOM entry
      getDb().query(`DELETE FROM project_bom WHERE id = ?`, [id]);
    });

    // Clean up image files outside transaction
    for (const imagePath of imagePaths) {
      try {
        await fileStorageService.deleteFile(imagePath);
      } catch {
        // Ignore file cleanup errors — DB state is consistent
      }
    }
  }

  deleteByFloorplan(floorplanId: number): Promise<void> {
    withTransaction(() => {
      // Delete placements referencing BOM entries for this floorplan
      getDb().query(`DELETE FROM placements WHERE bom_id IN (SELECT id FROM project_bom WHERE floorplan_id = ?)`, [floorplanId]);
      // Delete BOM entries
      getDb().query(`DELETE FROM project_bom WHERE floorplan_id = ?`, [floorplanId]);
    });
    return Promise.resolve();
  }

  clearVariantId(variantId: number): Promise<void> {
    // Set variant_id to NULL for all BOM entries referencing this variant
    // This preserves BOM history while allowing variant deletion
    getDb().query(`UPDATE project_bom SET variant_id = NULL WHERE variant_id = ?`, [variantId]);
    return Promise.resolve();
  }

  clearItemId(itemId: number): Promise<void> {
    // Set item_id to NULL for all BOM entries referencing this item
    // This preserves BOM history while allowing item deletion
    getDb().query(`UPDATE project_bom SET item_id = NULL WHERE item_id = ?`, [itemId]);
    return Promise.resolve();
  }

  getPlacementCount(bomId: number): Promise<number> {
    const result = getDb().queryEntries(`
      SELECT COUNT(*) as count FROM placements WHERE bom_id = ?
    `, [bomId]);
    return Promise.resolve((result[0] as { count: number }).count);
  }

  findByPicturePath(picturePath: string): Promise<ProjectBom[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, floorplan_id, item_id, variant_id, parent_bom_id, area_id,
             item_name, item_type_name, style_name, model_number, unit_price, picture_path,
             created_at, updated_at
      FROM project_bom
      WHERE picture_path = ?
    `, [picturePath]);
    return Promise.resolve(result as unknown as ProjectBom[]);
  }
}

export const bomEntryRepository = new BomEntryRepository();

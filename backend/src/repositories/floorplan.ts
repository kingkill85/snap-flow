import { getDb, withTransaction } from '../config/database.ts';
import type { Floorplan, CreateFloorplanDTO, UpdateFloorplanDTO } from '../models/index.ts';

/**
 * Floorplan Repository
 * Handles all database operations for floorplans
 */
export class FloorplanRepository {
  findAll(): Promise<Floorplan[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, name, image_path, sort_order
      FROM floorplans
      ORDER BY sort_order ASC, id ASC
    `);
    return Promise.resolve(result as unknown as Floorplan[]);
  }

  findByProject(projectId: number): Promise<Floorplan[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, name, image_path, sort_order
      FROM floorplans
      WHERE project_id = ?
      ORDER BY sort_order ASC, id ASC
    `, [projectId]);
    return Promise.resolve(result as unknown as Floorplan[]);
  }

  findById(id: number): Promise<Floorplan | null> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, name, image_path, sort_order
      FROM floorplans
      WHERE id = ?
    `, [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Floorplan) : null);
  }

  create(data: CreateFloorplanDTO): Promise<Floorplan> {
    // Get max sort_order for this project
    const maxResult = getDb().queryEntries(`
      SELECT MAX(sort_order) as max_order
      FROM floorplans
      WHERE project_id = ?
    `, [data.project_id]);
    const maxOrder = (maxResult[0] as { max_order: number | null }).max_order || 0;
    const sortOrder = data.sort_order ?? (maxOrder + 1);

    const result = getDb().queryEntries(`
      INSERT INTO floorplans (project_id, name, image_path, sort_order)
      VALUES (?, ?, ?, ?)
      RETURNING id, project_id, name, image_path, sort_order
    `, [data.project_id, data.name, data.image_path, sortOrder]);

    return Promise.resolve(result[0] as unknown as Floorplan);
  }

  update(id: number, data: UpdateFloorplanDTO): Promise<Floorplan | null> {
    const sets: string[] = [];
    const values: (string | number | undefined)[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
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
      UPDATE floorplans
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, project_id, name, image_path, sort_order
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Floorplan) : null);
  }

  delete(id: number): Promise<void> {
    withTransaction(() => {
      // Delete placements that reference BOM entries for this floorplan
      getDb().query(`
        DELETE FROM placements
        WHERE bom_id IN (SELECT id FROM project_bom WHERE floorplan_id = ?)
      `, [id]);

      // Delete child BOM entries first (parent_bom_id references)
      getDb().query(`DELETE FROM project_bom WHERE floorplan_id = ? AND parent_bom_id IS NOT NULL`, [id]);

      // Then delete parent BOM entries
      getDb().query(`DELETE FROM project_bom WHERE floorplan_id = ?`, [id]);

      // Finally delete the floorplan
      getDb().query(`DELETE FROM floorplans WHERE id = ?`, [id]);
    });
    return Promise.resolve();
  }

  reorder(projectId: number, floorplanIds: number[]): Promise<void> {
    for (let i = 0; i < floorplanIds.length; i++) {
      getDb().query(`
        UPDATE floorplans
        SET sort_order = ?
        WHERE id = ? AND project_id = ?
      `, [i + 1, floorplanIds[i], projectId]);
    }
    return Promise.resolve();
  }
}

export const floorplanRepository = new FloorplanRepository();

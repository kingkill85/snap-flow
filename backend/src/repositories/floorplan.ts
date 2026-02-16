import { getDb } from '../config/database.ts';
import type { Floorplan, CreateFloorplanDTO, UpdateFloorplanDTO } from '../models/index.ts';

/**
 * Floorplan Repository
 * Handles all database operations for floorplans
 */
export class FloorplanRepository {
  async findAll(): Promise<Floorplan[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, name, image_path, sort_order
      FROM floorplans
      ORDER BY sort_order ASC, id ASC
    `);
    return result as unknown as Floorplan[];
  }

  async findByProject(projectId: number): Promise<Floorplan[]> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, name, image_path, sort_order
      FROM floorplans
      WHERE project_id = ?
      ORDER BY sort_order ASC, id ASC
    `, [projectId]);
    return result as unknown as Floorplan[];
  }

  async findById(id: number): Promise<Floorplan | null> {
    const result = getDb().queryEntries(`
      SELECT id, project_id, name, image_path, sort_order
      FROM floorplans
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as Floorplan) : null;
  }

  async create(data: CreateFloorplanDTO): Promise<Floorplan> {
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

    return result[0] as unknown as Floorplan;
  }

  async update(id: number, data: UpdateFloorplanDTO): Promise<Floorplan | null> {
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

    return result.length > 0 ? (result[0] as unknown as Floorplan) : null;
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM floorplans WHERE id = ?`, [id]);
  }

  async reorder(projectId: number, floorplanIds: number[]): Promise<void> {
    for (let i = 0; i < floorplanIds.length; i++) {
      getDb().query(`
        UPDATE floorplans
        SET sort_order = ?
        WHERE id = ? AND project_id = ?
      `, [i + 1, floorplanIds[i], projectId]);
    }
  }
}

export const floorplanRepository = new FloorplanRepository();

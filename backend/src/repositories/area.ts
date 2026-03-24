import { getDb } from '../config/database.ts';
import type { Area, AreaVertex, CreateAreaDTO, UpdateAreaDTO } from '../models/index.ts';

/**
 * Area Repository
 * Handles all database operations for areas (polygonal regions on floorplans)
 * Areas are stored as placements with type='area', plus area_properties and area_vertices
 */
export class AreaRepository {
  findByFloorplan(floorplanId: number): Promise<Area[]> {
    const areas = getDb().queryEntries(`
      SELECT
        p.id, p.floorplan_id, p.x, p.y, p.width, p.height,
        ap.name, ap.color, ap.opacity, ap.created_at, ap.updated_at,
        COUNT(DISTINCT dp.id) as device_count
      FROM placements p
      JOIN area_properties ap ON ap.placement_id = p.id
      LEFT JOIN placements dp ON dp.area_id = p.id AND dp.type = 'item'
      WHERE p.floorplan_id = ? AND p.type = 'area'
      GROUP BY p.id, ap.id
      ORDER BY ap.created_at ASC
    `, [floorplanId]);

    const result: Area[] = [];
    for (const row of areas) {
      const r = row as Record<string, unknown>;
      const vertices = getDb().queryEntries(`
        SELECT id, placement_id, vertex_index, x, y
        FROM area_vertices
        WHERE placement_id = ?
        ORDER BY vertex_index ASC
      `, [r.id as number]);

      result.push({
        id: r.id as number,
        floorplan_id: r.floorplan_id as number,
        x: r.x as number,
        y: r.y as number,
        width: r.width as number,
        height: r.height as number,
        name: r.name as string,
        color: r.color as string,
        opacity: r.opacity as number,
        vertices: vertices as unknown as AreaVertex[],
        device_count: r.device_count as number,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      });
    }

    return Promise.resolve(result);
  }

  findById(id: number): Promise<Area | null> {
    const rows = getDb().queryEntries(`
      SELECT
        p.id, p.floorplan_id, p.x, p.y, p.width, p.height,
        ap.name, ap.color, ap.opacity, ap.created_at, ap.updated_at,
        COUNT(DISTINCT dp.id) as device_count
      FROM placements p
      JOIN area_properties ap ON ap.placement_id = p.id
      LEFT JOIN placements dp ON dp.area_id = p.id AND dp.type = 'item'
      WHERE p.id = ? AND p.type = 'area'
      GROUP BY p.id, ap.id
    `, [id]);

    if (rows.length === 0) return Promise.resolve(null);

    const r = rows[0] as Record<string, unknown>;
    const vertices = getDb().queryEntries(`
      SELECT id, placement_id, vertex_index, x, y
      FROM area_vertices
      WHERE placement_id = ?
      ORDER BY vertex_index ASC
    `, [id]);

    const area: Area = {
      id: r.id as number,
      floorplan_id: r.floorplan_id as number,
      x: r.x as number,
      y: r.y as number,
      width: r.width as number,
      height: r.height as number,
      name: r.name as string,
      color: r.color as string,
      opacity: r.opacity as number,
      vertices: vertices as unknown as AreaVertex[],
      device_count: r.device_count as number,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
    };

    return Promise.resolve(area);
  }

  create(data: CreateAreaDTO): Promise<Area> {
    const db = getDb();
    try {
      db.query('BEGIN');

      // Insert the placement row with type='area'
      const placementRows = db.queryEntries(`
        INSERT INTO placements (floorplan_id, type, x, y, width, height, rotation)
        VALUES (?, 'area', ?, ?, ?, ?, 0)
        RETURNING id
      `, [data.floorplan_id, data.x, data.y, data.width, data.height]);

      const placementId = (placementRows[0] as Record<string, unknown>).id as number;

      // Insert area_properties
      db.query(`
        INSERT INTO area_properties (placement_id, name, color, opacity)
        VALUES (?, ?, ?, ?)
      `, [
        placementId,
        data.name ?? 'New Area',
        data.color ?? '#3B82F6',
        data.opacity ?? 0.2,
      ]);

      // Insert 4 default rectangle vertices (top-left clockwise)
      const x = data.x;
      const y = data.y;
      const w = data.width;
      const h = data.height;
      const defaultVertices = [
        [0, x,     y],
        [1, x + w, y],
        [2, x + w, y + h],
        [3, x,     y + h],
      ];

      for (const [idx, vx, vy] of defaultVertices) {
        db.query(`
          INSERT INTO area_vertices (placement_id, vertex_index, x, y)
          VALUES (?, ?, ?, ?)
        `, [placementId, idx, vx, vy]);
      }

      db.query('COMMIT');

      return this.findById(placementId) as Promise<Area>;
    } catch (err) {
      db.query('ROLLBACK');
      throw err;
    }
  }

  updateProperties(id: number, data: UpdateAreaDTO): Promise<Area | null> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.color !== undefined) {
      sets.push('color = ?');
      values.push(data.color);
    }
    if (data.opacity !== undefined) {
      sets.push('opacity = ?');
      values.push(data.opacity);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    getDb().query(`
      UPDATE area_properties
      SET ${sets.join(', ')}
      WHERE placement_id = ?
    `, values);

    return this.findById(id);
  }

  updateVertices(id: number, vertices: Array<{ x: number; y: number }>): Promise<Area | null> {
    const db = getDb();
    try {
      db.query('BEGIN');

      // Delete existing vertices
      db.query(`DELETE FROM area_vertices WHERE placement_id = ?`, [id]);

      // Compute bounding box from new vertices
      const xs = vertices.map((v) => v.x);
      const ys = vertices.map((v) => v.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);

      // Update placement bounding box
      db.query(`
        UPDATE placements
        SET x = ?, y = ?, width = ?, height = ?
        WHERE id = ?
      `, [minX, minY, maxX - minX, maxY - minY, id]);

      // Insert new vertices
      for (let i = 0; i < vertices.length; i++) {
        db.query(`
          INSERT INTO area_vertices (placement_id, vertex_index, x, y)
          VALUES (?, ?, ?, ?)
        `, [id, i, vertices[i].x, vertices[i].y]);
      }

      // Touch updated_at on area_properties
      db.query(`
        UPDATE area_properties
        SET updated_at = CURRENT_TIMESTAMP
        WHERE placement_id = ?
      `, [id]);

      db.query('COMMIT');

      return this.findById(id);
    } catch (err) {
      db.query('ROLLBACK');
      throw err;
    }
  }

  delete(id: number): Promise<void> {
    // Nullify area_id on BOM entries that reference this area
    getDb().query(`UPDATE project_bom SET area_id = NULL WHERE area_id = ?`, [id]);

    // Nullify area_id on contained item placements
    getDb().query(`
      UPDATE placements SET area_id = NULL WHERE area_id = ?
    `, [id]);

    // Delete the area placement (cascades to area_properties and area_vertices via FK)
    getDb().query(`DELETE FROM placements WHERE id = ? AND type = 'area'`, [id]);

    return Promise.resolve();
  }

  assignPlacementToArea(placementId: number, areaId: number | null): Promise<void> {
    getDb().query(`
      UPDATE placements SET area_id = ? WHERE id = ? AND type = 'item'
    `, [areaId, placementId]);

    return Promise.resolve();
  }

  findVerticesForFloorplan(floorplanId: number): Promise<Array<{ placement_id: number; vertex_index: number; x: number; y: number }>> {
    const result = getDb().queryEntries(`
      SELECT av.placement_id, av.vertex_index, av.x, av.y
      FROM area_vertices av
      JOIN placements p ON p.id = av.placement_id
      WHERE p.floorplan_id = ? AND p.type = 'area'
      ORDER BY av.placement_id ASC, av.vertex_index ASC
    `, [floorplanId]);

    return Promise.resolve(result as unknown as Array<{ placement_id: number; vertex_index: number; x: number; y: number }>);
  }
  /**
   * Recheck containment for ALL item placements on a floorplan.
   * Uses point-in-polygon (ray casting) to assign each item to the correct area.
   * Updates both placements.area_id and project_bom.area_id.
   */
  recheckContainment(floorplanId: number): Promise<void> {
    const db = getDb();

    // Get all areas with their vertices for this floorplan
    const areaRows = db.queryEntries<{ id: number }>(`
      SELECT id FROM placements WHERE floorplan_id = ? AND type = 'area'
    `, [floorplanId]);

    const areas: { id: number; vertices: { x: number; y: number }[]; area: number }[] = [];
    for (const a of areaRows) {
      const verts = db.queryEntries<{ x: number; y: number }>(`
        SELECT x, y FROM area_vertices WHERE placement_id = ? ORDER BY vertex_index ASC
      `, [a.id]);
      if (verts.length < 3) continue;
      // Compute polygon area (shoelace) for "smallest wins" rule
      let polyArea = 0;
      for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        polyArea += (verts[j].x + verts[i].x) * (verts[j].y - verts[i].y);
      }
      areas.push({ id: a.id, vertices: verts, area: Math.abs(polyArea / 2) });
    }

    // Get all item placements on this floorplan
    const items = db.queryEntries<{ id: number; bom_id: number | null; area_id: number | null; x: number; y: number; width: number; height: number }>(`
      SELECT id, bom_id, area_id, x, y, width, height FROM placements
      WHERE floorplan_id = ? AND type = 'item'
    `, [floorplanId]);

    for (const item of items) {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;

      // Find containing area (smallest wins)
      let bestId: number | null = null;
      let bestArea = Infinity;
      for (const a of areas) {
        if (this._pointInPolygon(cx, cy, a.vertices) && a.area < bestArea) {
          bestArea = a.area;
          bestId = a.id;
        }
      }

      if (bestId !== item.area_id) {
        db.query(`UPDATE placements SET area_id = ? WHERE id = ?`, [bestId, item.id]);
        if (item.bom_id) {
          db.query(`UPDATE project_bom SET area_id = ? WHERE id = ?`, [bestId, item.bom_id]);
        }
      }
    }

    return Promise.resolve();
  }

  /** Ray casting point-in-polygon */
  private _pointInPolygon(px: number, py: number, vertices: { x: number; y: number }[]): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      const intersect = ((yi > py) !== (yj > py))
        && (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

export const areaRepository = new AreaRepository();

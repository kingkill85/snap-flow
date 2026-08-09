import { getDb } from "../config/database.ts";
import type {
  Area,
  AreaVertex,
  CreateAreaDTO,
  UpdateAreaDTO,
} from "../models/index.ts";

/**
 * Area Repository
 * Handles all database operations for areas (polygonal regions on floorplans)
 * Areas are stored as placements with type='area', plus area_properties and area_vertices
 */
export class AreaRepository {
  findByFloorplan(
    floorplanId: number,
    access?: { role: string; tenantId: number },
  ): Promise<Area[]> {
    if (access && !this.canAccessFloorplan(floorplanId, access)) {
      return Promise.resolve([]);
    }
    const areas = getDb().queryEntries(
      `
      SELECT
        p.id, p.floorplan_id, p.x, p.y, p.width, p.height,
        ap.name, ap.color, ap.opacity, ap.revision, ap.created_at, ap.updated_at,
        COUNT(DISTINCT dp.id) as device_count
      FROM placements p
      JOIN area_properties ap ON ap.placement_id = p.id
      LEFT JOIN placements dp ON dp.area_id = p.id AND dp.type = 'item'
      WHERE p.floorplan_id = ? AND p.type = 'area'
      GROUP BY p.id, ap.id
      ORDER BY ap.created_at ASC
    `,
      [floorplanId],
    );

    const ids = areas.map((row) => (row as { id: number }).id);
    const vertices = ids.length
      ? getDb().queryEntries(
        `SELECT id, placement_id, vertex_index, x, y FROM area_vertices
      WHERE placement_id IN (${
          ids.map(() => "?").join(",")
        }) ORDER BY placement_id, vertex_index`,
        ids,
      )
      : [];
    const vertexMap = new Map<number, AreaVertex[]>();
    for (const vertex of vertices as unknown as AreaVertex[]) {
      vertexMap.set(vertex.placement_id, [
        ...(vertexMap.get(vertex.placement_id) ?? []),
        vertex,
      ]);
    }
    const groups = this.loadZoningGroups(floorplanId, ids);
    const result: Area[] = areas.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as number,
        floorplan_id: r.floorplan_id as number,
        x: r.x as number,
        y: r.y as number,
        width: r.width as number,
        height: r.height as number,
        name: r.name as string,
        color: r.color as string,
        opacity: r.opacity as number,
        vertices: vertexMap.get(r.id as number) ?? [],
        device_count: r.device_count as number,
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
        revision: r.revision as number,
        zoning_groups: groups.get(r.id as number) ?? [],
      };
    });

    return Promise.resolve(result);
  }

  findById(
    id: number,
    access?: { role: string; tenantId: number },
  ): Promise<Area | null> {
    const rows = getDb().queryEntries(
      `
      SELECT
        p.id, p.floorplan_id, p.x, p.y, p.width, p.height,
        ap.name, ap.color, ap.opacity, ap.revision, ap.created_at, ap.updated_at,
        COUNT(DISTINCT dp.id) as device_count
      FROM placements p
      JOIN area_properties ap ON ap.placement_id = p.id
      LEFT JOIN placements dp ON dp.area_id = p.id AND dp.type = 'item'
      WHERE p.id = ? AND p.type = 'area'
      GROUP BY p.id, ap.id
    `,
      [id],
    );

    if (rows.length === 0) return Promise.resolve(null);
    if (
      access &&
      !this.canAccessFloorplan(
        (rows[0] as { floorplan_id: number }).floorplan_id,
        access,
      )
    ) return Promise.resolve(null);

    const r = rows[0] as Record<string, unknown>;
    const vertices = getDb().queryEntries(
      `
      SELECT id, placement_id, vertex_index, x, y
      FROM area_vertices
      WHERE placement_id = ?
      ORDER BY vertex_index ASC
    `,
      [id],
    );

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
      revision: r.revision as number,
      zoning_groups:
        this.loadZoningGroups(r.floorplan_id as number, [id]).get(id) ?? [],
    };

    return Promise.resolve(area);
  }

  create(data: CreateAreaDTO): Promise<Area> {
    const db = getDb();
    try {
      db.query("BEGIN");

      // Insert the placement row with type='area'
      const placementRows = db.queryEntries(
        `
        INSERT INTO placements (floorplan_id, type, x, y, width, height, rotation)
        VALUES (?, 'area', ?, ?, ?, ?, 0)
        RETURNING id
      `,
        [data.floorplan_id, data.x, data.y, data.width, data.height],
      );

      const placementId = (placementRows[0] as Record<string, unknown>)
        .id as number;

      // Insert area_properties
      db.query(
        `
        INSERT INTO area_properties (placement_id, name, color, opacity)
        VALUES (?, ?, ?, ?)
      `,
        [
          placementId,
          data.name ?? "New Area",
          data.color ?? "#3B82F6",
          data.opacity ?? 0.2,
        ],
      );

      // Insert 4 default rectangle vertices (top-left clockwise)
      const x = data.x;
      const y = data.y;
      const w = data.width;
      const h = data.height;
      const defaultVertices = [
        [0, x, y],
        [1, x + w, y],
        [2, x + w, y + h],
        [3, x, y + h],
      ];

      for (const [idx, vx, vy] of defaultVertices) {
        db.query(
          `
          INSERT INTO area_vertices (placement_id, vertex_index, x, y)
          VALUES (?, ?, ?, ?)
        `,
          [placementId, idx, vx, vy],
        );
      }

      db.query("COMMIT");

      return this.findById(placementId) as Promise<Area>;
    } catch (err) {
      db.query("ROLLBACK");
      throw err;
    }
  }

  updateProperties(
    id: number,
    data: UpdateAreaDTO,
    access?: { role: string; tenantId: number },
  ): Promise<Area | null> {
    if (data.zoning_values !== undefined) {
      return this.updateWithZoning(id, data, access);
    }
    if (access) {
      const owner = getDb().queryEntries<{ floorplan_id: number }>(
        "SELECT floorplan_id FROM placements WHERE id = ? AND type = 'area'",
        [id],
      )[0];
      if (!owner || !this.canAccessFloorplan(owner.floorplan_id, access)) {
        return Promise.resolve(null);
      }
    }
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      sets.push("name = ?");
      values.push(data.name);
    }
    if (data.color !== undefined) {
      sets.push("color = ?");
      values.push(data.color);
    }
    if (data.opacity !== undefined) {
      sets.push("opacity = ?");
      values.push(data.opacity);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    sets.push("updated_at = CURRENT_TIMESTAMP", "revision = revision + 1");
    values.push(id);

    getDb().query(
      `
      UPDATE area_properties
      SET ${sets.join(", ")}
      WHERE placement_id = ?
    `,
      values,
    );

    return this.findById(id);
  }

  private updateWithZoning(
    id: number,
    data: UpdateAreaDTO,
    access?: { role: string; tenantId: number },
  ): Promise<Area | null> {
    const db = getDb();
    try {
      db.query("BEGIN IMMEDIATE");
      const current =
        db.queryEntries<{ revision: number; floorplan_id: number }>(
          `SELECT ap.revision, p.floorplan_id
        FROM area_properties ap JOIN placements p ON p.id = ap.placement_id WHERE p.id = ? AND p.type = 'area'`,
          [id],
        )[0];
      if (!current) {
        db.query("ROLLBACK");
        return Promise.resolve(null);
      }
      if (access && !this.canAccessFloorplan(current.floorplan_id, access)) {
        db.query("ROLLBACK");
        return Promise.resolve(null);
      }
      if (data.revision !== current.revision) {
        throw new Error("ZONING_CONFLICT: Area changed; reload required");
      }
      const applicable = this.applicableParameterIds(current.floorplan_id);
      const submitted = data.applicable_parameter_ids ?? [];
      if (
        submitted.length !== applicable.length ||
        new Set(submitted).size !== submitted.length ||
        [...submitted].sort((a, b) => a - b).some((value, index) =>
          value !== [...applicable].sort((a, b) => a - b)[index]
        )
      ) {
        throw new Error(
          "ZONING_CONFLICT: Configuration changed; reload required",
        );
      }
      const values = data.zoning_values ?? [];
      if (
        values.length !== applicable.length || new Set(values.map((v) =>
            v.parameter_id
          )).size !== values.length ||
        values.some((value) =>
          !applicable.includes(value.parameter_id) ||
          !Number.isInteger(value.value) || value.value < 0 ||
          value.value > 9999
        )
      ) {
        throw new Error(
          "ZONING_VALIDATION: Values must be unique integers from 0 to 9999 for every applicable parameter",
        );
      }
      const sets: string[] = [];
      const args: Array<string | number> = [];
      for (const key of ["name", "color", "opacity"] as const) {
        if (data[key] !== undefined) {
          sets.push(`${key} = ?`);
          args.push(data[key] as string | number);
        }
      }
      sets.push("revision = revision + 1", "updated_at = CURRENT_TIMESTAMP");
      args.push(id);
      db.query(
        `UPDATE area_properties SET ${sets.join(", ")} WHERE placement_id = ?`,
        args,
      );
      for (const value of values) {
        if (value.value === 0) {
          db.query(
            "DELETE FROM area_zoning_values WHERE area_placement_id = ? AND parameter_id = ?",
            [id, value.parameter_id],
          );
        } else {db.query(
            `INSERT INTO area_zoning_values(area_placement_id, parameter_id, value) VALUES (?, ?, ?)
          ON CONFLICT(area_placement_id, parameter_id) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
            [id, value.parameter_id, value.value],
          );}
      }
      db.query("COMMIT");
      return this.findById(id);
    } catch (error) {
      try {
        db.query("ROLLBACK");
      } catch { /* transaction already closed */ }
      throw error;
    }
  }

  canAccessFloorplan(
    floorplanId: number,
    access: { role: string; tenantId: number },
  ): boolean {
    const sql =
      `SELECT 1 FROM floorplans f JOIN projects p ON p.id = f.project_id WHERE f.id = ?${
        access.role === "admin" ? "" : " AND p.tenant_id = ?"
      }`;
    return getDb().queryEntries(
      sql,
      access.role === "admin" ? [floorplanId] : [floorplanId, access.tenantId],
    ).length > 0;
  }

  private applicableParameterIds(floorplanId: number): number[] {
    return getDb().queryEntries<{ id: number }>(
      `SELECT zp.id FROM floorplans f
      JOIN project_item_types pit ON pit.project_id = f.project_id
      JOIN item_types it ON it.id = pit.item_type_id AND it.is_active = 1
      JOIN item_type_zoning_parameters zp ON zp.item_type_id = it.id AND zp.is_active = 1
      WHERE f.id = ? ORDER BY it.sort_order, it.id, zp.sort_order, zp.id`,
      [floorplanId],
    ).map((row) => row.id);
  }

  private loadZoningGroups(
    floorplanId: number,
    areaIds: number[],
  ): Map<number, Area["zoning_groups"]> {
    const result = new Map<number, Area["zoning_groups"]>();
    if (!areaIds.length) return result;
    const definitions = getDb().queryEntries<Record<string, unknown>>(
      `SELECT it.id item_type_id, it.name item_type_name,
      it.abbreviation, it.color, it.sort_order item_type_sort_order, zp.id parameter_id, zp.name parameter_name, zp.sort_order parameter_sort_order
      FROM floorplans f JOIN project_item_types pit ON pit.project_id = f.project_id
      JOIN item_types it ON it.id = pit.item_type_id AND it.is_active = 1
      JOIN item_type_zoning_parameters zp ON zp.item_type_id = it.id AND zp.is_active = 1
      WHERE f.id = ? ORDER BY it.sort_order, it.id, zp.sort_order, zp.id`,
      [floorplanId],
    );
    const stored = getDb().queryEntries<
      { area_placement_id: number; parameter_id: number; value: number }
    >(
      `SELECT area_placement_id, parameter_id, value
      FROM area_zoning_values WHERE area_placement_id IN (${
        areaIds.map(() => "?").join(",")
      })`,
      areaIds,
    );
    const valueMap = new Map(
      stored.map((
        row,
      ) => [`${row.area_placement_id}:${row.parameter_id}`, row.value]),
    );
    for (const areaId of areaIds) {
      const groups: Area["zoning_groups"] = [];
      for (const definition of definitions) {
        let group = groups.find((entry) =>
          entry.item_type.id === definition.item_type_id
        );
        if (!group) {
          group = {
            item_type: {
              id: definition.item_type_id as number,
              name: definition.item_type_name as string,
              abbreviation: definition.abbreviation as string,
              color: definition.color as string,
              sort_order: definition.item_type_sort_order as number,
            },
            parameters: [],
          };
          groups.push(group);
        }
        group.parameters.push({
          id: definition.parameter_id as number,
          name: definition.parameter_name as string,
          sort_order: definition.parameter_sort_order as number,
          value: valueMap.get(`${areaId}:${definition.parameter_id}`) ?? 0,
        });
      }
      result.set(areaId, groups);
    }
    return result;
  }

  updateVertices(
    id: number,
    vertices: Array<{ x: number; y: number }>,
  ): Promise<Area | null> {
    const db = getDb();
    try {
      db.query("BEGIN");

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
      db.query(
        `
        UPDATE placements
        SET x = ?, y = ?, width = ?, height = ?
        WHERE id = ?
      `,
        [minX, minY, maxX - minX, maxY - minY, id],
      );

      // Insert new vertices
      for (let i = 0; i < vertices.length; i++) {
        db.query(
          `
          INSERT INTO area_vertices (placement_id, vertex_index, x, y)
          VALUES (?, ?, ?, ?)
        `,
          [id, i, vertices[i].x, vertices[i].y],
        );
      }

      // Touch updated_at on area_properties
      db.query(
        `
        UPDATE area_properties
        SET updated_at = CURRENT_TIMESTAMP, revision = revision + 1
        WHERE placement_id = ?
      `,
        [id],
      );

      db.query("COMMIT");

      return this.findById(id);
    } catch (err) {
      db.query("ROLLBACK");
      throw err;
    }
  }

  delete(id: number): Promise<void> {
    // Nullify area_id on BOM entries that reference this area
    getDb().query(`UPDATE project_bom SET area_id = NULL WHERE area_id = ?`, [
      id,
    ]);

    // Nullify area_id on contained item placements
    getDb().query(
      `
      UPDATE placements SET area_id = NULL WHERE area_id = ?
    `,
      [id],
    );

    // Delete the area placement (cascades to area_properties and area_vertices via FK)
    getDb().query(`DELETE FROM placements WHERE id = ? AND type = 'area'`, [
      id,
    ]);

    return Promise.resolve();
  }

  assignPlacementToArea(
    placementId: number,
    areaId: number | null,
  ): Promise<void> {
    getDb().query(
      `
      UPDATE placements SET area_id = ? WHERE id = ? AND type = 'item'
    `,
      [areaId, placementId],
    );

    return Promise.resolve();
  }

  findVerticesForFloorplan(
    floorplanId: number,
  ): Promise<
    Array<{ placement_id: number; vertex_index: number; x: number; y: number }>
  > {
    const result = getDb().queryEntries(
      `
      SELECT av.placement_id, av.vertex_index, av.x, av.y
      FROM area_vertices av
      JOIN placements p ON p.id = av.placement_id
      WHERE p.floorplan_id = ? AND p.type = 'area'
      ORDER BY av.placement_id ASC, av.vertex_index ASC
    `,
      [floorplanId],
    );

    return Promise.resolve(
      result as unknown as Array<
        { placement_id: number; vertex_index: number; x: number; y: number }
      >,
    );
  }
  /**
   * Recheck containment for ALL item placements on a floorplan.
   * Uses point-in-polygon (ray casting) to assign each item to the correct area.
   * Updates both placements.area_id and project_bom.area_id.
   */
  recheckContainment(floorplanId: number): Promise<void> {
    const db = getDb();

    // Get all areas with their vertices for this floorplan
    const areaRows = db.queryEntries<{ id: number }>(
      `
      SELECT id FROM placements WHERE floorplan_id = ? AND type = 'area'
    `,
      [floorplanId],
    );

    const areas: {
      id: number;
      vertices: { x: number; y: number }[];
      area: number;
    }[] = [];
    for (const a of areaRows) {
      const verts = db.queryEntries<{ x: number; y: number }>(
        `
        SELECT x, y FROM area_vertices WHERE placement_id = ? ORDER BY vertex_index ASC
      `,
        [a.id],
      );
      if (verts.length < 3) continue;
      // Compute polygon area (shoelace) for "smallest wins" rule
      let polyArea = 0;
      for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
        polyArea += (verts[j].x + verts[i].x) * (verts[j].y - verts[i].y);
      }
      areas.push({ id: a.id, vertices: verts, area: Math.abs(polyArea / 2) });
    }

    // Get all item placements on this floorplan
    const items = db.queryEntries<
      {
        id: number;
        bom_id: number | null;
        area_id: number | null;
        x: number;
        y: number;
        width: number;
        height: number;
      }
    >(
      `
      SELECT id, bom_id, area_id, x, y, width, height FROM placements
      WHERE floorplan_id = ? AND type = 'item'
    `,
      [floorplanId],
    );

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
        db.query(`UPDATE placements SET area_id = ? WHERE id = ?`, [
          bestId,
          item.id,
        ]);
        if (item.bom_id) {
          db.query(`UPDATE project_bom SET area_id = ? WHERE id = ?`, [
            bestId,
            item.bom_id,
          ]);
        }
      }
    }

    return Promise.resolve();
  }

  /** Ray casting point-in-polygon */
  private _pointInPolygon(
    px: number,
    py: number,
    vertices: { x: number; y: number }[],
  ): boolean {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

export const areaRepository = new AreaRepository();

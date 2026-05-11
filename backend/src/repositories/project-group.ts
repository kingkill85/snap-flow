import { getDb, withTransactionAsync } from '../config/database.ts';
import type {
  ProjectGroup,
  ProjectGroupWithVersions,
  CreateProjectGroupDTO,
  UpdateProjectGroupDTO,
  CreateVersionDTO,
} from '../models/project-group.ts';
import type { Project } from '../models/index.ts';
import type { TenantContext } from './user.ts';
import { fileStorageService } from '../services/file-storage.ts';

const GROUP_COLUMNS = `id, name, customer_name, customer_email, customer_phone, customer_address, tenant_id, created_at`;

/**
 * Project Group Repository
 * Handles all database operations for project groups and version creation
 */
export class ProjectGroupRepository {
  findAll(search?: string, ctx?: TenantContext): Promise<ProjectGroupWithVersions[]> {
    let sql = `SELECT ${GROUP_COLUMNS} FROM project_groups`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (ctx && ctx.role !== 'admin') {
      conditions.push('tenant_id = ?');
      params.push(ctx.tenantId);
    }

    if (search) {
      conditions.push('(name LIKE ? OR customer_name LIKE ?)');
      const pattern = `%${search}%`;
      params.push(pattern, pattern);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY created_at DESC`;

    const groups = getDb().queryEntries(sql, params) as unknown as ProjectGroup[];
    const result: ProjectGroupWithVersions[] = [];

    for (const group of groups) {
      const versions = getDb().queryEntries(
        `SELECT id, version_name, status, created_at FROM projects WHERE project_group_id = ? ORDER BY created_at DESC`,
        [group.id]
      ) as unknown as ProjectGroupWithVersions['versions'];

      result.push({ ...group, versions });
    }

    return Promise.resolve(result);
  }

  findById(id: number, ctx?: TenantContext): Promise<ProjectGroupWithVersions | null> {
    let sql = `SELECT ${GROUP_COLUMNS} FROM project_groups WHERE id = ?`;
    const params: (string | number)[] = [id];

    if (ctx && ctx.role !== 'admin') {
      sql += ` AND tenant_id = ?`;
      params.push(ctx.tenantId);
    }

    const groups = getDb().queryEntries(sql, params) as unknown as ProjectGroup[];
    if (groups.length === 0) return Promise.resolve(null);

    const group = groups[0];
    const versions = getDb().queryEntries(
      `SELECT id, version_name, status, created_at FROM projects WHERE project_group_id = ? ORDER BY created_at DESC`,
      [id]
    ) as unknown as ProjectGroupWithVersions['versions'];

    return Promise.resolve({ ...group, versions });
  }

  create(data: CreateProjectGroupDTO): Promise<ProjectGroup> {
    try {
      const result = getDb().queryEntries(`
        INSERT INTO project_groups (name, customer_name, customer_email, customer_phone, customer_address, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING ${GROUP_COLUMNS}
      `, [
        data.name,
        data.customer_name,
        data.customer_email || null,
        data.customer_phone || null,
        data.customer_address || null,
        data.tenant_id,
      ]);

      return Promise.resolve(result[0] as unknown as ProjectGroup);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('UNIQUE constraint failed')) {
        throw new Error(
          `A project group with the name "${data.name}" already exists for customer "${data.customer_name}"`
        );
      }
      throw error;
    }
  }

  update(id: number, data: UpdateProjectGroupDTO): Promise<ProjectGroup | null> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.customer_name !== undefined) {
      sets.push('customer_name = ?');
      values.push(data.customer_name);
    }
    if (data.customer_email !== undefined) {
      sets.push('customer_email = ?');
      values.push(data.customer_email);
    }
    if (data.customer_phone !== undefined) {
      sets.push('customer_phone = ?');
      values.push(data.customer_phone);
    }
    if (data.customer_address !== undefined) {
      sets.push('customer_address = ?');
      values.push(data.customer_address);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    try {
      const result = getDb().queryEntries(`
        UPDATE project_groups SET ${sets.join(', ')} WHERE id = ?
        RETURNING ${GROUP_COLUMNS}
      `, values);

      return Promise.resolve(result.length > 0 ? (result[0] as unknown as ProjectGroup) : null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('UNIQUE constraint failed')) {
        throw new Error('A project group with this name already exists for this customer');
      }
      throw error;
    }
  }

  delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM project_groups WHERE id = ?`, [id]);
    return Promise.resolve();
  }

  async createVersion(groupId: number, data: CreateVersionDTO, tenantId: number): Promise<Project> {
    return withTransactionAsync(async () => {
      const db = getDb();

      // Step a: Find latest version in group
      const latestVersions = db.queryEntries(`
        SELECT id, status, discount_percentage, discount_usd,
               services_percentage, services_usd, local_currency_code,
               exchange_rate, google_exchange_rate
        FROM projects
        WHERE project_group_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `, [groupId]) as unknown as Project[];

      if (latestVersions.length === 0) {
        throw new Error('No versions found in group');
      }

      const sourceProject = latestVersions[0];

      // Step b: Create new project row
      const newProjectRows = db.queryEntries(`
        INSERT INTO projects (
          project_group_id, version_name, status, tenant_id,
          discount_percentage, discount_usd, services_percentage, services_usd,
          local_currency_code, exchange_rate, google_exchange_rate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id, project_group_id, version_name, status, tenant_id, created_at,
                  discount_percentage, discount_usd, services_percentage, services_usd,
                  local_currency_code, exchange_rate, google_exchange_rate
      `, [
        groupId,
        data.version_name,
        sourceProject.status,
        tenantId,
        sourceProject.discount_percentage,
        sourceProject.discount_usd,
        sourceProject.services_percentage,
        sourceProject.services_usd,
        sourceProject.local_currency_code,
        sourceProject.exchange_rate,
        sourceProject.google_exchange_rate,
      ]) as unknown as Project[];

      const newProject = newProjectRows[0];

      // Step c: Copy floorplans and remap IDs
      const floorplans = db.queryEntries(`
        SELECT id, name, image_path, sort_order
        FROM floorplans
        WHERE project_id = ?
      `, [sourceProject.id]) as unknown as Array<{
        id: number;
        name: string;
        image_path: string;
        sort_order: number;
      }>;

      const floorplanIdMap = new Map<number, number>();

      for (const fp of floorplans) {
        const newImagePath = await this._copyFloorplanImage(fp.image_path);

        const newFpRows = db.queryEntries(`
          INSERT INTO floorplans (project_id, name, image_path, sort_order)
          VALUES (?, ?, ?, ?)
          RETURNING id
        `, [newProject.id, fp.name, newImagePath, fp.sort_order]);

        const newFpId = (newFpRows[0] as Record<string, unknown>).id as number;
        floorplanIdMap.set(fp.id, newFpId);
      }

      // Steps d-h: Copy placements, areas, and their related data
      const floorplanIds = Array.from(floorplanIdMap.keys());

      if (floorplanIds.length > 0) {
        const placeholders = floorplanIds.map(() => '?').join(',');

        // Step d: Copy placements and build ID map
        const placements = db.queryEntries(`
          SELECT id, bom_id, floorplan_id, type, area_id, x, y, width, height, rotation
          FROM placements
          WHERE floorplan_id IN (${placeholders})
        `, floorplanIds) as unknown as Array<{
          id: number;
          bom_id: number | null;
          floorplan_id: number;
          type: string;
          area_id: number | null;
          x: number;
          y: number;
          width: number;
          height: number;
          rotation: number;
        }>;

        const placementIdMap = new Map<number, number>();

        for (const p of placements) {
          const newFloorplanId = floorplanIdMap.get(p.floorplan_id);
          if (!newFloorplanId) continue;

          const newPlacementRows = db.queryEntries(`
            INSERT INTO placements (bom_id, floorplan_id, type, area_id, x, y, width, height, rotation)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
          `, [
            null,
            newFloorplanId,
            p.type,
            null,
            p.x,
            p.y,
            p.width,
            p.height,
            p.rotation,
          ]);

          const newPlacementId = (newPlacementRows[0] as Record<string, unknown>).id as number;
          placementIdMap.set(p.id, newPlacementId);
        }

        // Step e: Fix area_id references on placements
        for (const p of placements) {
          if (p.area_id !== null && placementIdMap.has(p.area_id)) {
            const newId = placementIdMap.get(p.id)!;
            const newAreaId = placementIdMap.get(p.area_id);
            db.query(`UPDATE placements SET area_id = ? WHERE id = ?`, [newAreaId, newId]);
          }
        }

        // Step f: Copy area_properties
        const areaProperties = db.queryEntries(`
          SELECT ap.placement_id, ap.name, ap.color, ap.opacity
          FROM area_properties ap
          JOIN placements p ON p.id = ap.placement_id
          WHERE p.floorplan_id IN (${placeholders})
        `, floorplanIds) as unknown as Array<{
          placement_id: number;
          name: string;
          color: string;
          opacity: number;
        }>;

        for (const ap of areaProperties) {
          const newPlacementId = placementIdMap.get(ap.placement_id);
          if (!newPlacementId) continue;

          db.query(`
            INSERT INTO area_properties (placement_id, name, color, opacity)
            VALUES (?, ?, ?, ?)
          `, [newPlacementId, ap.name, ap.color, ap.opacity]);
        }

        // Step g: Copy area_vertices
        const areaVertices = db.queryEntries(`
          SELECT av.placement_id, av.vertex_index, av.x, av.y
          FROM area_vertices av
          JOIN placements p ON p.id = av.placement_id
          WHERE p.floorplan_id IN (${placeholders})
        `, floorplanIds) as unknown as Array<{
          placement_id: number;
          vertex_index: number;
          x: number;
          y: number;
        }>;

        for (const av of areaVertices) {
          const newPlacementId = placementIdMap.get(av.placement_id);
          if (!newPlacementId) continue;

          db.query(`
            INSERT INTO area_vertices (placement_id, vertex_index, x, y)
            VALUES (?, ?, ?, ?)
          `, [newPlacementId, av.vertex_index, av.x, av.y]);
        }

        // Note: placement_addons table does not exist in current schema; skipped
      }

      // Step i: Copy project_item_types
      const itemTypes = db.queryEntries(`
        SELECT item_type_id FROM project_item_types WHERE project_id = ?
      `, [sourceProject.id]) as unknown as Array<{ item_type_id: number }>;

      for (const it of itemTypes) {
        db.query(`
          INSERT INTO project_item_types (project_id, item_type_id)
          VALUES (?, ?)
        `, [newProject.id, it.item_type_id]);
      }

      return newProject;
    });
  }

  countVersions(groupId: number): Promise<number> {
    const result = getDb().queryEntries(
      `SELECT COUNT(*) as count FROM projects WHERE project_group_id = ?`,
      [groupId]
    );
    return Promise.resolve((result[0] as Record<string, unknown>).count as number);
  }

  /**
   * Copy a floorplan image file to a new location
   */
  private async _copyFloorplanImage(sourcePath: string): Promise<string> {
    return fileStorageService.copyFile(sourcePath, 'floorplans');
  }
}

export const projectGroupRepository = new ProjectGroupRepository();

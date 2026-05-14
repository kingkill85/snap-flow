import { getDb } from '../config/database.ts';
import type { Project, CreateProjectDTO, UpdateProjectDTO } from '../models/index.ts';
import type { CreateProjectGroupDTO } from '../models/project-group.ts';
import type { TenantContext } from './user.ts';
import { projectGroupRepository } from './project-group.ts';
import { fileStorageService } from '../services/file-storage.ts';

const PROJECT_COLUMNS = `id, project_group_id, version_name, tenant_id, created_at, google_exchange_rate`;

/**
 * Project Repository
 * Handles all database operations for projects
 */
export class ProjectRepository {
  findAll(search?: string, ctx?: TenantContext): Promise<Project[]> {
    let sql = `SELECT p.id, p.project_group_id, p.version_name, p.tenant_id, p.created_at,
      p.google_exchange_rate,
      pg.customer_name, pg.customer_email, pg.customer_phone, pg.customer_address
      FROM projects p
      LEFT JOIN project_groups pg ON p.project_group_id = pg.id`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (ctx && ctx.role !== 'admin') {
      conditions.push('p.tenant_id = ?');
      params.push(ctx.tenantId);
    }

    if (search) {
      conditions.push('(p.version_name LIKE ? OR pg.customer_name LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY p.created_at DESC`;

    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as Project[]);
  }

  findAllByTenant(tenantId: number, search?: string): Promise<Project[]> {
    let sql = `SELECT p.id, p.project_group_id, p.version_name, p.tenant_id, p.created_at,
      p.google_exchange_rate,
      pg.customer_name, pg.customer_email, pg.customer_phone, pg.customer_address
      FROM projects p
      LEFT JOIN project_groups pg ON p.project_group_id = pg.id
      WHERE p.tenant_id = ?`;
    const params: (string | number)[] = [tenantId];

    if (search) {
      sql += ` AND (p.version_name LIKE ? OR pg.customer_name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    sql += ` ORDER BY p.created_at DESC`;
    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as Project[]);
  }

  findById(id: number, ctx?: TenantContext): Promise<Project | null> {
    let sql = `SELECT p.id, p.project_group_id, p.version_name, p.tenant_id, p.created_at,
      p.google_exchange_rate,
      pg.customer_name, pg.customer_email, pg.customer_phone, pg.customer_address
      FROM projects p
      LEFT JOIN project_groups pg ON p.project_group_id = pg.id
      WHERE p.id = ?`;
    const params: (string | number)[] = [id];

    if (ctx && ctx.role !== 'admin') {
      sql += ` AND p.tenant_id = ?`;
      params.push(ctx.tenantId);
    }

    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Project) : null);
  }

  async create(data: CreateProjectDTO): Promise<Project> {
    // Step a: Create project group first
    const groupData: CreateProjectGroupDTO = {
      customer_name: data.customer_name,
      tenant_id: data.tenant_id,
    };
    if (data.customer_email) groupData.customer_email = data.customer_email;
    if (data.customer_phone) groupData.customer_phone = data.customer_phone;
    if (data.customer_address) groupData.customer_address = data.customer_address;

    const group = await projectGroupRepository.create(groupData);

    // Step b: Create project with group_id
    const result = getDb().queryEntries(`
      INSERT INTO projects (project_group_id, version_name, tenant_id)
      VALUES (?, ?, ?)
      RETURNING ${PROJECT_COLUMNS}
    `, [
      group.id,
      data.version_name || 'v1',
      data.tenant_id,
    ]);

    const project = result[0] as unknown as Project;

    // Step c: Set item types if provided
    if (data.item_type_ids && data.item_type_ids.length > 0) {
      await this.setItemTypeIds(project.id, data.item_type_ids);
    } else {
      await this.setDefaultItemTypes(project.id);
    }

    return project;
  }

  async update(id: number, data: UpdateProjectDTO, ctx?: TenantContext): Promise<Project | null> {
    const currentProject = await this.findById(id, ctx);
    if (!currentProject) {
      return null;
    }

    const sets: string[] = [];
    const values: (string | number | null | undefined)[] = [];

    if (data.version_name !== undefined) {
      sets.push('version_name = ?');
      values.push(data.version_name);
    }
    if (data.tenant_id !== undefined) {
      sets.push('tenant_id = ?');
      values.push(data.tenant_id);
    }

    if (sets.length === 0) {
      return currentProject;
    }

    values.push(id);

    try {
      let sql = `UPDATE projects SET ${sets.join(', ')} WHERE id = ?`;
      if (ctx && ctx.role !== 'admin') {
        sql = `UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ${ctx.tenantId}`;
      }
      sql += ` RETURNING ${PROJECT_COLUMNS}`;

      const result = getDb().queryEntries(sql, values);
      return result.length > 0 ? (result[0] as unknown as Project) : null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('UNIQUE constraint failed')) {
        throw new Error('A project with this version name already exists in this group');
      }
      throw error;
    }
  }

  /**
   * Cascade delete a single version: files, placements, BOM, floorplans, then the project.
   * Blocked if it's the only version in the group (user must delete the group instead).
   */
  async delete(id: number, ctx?: TenantContext): Promise<void> {
    const db = getDb();

    // Verify project exists and get its group
    let project: { id: number; tenant_id: number; project_group_id: number } | null = null;
    if (ctx && ctx.role !== 'admin') {
      const result = db.queryEntries(
        `SELECT id, tenant_id, project_group_id FROM projects WHERE id = ? AND tenant_id = ?`,
        [id, ctx.tenantId]
      );
      project = result.length > 0 ? (result[0] as unknown as { id: number; tenant_id: number; project_group_id: number }) : null;
    } else {
      const result = db.queryEntries(
        `SELECT id, tenant_id, project_group_id FROM projects WHERE id = ?`,
        [id]
      );
      project = result.length > 0 ? (result[0] as unknown as { id: number; tenant_id: number; project_group_id: number }) : null;
    }

    if (!project) {
      throw new Error('Project not found');
    }

    // Block deletion if it's the only version in the group
    const versionCount = await this.countVersions(project.project_group_id);
    if (versionCount <= 1) {
      throw new Error('Cannot delete the only version in a project group. Delete the group instead.');
    }

    // Cascade delete all related data
    await this._deleteVersionData(id);

    // Delete the project itself
    db.query(`DELETE FROM projects WHERE id = ?`, [id]);
  }

  /**
   * Internal: cascade delete all data attached to a version (files + DB records).
   */
  private _deleteVersionData(projectId: number): Promise<void> {
    const db = getDb();

    // Get floorplans for this project (need image paths before deletion)
    const floorplans = db.queryEntries(
      `SELECT id, image_path FROM floorplans WHERE project_id = ?`,
      [projectId]
    ) as unknown as Array<{ id: number; image_path: string }>;

    for (const fp of floorplans) {
      // Delete floorplan image file
      fileStorageService.deleteFile(fp.image_path).catch(() => {});

      // placements cascade to area_properties and area_vertices via FK ON DELETE CASCADE
      db.query(`DELETE FROM placements WHERE floorplan_id = ?`, [fp.id]);

      // Delete BOM entries for this floorplan (get picture paths first)
      const bomEntries = db.queryEntries(
        `SELECT picture_path FROM project_bom WHERE floorplan_id = ? AND picture_path IS NOT NULL`,
        [fp.id]
      ) as unknown as Array<{ picture_path: string }>;
      for (const bom of bomEntries) {
        fileStorageService.deleteFile(bom.picture_path).catch(() => {});
      }
      db.query(`DELETE FROM project_bom WHERE floorplan_id = ?`, [fp.id]);
    }

    // Delete any remaining BOM entries by project_id
    db.query(`DELETE FROM project_bom WHERE project_id = ?`, [projectId]);

    // Delete floorplans
    db.query(`DELETE FROM floorplans WHERE project_id = ?`, [projectId]);

    // Delete project item types
    db.query(`DELETE FROM project_item_types WHERE project_id = ?`, [projectId]);

    return Promise.resolve();
  }

  getItemTypeIds(projectId: number): Promise<number[]> {
    const result = getDb().queryEntries(
      'SELECT item_type_id FROM project_item_types WHERE project_id = ? ORDER BY item_type_id',
      [projectId]
    );
    return Promise.resolve((result as unknown as { item_type_id: number }[]).map(r => r.item_type_id));
  }

  setItemTypeIds(projectId: number, typeIds: number[]): Promise<void> {
    getDb().query('DELETE FROM project_item_types WHERE project_id = ?', [projectId]);
    for (const typeId of typeIds) {
      getDb().query(
        'INSERT INTO project_item_types (project_id, item_type_id) VALUES (?, ?)',
        [projectId, typeId]
      );
    }
    return Promise.resolve();
  }

  setDefaultItemTypes(projectId: number): Promise<void> {
    const types = getDb().queryEntries('SELECT id FROM item_types WHERE is_active = 1');
    for (const t of types) {
      const typeId = (t as unknown as { id: number }).id;
      getDb().query(
        'INSERT OR IGNORE INTO project_item_types (project_id, item_type_id) VALUES (?, ?)',
        [projectId, typeId]
      );
    }
    return Promise.resolve();
  }

  countVersions(groupId: number): Promise<number> {
    const result = getDb().queryEntries(
      `SELECT COUNT(*) as count FROM projects WHERE project_group_id = ?`,
      [groupId]
    );
    return Promise.resolve((result[0] as Record<string, unknown>).count as number);
  }

  /**
   * Check if a group has any version with data (floorplans, BOM, placements, etc).
   * Group can only be deleted if all versions are "empty".
   */
  groupHasData(groupId: number): Promise<boolean> {
    const db = getDb();

    // Check floorplans
    const floorplansResult = db.queryEntries(`
      SELECT COUNT(*) as count FROM floorplans f
      JOIN projects p ON p.id = f.project_id
      WHERE p.project_group_id = ?
    `, [groupId]);
    const hasFloorplans = (floorplansResult[0] as Record<string, unknown>).count as number > 0;
    if (hasFloorplans) return Promise.resolve(true);

    // Check BOM entries (that exist without floorplans, via project_id only)
    const bomResult = db.queryEntries(`
      SELECT COUNT(*) as count FROM project_bom b
      JOIN projects p ON p.id = b.project_id
      WHERE p.project_group_id = ?
    `, [groupId]);
    const hasBom = (bomResult[0] as Record<string, unknown>).count as number > 0;

    return Promise.resolve(hasBom);
  }

  /**
   * Delete all versions in a group.
   * Only called after verifying all versions are empty.
   */
  deleteAllInGroup(groupId: number, ctx?: TenantContext): Promise<void> {
    const db = getDb();

    let sql = `SELECT id FROM projects WHERE project_group_id = ?`;
    const params: (string | number)[] = [groupId];
    if (ctx && ctx.role !== 'admin') {
      sql += ` AND tenant_id = ?`;
      params.push(ctx.tenantId);
    }
    const projects = db.queryEntries(sql, params) as unknown as Array<{ id: number }>;

    for (const project of projects) {
      this._deleteVersionData(project.id);
      db.query(`DELETE FROM projects WHERE id = ?`, [project.id]);
    }

    return Promise.resolve();
  }
}

export const projectRepository = new ProjectRepository();

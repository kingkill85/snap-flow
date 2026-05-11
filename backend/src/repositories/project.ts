import { getDb } from '../config/database.ts';
import type { Project, CreateProjectDTO, UpdateProjectDTO, UpdateInvoiceSettingsDTO } from '../models/index.ts';
import type { CreateProjectGroupDTO } from '../models/project-group.ts';
import type { TenantContext } from './user.ts';
import { projectGroupRepository } from './project-group.ts';

const PROJECT_COLUMNS = `id, project_group_id, version_name, status, tenant_id, created_at,
  discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
  exchange_rate, google_exchange_rate`;

/**
 * Project Repository
 * Handles all database operations for projects
 */
export class ProjectRepository {
  findAll(search?: string, ctx?: TenantContext): Promise<Project[]> {
    let sql = `SELECT p.id, p.project_group_id, p.version_name, p.status, p.tenant_id, p.created_at,
      p.discount_percentage, p.discount_usd, p.services_percentage, p.services_usd, p.local_currency_code,
      p.exchange_rate, p.google_exchange_rate,
      pg.name as group_name, pg.customer_name, pg.customer_email, pg.customer_phone, pg.customer_address
      FROM projects p
      LEFT JOIN project_groups pg ON p.project_group_id = pg.id`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (ctx && ctx.role !== 'admin') {
      conditions.push('p.tenant_id = ?');
      params.push(ctx.tenantId);
    }

    if (search) {
      conditions.push('(p.version_name LIKE ? OR pg.name LIKE ? OR pg.customer_name LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY p.created_at DESC`;

    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as Project[]);
  }

  findAllByTenant(tenantId: number, search?: string): Promise<Project[]> {
    let sql = `SELECT p.id, p.project_group_id, p.version_name, p.status, p.tenant_id, p.created_at,
      p.discount_percentage, p.discount_usd, p.services_percentage, p.services_usd, p.local_currency_code,
      p.exchange_rate, p.google_exchange_rate,
      pg.name as group_name, pg.customer_name, pg.customer_email, pg.customer_phone, pg.customer_address
      FROM projects p
      LEFT JOIN project_groups pg ON p.project_group_id = pg.id
      WHERE p.tenant_id = ?`;
    const params: (string | number)[] = [tenantId];

    if (search) {
      sql += ` AND (p.version_name LIKE ? OR pg.name LIKE ? OR pg.customer_name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    sql += ` ORDER BY p.created_at DESC`;
    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as Project[]);
  }

  findById(id: number, ctx?: TenantContext): Promise<Project | null> {
    let sql = `SELECT p.id, p.project_group_id, p.version_name, p.status, p.tenant_id, p.created_at,
      p.discount_percentage, p.discount_usd, p.services_percentage, p.services_usd, p.local_currency_code,
      p.exchange_rate, p.google_exchange_rate,
      pg.name as group_name, pg.customer_name, pg.customer_email, pg.customer_phone, pg.customer_address
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
      name: data.group_name,
      customer_name: data.customer_name,
      tenant_id: data.tenant_id,
    };
    if (data.customer_email) groupData.customer_email = data.customer_email;
    if (data.customer_phone) groupData.customer_phone = data.customer_phone;
    if (data.customer_address) groupData.customer_address = data.customer_address;

    const group = await projectGroupRepository.create(groupData);

    // Step b: Create project with group_id
    const result = getDb().queryEntries(`
      INSERT INTO projects (project_group_id, version_name, status, tenant_id)
      VALUES (?, ?, ?, ?)
      RETURNING ${PROJECT_COLUMNS}
    `, [
      group.id,
      data.version_name || 'v1',
      data.status || 'active',
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
    if (data.status !== undefined) {
      sets.push('status = ?');
      values.push(data.status);
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

  async delete(id: number, ctx?: TenantContext): Promise<void> {
    // Get project group to check version count before deleting
    let project: { project_group_id: number } | null = null;
    if (ctx && ctx.role !== 'admin') {
      const result = getDb().queryEntries(
        `SELECT project_group_id FROM projects WHERE id = ? AND tenant_id = ?`,
        [id, ctx.tenantId]
      );
      project = result.length > 0 ? (result[0] as unknown as { project_group_id: number }) : null;
    } else {
      const result = getDb().queryEntries(
        `SELECT project_group_id FROM projects WHERE id = ?`,
        [id]
      );
      project = result.length > 0 ? (result[0] as unknown as { project_group_id: number }) : null;
    }

    if (!project) {
      throw new Error('Project not found');
    }

    const versionCount = await this.countVersions(project.project_group_id);
    if (versionCount <= 1) {
      throw new Error('Cannot delete the last version in a project group');
    }

    if (ctx && ctx.role !== 'admin') {
      getDb().query(`DELETE FROM projects WHERE id = ? AND tenant_id = ?`, [id, ctx.tenantId]);
    } else {
      getDb().query(`DELETE FROM projects WHERE id = ?`, [id]);
    }
    return Promise.resolve();
  }

  updateInvoiceSettings(id: number, data: UpdateInvoiceSettingsDTO): Promise<Project | null> {
    const sets: string[] = [];
    const values: (string | number | null)[] = [];

    if (data.discount_percentage !== undefined) {
      sets.push('discount_percentage = ?');
      values.push(data.discount_percentage);
    }
    if (data.discount_usd !== undefined) {
      sets.push('discount_usd = ?');
      values.push(data.discount_usd);
    }
    if (data.services_percentage !== undefined) {
      sets.push('services_percentage = ?');
      values.push(data.services_percentage);
    }
    if (data.services_usd !== undefined) {
      sets.push('services_usd = ?');
      values.push(data.services_usd);
    }
    if (data.local_currency_code !== undefined) {
      sets.push('local_currency_code = ?');
      values.push(data.local_currency_code);
    }
    if (data.exchange_rate !== undefined) {
      sets.push('exchange_rate = ?');
      values.push(data.exchange_rate);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE projects
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING ${PROJECT_COLUMNS}
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Project) : null);
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

  groupHasFloorplans(groupId: number): Promise<boolean> {
    const result = getDb().queryEntries(`
      SELECT COUNT(DISTINCT f.id) as count 
      FROM floorplans f
      JOIN projects p ON p.id = f.project_id
      WHERE p.project_group_id = ?
    `, [groupId]);
    return Promise.resolve((result[0] as Record<string, unknown>).count as number > 0);
  }

  countVersions(groupId: number): Promise<number> {
    const result = getDb().queryEntries(
      `SELECT COUNT(*) as count FROM projects WHERE project_group_id = ?`,
      [groupId]
    );
    return Promise.resolve((result[0] as Record<string, unknown>).count as number);
  }
}

export const projectRepository = new ProjectRepository();

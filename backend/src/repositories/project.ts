import { getDb } from '../config/database.ts';
import type { Project, CreateProjectDTO, UpdateProjectDTO, UpdateInvoiceSettingsDTO } from '../models/index.ts';
import type { TenantContext } from './user.ts';

const PROJECT_COLUMNS = `id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at,
             discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
             exchange_rate, tenant_id`;

/**
 * Project Repository
 * Handles all database operations for projects
 */
export class ProjectRepository {
  findAll(search?: string, ctx?: TenantContext): Promise<Project[]> {
    let sql = `SELECT ${PROJECT_COLUMNS} FROM projects`;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (ctx && ctx.role !== 'admin') {
      conditions.push('tenant_id = ?');
      params.push(ctx.tenantId);
    } else if (ctx && ctx.role === 'admin' && ctx.tenantId !== undefined) {
      // Distributor filtering by specific tenant (via ?tenantId query param)
      // Only apply if tenantId was explicitly set for filtering
    }

    if (search) {
      conditions.push('(name LIKE ? OR customer_name LIKE ?)');
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ` ORDER BY created_at DESC`;

    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as Project[]);
  }

  findAllByTenant(tenantId: number, search?: string): Promise<Project[]> {
    let sql = `SELECT ${PROJECT_COLUMNS} FROM projects WHERE tenant_id = ?`;
    const params: (string | number)[] = [tenantId];

    if (search) {
      sql += ` AND (name LIKE ? OR customer_name LIKE ?)`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }

    sql += ` ORDER BY created_at DESC`;
    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as Project[]);
  }

  findById(id: number, ctx?: TenantContext): Promise<Project | null> {
    let sql = `SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`;
    const params: (string | number)[] = [id];

    if (ctx && ctx.role !== 'admin') {
      sql += ` AND tenant_id = ?`;
      params.push(ctx.tenantId);
    }

    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Project) : null);
  }

  findByNameAndCustomer(name: string, customerName: string, tenantId: number, excludeId?: number): Promise<Project | null> {
    let sql = `SELECT ${PROJECT_COLUMNS} FROM projects WHERE name = ? AND customer_name = ? AND tenant_id = ?`;
    const params: (string | number)[] = [name, customerName, tenantId];

    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }

    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Project) : null);
  }

  create(data: CreateProjectDTO & { tenant_id: number }): Promise<Project> {
    try {
      const result = getDb().queryEntries(`
        INSERT INTO projects (name, status, customer_name, customer_email, customer_phone, customer_address, tenant_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        RETURNING ${PROJECT_COLUMNS}
      `, [
        data.name,
        data.status || 'active',
        data.customer_name,
        data.customer_email || null,
        data.customer_phone || null,
        data.customer_address || null,
        data.tenant_id
      ]);

      return Promise.resolve(result[0] as unknown as Project);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('UNIQUE constraint failed') ||
          message.includes('idx_projects_unique_name_customer')) {
        throw new Error(`A project with the name "${data.name}" already exists for customer "${data.customer_name}"`);
      }
      throw error;
    }
  }

  async update(id: number, data: UpdateProjectDTO, ctx?: TenantContext): Promise<Project | null> {
    const currentProject = await this.findById(id, ctx);
    if (!currentProject) {
      return null;
    }

    const newName = data.name !== undefined ? data.name : currentProject.name;
    const newCustomerName = data.customer_name !== undefined ? data.customer_name : currentProject.customer_name;

    if ((data.name !== undefined || data.customer_name !== undefined)) {
      const existing = await this.findByNameAndCustomer(newName, newCustomerName, currentProject.tenant_id, id);
      if (existing) {
        throw new Error(`A project with the name "${newName}" already exists for customer "${newCustomerName}"`);
      }
    }

    const sets: string[] = [];
    const values: (string | number | null | undefined)[] = [];

    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.status !== undefined) {
      sets.push('status = ?');
      values.push(data.status);
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
      if (message.includes('UNIQUE constraint failed') ||
          message.includes('idx_projects_unique_name_customer')) {
        throw new Error(`A project with the name "${newName}" already exists for customer "${newCustomerName}"`);
      }
      throw error;
    }
  }

  delete(id: number, ctx?: TenantContext): Promise<void> {
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
}

export const projectRepository = new ProjectRepository();

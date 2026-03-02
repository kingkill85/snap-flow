import { getDb } from '../config/database.ts';
import type { Project, CreateProjectDTO, UpdateProjectDTO, UpdateInvoiceSettingsDTO } from '../models/index.ts';

/**
 * Project Repository
 * Handles all database operations for projects
 */
export class ProjectRepository {
  findAll(search?: string): Promise<Project[]> {
    let sql = `
      SELECT id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at,
             discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
             exchange_rate
      FROM projects 
    `;
    const params: (string | number)[] = [];
    
    if (search) {
      sql += ` WHERE name LIKE ? OR customer_name LIKE ?`;
      const searchPattern = `%${search}%`;
      params.push(searchPattern, searchPattern);
    }
    
    sql += ` ORDER BY created_at DESC`;
    
    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as Project[]);
  }

  findById(id: number): Promise<Project | null> {
    const result = getDb().queryEntries(`
      SELECT id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at,
             discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
             exchange_rate
      FROM projects 
      WHERE id = ?
    `, [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Project) : null);
  }

  findByNameAndCustomer(name: string, customerName: string, excludeId?: number): Promise<Project | null> {
    let sql = `
      SELECT id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at,
             discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
             exchange_rate
      FROM projects 
      WHERE name = ? AND customer_name = ?
    `;
    const params: (string | number)[] = [name, customerName];
    
    if (excludeId) {
      sql += ' AND id != ?';
      params.push(excludeId);
    }
    
    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Project) : null);
  }

  create(data: CreateProjectDTO): Promise<Project> {
    try {
      const result = getDb().queryEntries(`
        INSERT INTO projects (name, status, customer_name, customer_email, customer_phone, customer_address) 
        VALUES (?, ?, ?, ?, ?, ?)
        RETURNING id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at,
                  discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
                  exchange_rate
      `, [
        data.name, 
        data.status || 'active',
        data.customer_name,
        data.customer_email || null,
        data.customer_phone || null,
        data.customer_address || null
      ]);
      
      return Promise.resolve(result[0] as unknown as Project);
    } catch (error: unknown) {
      // Check for unique constraint violation
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('UNIQUE constraint failed') ||
          message.includes('idx_projects_unique_name_customer')) {
        throw new Error(`A project with the name "${data.name}" already exists for customer "${data.customer_name}"`);
      }
      throw error;
    }
  }

  async update(id: number, data: UpdateProjectDTO): Promise<Project | null> {
    // Get current project to check for duplicates
    const currentProject = await this.findById(id);
    if (!currentProject) {
      return null;
    }

    // Check for duplicate if name or customer_name is being changed
    const newName = data.name !== undefined ? data.name : currentProject.name;
    const newCustomerName = data.customer_name !== undefined ? data.customer_name : currentProject.customer_name;
    
    if ((data.name !== undefined || data.customer_name !== undefined)) {
      const existing = await this.findByNameAndCustomer(newName, newCustomerName, id);
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

    if (sets.length === 0) {
      return currentProject;
    }

    values.push(id);

    try {
      const result = getDb().queryEntries(`
        UPDATE projects 
        SET ${sets.join(', ')} 
        WHERE id = ?
        RETURNING id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at,
                  discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
                  exchange_rate
      `, values);

      return result.length > 0 ? (result[0] as unknown as Project) : null;
    } catch (error: unknown) {
      // Check for unique constraint violation
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message.includes('UNIQUE constraint failed') ||
          message.includes('idx_projects_unique_name_customer')) {
        throw new Error(`A project with the name "${newName}" already exists for customer "${newCustomerName}"`);
      }
      throw error;
    }
  }

  delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM projects WHERE id = ?`, [id]);
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
      RETURNING id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at,
                discount_percentage, discount_usd, services_percentage, services_usd, local_currency_code,
                exchange_rate
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Project) : null);
  }
}

export const projectRepository = new ProjectRepository();

import { getDb } from '../config/database.ts';
import type { Project, CreateProjectDTO, UpdateProjectDTO } from '../models/index.ts';

/**
 * Project Repository
 * Handles all database operations for projects
 */
export class ProjectRepository {
  async findAll(): Promise<Project[]> {
    const result = getDb().queryEntries(`
      SELECT id, customer_id, name, status, created_at 
      FROM projects 
      ORDER BY created_at DESC
    `);
    return result as unknown as Project[];
  }

  async findById(id: number): Promise<Project | null> {
    const result = getDb().queryEntries(`
      SELECT id, customer_id, name, status, created_at 
      FROM projects 
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as Project) : null;
  }

  async findByCustomer(customerId: number): Promise<Project[]> {
    const result = getDb().queryEntries(`
      SELECT id, customer_id, name, status, created_at 
      FROM projects 
      WHERE customer_id = ?
      ORDER BY created_at DESC
    `, [customerId]);
    return result as unknown as Project[];
  }

  async create(data: CreateProjectDTO): Promise<Project> {
    const result = getDb().queryEntries(`
      INSERT INTO projects (customer_id, name, status) 
      VALUES (?, ?, ?)
      RETURNING id, customer_id, name, status, created_at
    `, [data.customer_id, data.name, data.status || 'active']);
    
    return result[0] as unknown as Project;
  }

  async update(id: number, data: UpdateProjectDTO): Promise<Project | null> {
    const sets: string[] = [];
    const values: (string | number | undefined)[] = [];

    if (data.customer_id !== undefined) {
      sets.push('customer_id = ?');
      values.push(data.customer_id);
    }
    if (data.name !== undefined) {
      sets.push('name = ?');
      values.push(data.name);
    }
    if (data.status !== undefined) {
      sets.push('status = ?');
      values.push(data.status);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id);

    const result = getDb().queryEntries(`
      UPDATE projects 
      SET ${sets.join(', ')} 
      WHERE id = ?
      RETURNING id, customer_id, name, status, created_at
    `, values);

    return result.length > 0 ? (result[0] as unknown as Project) : null;
  }

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM projects WHERE id = ?`, [id]);
  }
}

export const projectRepository = new ProjectRepository();

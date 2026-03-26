import { getDb } from '../config/database.ts';
import type { Tenant, CreateTenantDTO, UpdateTenantDTO } from '../models/index.ts';

export class TenantRepository {
  findAll(): Promise<Tenant[]> {
    const result = getDb().queryEntries('SELECT * FROM tenants ORDER BY name');
    return Promise.resolve(result as unknown as Tenant[]);
  }

  findById(id: number): Promise<Tenant | null> {
    const result = getDb().queryEntries('SELECT * FROM tenants WHERE id = ?', [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Tenant) : null);
  }

  findByName(name: string): Promise<Tenant | null> {
    const result = getDb().queryEntries('SELECT * FROM tenants WHERE name = ?', [name]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Tenant) : null);
  }

  findDistributor(): Promise<Tenant | null> {
    const result = getDb().queryEntries('SELECT * FROM tenants WHERE is_distributor = 1');
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as Tenant) : null);
  }

  create(data: CreateTenantDTO): Promise<Tenant> {
    const result = getDb().queryEntries(
      'INSERT INTO tenants (name, is_distributor) VALUES (?, ?) RETURNING *',
      [data.name, data.is_distributor ?? 0]
    );
    return Promise.resolve(result[0] as unknown as Tenant);
  }

  update(id: number, data: UpdateTenantDTO): Promise<Tenant> {
    const fields: string[] = [];
    const values: (string | number | boolean)[] = [];

    if (data.name !== undefined) {
      fields.push('name = ?');
      values.push(data.name);
    }
    if (data.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(data.is_active);
    }
    if (data.is_distributor !== undefined) {
      fields.push('is_distributor = ?');
      values.push(data.is_distributor);
    }

    if (fields.length > 0) {
      values.push(id);
      getDb().query(
        `UPDATE tenants SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
    }

    const result = getDb().queryEntries('SELECT * FROM tenants WHERE id = ?', [id]);
    return Promise.resolve(result[0] as unknown as Tenant);
  }

  delete(id: number): Promise<void> {
    getDb().query('DELETE FROM tenants WHERE id = ?', [id]);
    return Promise.resolve();
  }
}

export const tenantRepository = new TenantRepository();

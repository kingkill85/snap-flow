import { getDb } from '../config/database.ts';
import type { User, CreateUserDTO, UpdateUserDTO, UserRole } from '../models/index.ts';

export interface TenantContext {
  tenantId: number;
  role: UserRole;
}

/**
 * User Repository
 * Handles all database operations for users
 */
export class UserRepository {
  findAll(ctx?: TenantContext): Promise<User[]> {
    let sql = `SELECT id, email, full_name, role, tenant_id, is_active, created_at FROM users`;
    const params: (string | number)[] = [];

    if (ctx && ctx.role !== 'admin') {
      sql += ` WHERE tenant_id = ?`;
      params.push(ctx.tenantId);
    }

    sql += ` ORDER BY created_at DESC`;
    const result = getDb().queryEntries(sql, params);
    return Promise.resolve(result as unknown as User[]);
  }

  findAllByTenant(tenantId: number): Promise<User[]> {
    const result = getDb().queryEntries(`
      SELECT id, email, full_name, role, tenant_id, is_active, created_at
      FROM users WHERE tenant_id = ? ORDER BY created_at DESC
    `, [tenantId]);
    return Promise.resolve(result as unknown as User[]);
  }

  findById(id: number): Promise<User | null> {
    const result = getDb().queryEntries(`
      SELECT id, email, full_name, role, tenant_id, is_active, created_at
      FROM users
      WHERE id = ?
    `, [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as User) : null);
  }

  /**
   * Find user by email. Returns full user record including password_hash.
   * Used for auth verification only — callers must NOT return password_hash to client.
   */
  findByEmail(email: string): Promise<User | null> {
    const result = getDb().queryEntries(`
      SELECT * FROM users WHERE email = ?
    `, [email]);
    return Promise.resolve(result.length > 0 ? (result[0] as unknown as User) : null);
  }

  create(data: CreateUserDTO & { password_hash: string }): Promise<User> {
    const result = getDb().queryEntries(`
      INSERT INTO users (email, full_name, password_hash, role, tenant_id)
      VALUES (?, ?, ?, ?, ?)
      RETURNING id, email, full_name, role, tenant_id, is_active, created_at
    `, [data.email, data.full_name || null, data.password_hash, data.role || 'user', data.tenant_id]);

    return Promise.resolve(result[0] as unknown as User);
  }

  update(id: number, data: UpdateUserDTO): Promise<User | null> {
    const sets: string[] = [];
    const values: (string | number | undefined | null)[] = [];

    if (data.email !== undefined) {
      sets.push('email = ?');
      values.push(data.email);
    }
    if (data.full_name !== undefined) {
      sets.push('full_name = ?');
      values.push(data.full_name);
    }
    if (data.password_hash !== undefined) {
      sets.push('password_hash = ?');
      values.push(data.password_hash);
    }
    if (data.role !== undefined) {
      sets.push('role = ?');
      values.push(data.role);
    }
    if (data.tenant_id !== undefined) {
      sets.push('tenant_id = ?');
      values.push(data.tenant_id);
    }
    if (data.is_active !== undefined) {
      sets.push('is_active = ?');
      values.push(data.is_active);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id.toString());

    const result = getDb().queryEntries(`
      UPDATE users
      SET ${sets.join(', ')}
      WHERE id = ?
      RETURNING id, email, full_name, role, tenant_id, is_active, created_at
    `, values);

    return Promise.resolve(result.length > 0 ? (result[0] as unknown as User) : null);
  }

  delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM users WHERE id = ?`, [id]);
    return Promise.resolve();
  }
}

export const userRepository = new UserRepository();

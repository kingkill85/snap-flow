import { db } from '../config/database.ts';
import type { User, CreateUserDTO, UpdateUserDTO } from '../models/index.ts';

/**
 * User Repository
 * Handles all database operations for users
 */
export class UserRepository {
  async findAll(): Promise<User[]> {
    const result = db.queryEntries(`
      SELECT id, email, role, created_at 
      FROM users 
      ORDER BY created_at DESC
    `);
    return result as unknown as User[];
  }

  async findById(id: number): Promise<User | null> {
    const result = db.queryEntries(`
      SELECT id, email, role, created_at 
      FROM users 
      WHERE id = ?
    `, [id]);
    return result.length > 0 ? (result[0] as unknown as User) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = db.queryEntries(`
      SELECT * FROM users WHERE email = ?
    `, [email]);
    return result.length > 0 ? (result[0] as unknown as User) : null;
  }

  async create(data: CreateUserDTO & { password_hash: string }): Promise<User> {
    const result = db.queryEntries(`
      INSERT INTO users (email, password_hash, role) 
      VALUES (?, ?, ?)
      RETURNING id, email, role, created_at
    `, [data.email, data.password_hash, data.role || 'user']);
    
    return result[0] as unknown as User;
  }

  async update(id: number, data: UpdateUserDTO): Promise<User | null> {
    const sets: string[] = [];
    const values: (string | undefined)[] = [];

    if (data.email) {
      sets.push('email = ?');
      values.push(data.email);
    }
    if (data.password_hash) {
      sets.push('password_hash = ?');
      values.push(data.password_hash);
    }
    if (data.role) {
      sets.push('role = ?');
      values.push(data.role);
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    values.push(id.toString());

    const result = db.queryEntries(`
      UPDATE users 
      SET ${sets.join(', ')} 
      WHERE id = ?
      RETURNING id, email, role, created_at
    `, values);

    return result.length > 0 ? (result[0] as unknown as User) : null;
  }

  async delete(id: number): Promise<void> {
    db.query(`DELETE FROM users WHERE id = ?`, [id]);
  }
}

export const userRepository = new UserRepository();

import { getDb } from '../config/database.ts';

/**
 * Base Repository class
 * Provides common CRUD operations
 */
export abstract class BaseRepository<T, CreateDTO, UpdateDTO> {
  protected abstract tableName: string;

  async findAll(): Promise<T[]> {
    const result = getDb().query(`SELECT * FROM ${this.tableName}`);
    return result as T[];
  }

  async findById(id: number): Promise<T | null> {
    const result = getDb().query(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
    return result.length > 0 ? (result[0] as T) : null;
  }

  abstract create(data: CreateDTO): Promise<T>;
  abstract update(id: number, data: UpdateDTO): Promise<T>;

  async delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
  }
}

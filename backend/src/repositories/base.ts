import { getDb } from '../config/database.ts';

/**
 * Base Repository class
 * Provides common CRUD operations
 */
export abstract class BaseRepository<T, CreateDTO, UpdateDTO> {
  protected abstract tableName: string;

  findAll(): Promise<T[]> {
    const result = getDb().query(`SELECT * FROM ${this.tableName}`);
    return Promise.resolve(result as T[]);
  }

  findById(id: number): Promise<T | null> {
    const result = getDb().query(`SELECT * FROM ${this.tableName} WHERE id = ?`, [id]);
    return Promise.resolve(result.length > 0 ? (result[0] as T) : null);
  }

  abstract create(data: CreateDTO): Promise<T>;
  abstract update(id: number, data: UpdateDTO): Promise<T>;

  delete(id: number): Promise<void> {
    getDb().query(`DELETE FROM ${this.tableName} WHERE id = ?`, [id]);
    return Promise.resolve();
  }
}

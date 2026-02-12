import { DB } from 'sqlite';
import { env } from './env.ts';

/**
 * Database connection singleton
 */
class Database {
  private static instance: DB | null = null;

  static getInstance(): DB {
    if (!Database.instance) {
      Database.instance = new DB(env.DATABASE_URL);
      console.log(`📦 Database connected: ${env.DATABASE_URL}`);
    }
    return Database.instance;
  }

  static close(): void {
    if (Database.instance) {
      Database.instance.close();
      Database.instance = null;
      console.log('📦 Database connection closed');
    }
  }
}

export default Database;
export const db = Database.getInstance();

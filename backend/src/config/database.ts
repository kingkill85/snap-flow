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

  /**
   * Initialize with an in-memory database (for testing)
   */
  static initInMemory(): DB {
    if (Database.instance) {
      Database.instance.close();
    }
    Database.instance = new DB(':memory:');
    console.log('📦 Database connected: :memory:');
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

// For tests to provide a custom database instance
let testDb: DB | null = null;

export function setTestDb(db: DB | null): void {
  testDb = db;
}

// Export the database instance - uses testDb if set, otherwise creates default
export function getDb(): DB {
  if (testDb) {
    return testDb;
  }
  return Database.getInstance();
}

// Keep backward compatibility
export const db = Database.getInstance();

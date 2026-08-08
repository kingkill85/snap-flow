import { DB } from "sqlite";
import { env } from "./env.ts";

/**
 * Database connection singleton
 */
class Database {
  private static instance: DB | null = null;

  static getInstance(): DB {
    if (!Database.instance) {
      Database.instance = new DB(env.DATABASE_URL);
      // Enable foreign key constraints (required for CASCADE to work)
      Database.instance.query("PRAGMA foreign_keys = ON");
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
    Database.instance = new DB(":memory:");
    // Enable foreign key constraints (required for CASCADE to work)
    Database.instance.query("PRAGMA foreign_keys = ON");
    console.log("📦 Database connected: :memory:");
    return Database.instance;
  }

  static close(): void {
    if (Database.instance) {
      Database.instance.close();
      Database.instance = null;
      console.log("📦 Database connection closed");
    }
  }
}

export default Database;

// For tests to provide a custom database instance
let testDb: DB | null = null;

export function setTestDb(db: DB | null): void {
  testDb = db;
}

export function hasTestDb(): boolean {
  return testDb !== null;
}

// Export the database instance - uses testDb if set, otherwise creates default
export function getDb(): DB {
  if (testDb) {
    return testDb;
  }
  return Database.getInstance();
}

/**
 * Execute a synchronous function inside a database transaction.
 * Commits on success, rolls back on error.
 */
export function withTransaction<T>(fn: () => T): T {
  const db = getDb();
  db.query("BEGIN");
  try {
    const result = fn();
    db.query("COMMIT");
    return result;
  } catch (error) {
    db.query("ROLLBACK");
    throw error;
  }
}

/**
 * Execute an async function inside a database transaction.
 * Commits on success, rolls back on error.
 */
export async function withTransactionAsync<T>(
  fn: () => Promise<T>,
): Promise<T> {
  const db = getDb();
  db.query("BEGIN");
  try {
    const result = await fn();
    db.query("COMMIT");
    return result;
  } catch (error) {
    db.query("ROLLBACK");
    throw error;
  }
}

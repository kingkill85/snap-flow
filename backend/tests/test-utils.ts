/**
 * Test utilities for backend tests
 */
import Database, { setTestDb, getDb } from '../src/config/database.ts';
import { runMigrations } from '../src/scripts/migrate.ts';
import { clearRateLimitStore } from '../src/middleware/rate-limit.ts';

let isTestDatabaseInitialized = false;

/**
 * Setup test database with in-memory storage and migrations
 */
export async function setupTestDatabase(): Promise<void> {
  if (!isTestDatabaseInitialized) {
    // Initialize in-memory database
    const memDb = Database.initInMemory();
    
    // Set it as the global db instance
    setTestDb(memDb);
    
    // Run migrations
    await runMigrations();
    
    isTestDatabaseInitialized = true;
    console.log('✅ Test database initialized');
  }
}

/**
 * Clear all data from tables and rate limits (for test isolation)
 */
export function clearDatabase(): void {
  // Clear rate limits to prevent tests from hitting rate limits
  clearRateLimitStore();
  
  const dbInstance = getDb();
  
  // Disable foreign key checks temporarily
  dbInstance.query('PRAGMA foreign_keys = OFF');
  
  // Get all tables
  const tables = dbInstance.queryEntries<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
  );
  
  // Delete from each table
  for (const table of tables) {
    try {
      dbInstance.query(`DELETE FROM ${table.name}`);
    } catch {
      // Ignore errors (might be view or other non-deletable object)
    }
  }
  
  // Re-enable foreign key checks
  dbInstance.query('PRAGMA foreign_keys = ON');
}

/**
 * Teardown test database
 */
export function teardownTestDatabase(): void {
  Database.close();
  isTestDatabaseInitialized = false;
}

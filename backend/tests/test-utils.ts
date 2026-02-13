/**
 * Test utilities for backend tests
 */
import { db } from '../src/config/database.ts';

/**
 * Clear all data from tables (for test isolation)
 */
export function clearDatabase(): void {
  // Disable foreign key checks temporarily
  db.query('PRAGMA foreign_keys = OFF');
  
  // Get all tables
  const tables = db.queryEntries<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'"
  );
  
  // Delete from each table
  for (const table of tables) {
    try {
      db.query(`DELETE FROM ${table.name}`);
    } catch {
      // Ignore errors (might be view or other non-deletable object)
    }
  }
  
  // Re-enable foreign key checks
  db.query('PRAGMA foreign_keys = ON');
}

/**
 * Setup test database with migrations
 */
export async function setupTestDatabase(): Promise<void> {
  // Migrations should already be run in the main database file
  // This just ensures we're connected
  console.log('Test database ready');
}

/**
 * Teardown test database
 */
export function teardownTestDatabase(): void {
  // Cleanup if needed
}

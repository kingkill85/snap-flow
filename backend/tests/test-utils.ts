/**
 * Test utilities for backend tests
 */
import Database, {
  getDb,
  hasTestDb,
  setTestDb,
} from "../src/config/database.ts";
import { runMigrations } from "../src/scripts/migrate.ts";
import { clearRateLimitStore } from "../src/middleware/rate-limit.ts";
import { env } from "../src/config/env.ts";
import { assertIsolatedTestUploadRoot } from "./test-runtime-bootstrap.ts";

let isTestDatabaseInitialized = false;

/**
 * Clean up uploaded test files from disk
 * Call this after tests that create files to prevent orphaned test files
 */
export async function cleanupTestUploads(): Promise<void> {
  assertIsolatedTestUploadRoot(env.UPLOAD_DIR);
  await Deno.remove(env.UPLOAD_DIR, { recursive: true }).catch((error) => {
    if (!(error instanceof Deno.errors.NotFound)) throw error;
  });
  await Deno.mkdir(env.UPLOAD_DIR, { recursive: true });
}

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
    console.log("✅ Test database initialized");
  }

  assertTestDatabase();
}

export function assertTestDatabase(): void {
  if (!hasTestDb()) {
    throw new Error("Refusing to run tests without an injected test database");
  }
  const databases = getDb().queryEntries<{ file: string }>(
    "PRAGMA database_list",
  );
  const mainDatabase = databases.find((database) =>
    database.file !== undefined
  );
  if (!mainDatabase || mainDatabase.file !== "") {
    throw new Error(
      `Refusing to run tests against non-memory database: ${
        mainDatabase?.file ?? "unknown"
      }`,
    );
  }
}

/**
 * Clear all data from tables and rate limits (for test isolation)
 * Does NOT clean up uploaded files - use cleanupTestUploadsAfterSuite() after all tests
 */
export function clearDatabase(): void {
  // Clear rate limits to prevent tests from hitting rate limits
  clearRateLimitStore();

  // Guard the destructive reset boundary itself. Never let a lost test
  // injection silently fall back to an environment-selected database.
  assertTestDatabase();

  const dbInstance = getDb();

  // Disable foreign key checks temporarily
  dbInstance.query("PRAGMA foreign_keys = OFF");

  // Get all tables
  const tables = dbInstance.queryEntries<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'",
  );

  // Delete from each table
  for (const table of tables) {
    try {
      dbInstance.query(`DELETE FROM ${table.name}`);
    } catch (error) {
      throw new Error(
        `Failed to reset test table ${table.name}: ${String(error)}`,
      );
    }
  }

  dbInstance.query("DELETE FROM sqlite_sequence");

  // Re-enable foreign key checks
  dbInstance.query("PRAGMA foreign_keys = ON");

  // Re-seed the distributor tenant (required for foreign key references)
  dbInstance.query(
    "INSERT INTO tenants (id, name, is_distributor, is_active) VALUES (1, 'Distributor', 1, 1)",
  );
}

/**
 * Teardown test database
 */
export function teardownTestDatabase(): void {
  setTestDb(null);
  Database.close();
  isTestDatabaseInitialized = false;
}

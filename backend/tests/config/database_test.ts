import { assertEquals, assertExists } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';

// Setup test database before all tests
await setupTestDatabase();

// Import getDb function after test database is set up
const { getDb } = await import('../../src/config/database.ts');

Deno.test('Database - connection established', () => {
  // If we can query without error, connection is good
  const result = getDb().query('SELECT 1');
  assertEquals(result.length, 1);
});

Deno.test('Database - migrations table exists', () => {
  const result = getDb().queryEntries(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations'"
  );
  assertEquals(result.length, 1);
});

Deno.test('Database - users table has correct structure', () => {
  const columns = getDb().queryEntries<{ name: string; type: string }>(
    "PRAGMA table_info(users)"
  );
  
  const columnNames = columns.map(c => c.name);
  
  assertEquals(columnNames.includes('id'), true);
  assertEquals(columnNames.includes('email'), true);
  assertEquals(columnNames.includes('password_hash'), true);
  assertEquals(columnNames.includes('role'), true);
  assertEquals(columnNames.includes('created_at'), true);
});

Deno.test('Database - categories table has correct structure', () => {
  const columns = getDb().queryEntries<{ name: string }>(
    "PRAGMA table_info(categories)"
  );
  
  const columnNames = columns.map(c => c.name);
  
  assertEquals(columnNames.includes('id'), true);
  assertEquals(columnNames.includes('name'), true);
  assertEquals(columnNames.includes('sort_order'), true);
});

Deno.test('Database - items table has correct structure', () => {
  const columns = getDb().queryEntries<{ name: string }>(
    "PRAGMA table_info(items)"
  );
  
  const columnNames = columns.map(c => c.name);
  
  assertEquals(columnNames.includes('id'), true);
  assertEquals(columnNames.includes('category_id'), true);
  assertEquals(columnNames.includes('name'), true);
  assertEquals(columnNames.includes('description'), true);
  assertEquals(columnNames.includes('model_number'), true);
  assertEquals(columnNames.includes('dimensions'), true);
  assertEquals(columnNames.includes('price'), true);
  assertEquals(columnNames.includes('image_path'), true);
  assertEquals(columnNames.includes('created_at'), true);
});

Deno.test('Database - customers table has correct structure', () => {
  const columns = getDb().queryEntries<{ name: string }>(
    "PRAGMA table_info(customers)"
  );
  
  const columnNames = columns.map(c => c.name);
  
  assertEquals(columnNames.includes('id'), true);
  assertEquals(columnNames.includes('name'), true);
  assertEquals(columnNames.includes('email'), true);
  assertEquals(columnNames.includes('phone'), true);
  assertEquals(columnNames.includes('address'), true);
  assertEquals(columnNames.includes('created_by'), true);
  assertEquals(columnNames.includes('created_at'), true);
});

Deno.test('Database - projects table has correct structure', () => {
  const columns = getDb().queryEntries<{ name: string }>(
    "PRAGMA table_info(projects)"
  );
  
  const columnNames = columns.map(c => c.name);
  
  assertEquals(columnNames.includes('id'), true);
  assertEquals(columnNames.includes('customer_id'), true);
  assertEquals(columnNames.includes('name'), true);
  assertEquals(columnNames.includes('status'), true);
  assertEquals(columnNames.includes('created_at'), true);
});

Deno.test('Database - floorplans table has correct structure', () => {
  const columns = getDb().queryEntries<{ name: string }>(
    "PRAGMA table_info(floorplans)"
  );
  
  const columnNames = columns.map(c => c.name);
  
  assertEquals(columnNames.includes('id'), true);
  assertEquals(columnNames.includes('project_id'), true);
  assertEquals(columnNames.includes('name'), true);
  assertEquals(columnNames.includes('image_path'), true);
  assertEquals(columnNames.includes('sort_order'), true);
});

Deno.test('Database - placements table has correct structure', () => {
  const columns = getDb().queryEntries<{ name: string }>(
    "PRAGMA table_info(placements)"
  );
  
  const columnNames = columns.map(c => c.name);
  
  assertEquals(columnNames.includes('id'), true);
  assertEquals(columnNames.includes('floorplan_id'), true);
  assertEquals(columnNames.includes('item_id'), true);
  assertEquals(columnNames.includes('x'), true);
  assertEquals(columnNames.includes('y'), true);
  assertEquals(columnNames.includes('width'), true);
  assertEquals(columnNames.includes('height'), true);
  assertEquals(columnNames.includes('created_at'), true);
});

Deno.test('Database - foreign key constraints exist', () => {
  // Check that foreign keys are enabled
  const result = getDb().query('PRAGMA foreign_keys');
  assertEquals(result[0][0], 1);
});

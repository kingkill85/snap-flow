import { assertEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { getDb, withTransaction, withTransactionAsync } from '../../src/config/database.ts';

await setupTestDatabase();

Deno.test('withTransaction - commits on success', () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('test', 1)");

  withTransaction(() => {
    db.query("UPDATE categories SET name = 'updated' WHERE name = 'test'");
  });

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'updated'");
  assertEquals(result.length, 1);
});

Deno.test('withTransaction - rolls back on error', () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('original', 1)");

  try {
    withTransaction(() => {
      db.query("UPDATE categories SET name = 'changed' WHERE name = 'original'");
      throw new Error('intentional');
    });
  } catch { /* expected */ }

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'original'");
  assertEquals(result.length, 1);
  const changed = db.queryEntries("SELECT name FROM categories WHERE name = 'changed'");
  assertEquals(changed.length, 0);
});

Deno.test('withTransactionAsync - rolls back on async error', async () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO categories (name, sort_order) VALUES ('asynctest', 1)");

  try {
    await withTransactionAsync(async () => {
      db.query("UPDATE categories SET name = 'asyncchanged' WHERE name = 'asynctest'");
      await Promise.resolve();
      throw new Error('intentional');
    });
  } catch { /* expected */ }

  const result = db.queryEntries("SELECT name FROM categories WHERE name = 'asynctest'");
  assertEquals(result.length, 1);
});

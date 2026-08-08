import { assertEquals, assertThrows } from '@std/assert';
import { env } from '../src/config/env.ts';
import { getDb } from '../src/config/database.ts';
import {
  assertTestDatabase,
  clearDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from './test-utils.ts';
import { categoryRepository } from '../src/repositories/category.ts';

await setupTestDatabase();

Deno.test('test runtime uses tracked environment and an injected memory database', () => {
  assertEquals(env.NODE_ENV, 'test');
  assertEquals(env.DATABASE_URL, ':memory:');
  assertEquals(env.UPLOAD_DIR, `${Deno.cwd()}/uploads`);
  assertTestDatabase();
  assertEquals(getDb().queryEntries<{ file: string }>('PRAGMA database_list')[0].file, '');
});

Deno.test('test reset clears rows and sequence state deterministically', async () => {
  clearDatabase();
  const first = await categoryRepository.create({ name: 'First' });
  assertEquals(first.id, 1);

  clearDatabase();
  const afterReset = await categoryRepository.create({ name: 'After Reset' });
  assertEquals(afterReset.id, 1);
});

Deno.test('test teardown clears injected singleton state before reinitialization', async () => {
  teardownTestDatabase();
  assertThrows(() => assertTestDatabase(), Error, 'without an injected test database');

  await setupTestDatabase();
  assertTestDatabase();
  clearDatabase();
});

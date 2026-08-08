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
import { DB } from 'sqlite';

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
  assertThrows(() => clearDatabase(), Error, 'without an injected test database');

  await setupTestDatabase();
  assertTestDatabase();
  clearDatabase();
});

Deno.test('conflicting cwd .env and a pre-bound singleton cannot leak external database state', async () => {
  const tempDir = await Deno.makeTempDir({ prefix: 'snapflow-test-runtime-' });
  const externalDatabasePath = `${tempDir}/external.sqlite`;
  const externalDb = new DB(externalDatabasePath);
  externalDb.query('CREATE TABLE sentinel (value TEXT NOT NULL)');
  externalDb.query("INSERT INTO sentinel (value) VALUES ('preserve-me')");
  externalDb.close();
  await Deno.writeTextFile(
    `${tempDir}/.env`,
    `DATABASE_URL=${externalDatabasePath}\nJWT_SECRET=test-secret-key-for-tests-32-chars\nNODE_ENV=test\n`,
  );

  const databaseModule = new URL('../src/config/database.ts', import.meta.url).href;
  const denoConfig = new URL('../deno.json', import.meta.url).pathname;
  const code = `
    const database = await import(${JSON.stringify(databaseModule)});
    database.getDb();
    const injected = database.default.initInMemory();
    database.setTestDb(injected);
    const active = database.getDb().queryEntries('PRAGMA database_list');
    if (active[0]?.file !== '') throw new Error('expected injected memory database');
  `;

  try {
    const child = await new Deno.Command(Deno.execPath(), {
      args: ['eval', '--config', denoConfig, code],
      cwd: tempDir,
      env: {
        DATABASE_URL: '',
        UPLOAD_DIR: '',
        NODE_ENV: '',
        JWT_SECRET: '',
      },
    }).output();
    assertEquals(child.success, true, new TextDecoder().decode(child.stderr));

    const preservedDb = new DB(externalDatabasePath);
    const sentinel = preservedDb.queryEntries<{ value: string }>('SELECT value FROM sentinel');
    preservedDb.close();
    assertEquals(sentinel, [{ value: 'preserve-me' }]);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test('Excel sync regression is equivalent in isolated and ordered execution', async () => {
  const backendRoot = new URL('../', import.meta.url).pathname;
  const common = {
    cwd: backendRoot,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: ':memory:',
      UPLOAD_DIR: './uploads',
      JWT_SECRET: 'test-secret-key-for-tests-32-chars',
    },
  };
  const isolated = await new Deno.Command(Deno.execPath(), {
    ...common,
    args: ['test', '--allow-all', 'tests/services/excel-sync_test.ts', '--filter', 'import only deactivates'],
  }).output();
  const ordered = await new Deno.Command(Deno.execPath(), {
    ...common,
    args: ['test', '--allow-all', 'tests/services/excel-sync_test.ts'],
  }).output();

  assertEquals(isolated.success, true, new TextDecoder().decode(isolated.stderr));
  assertEquals(ordered.success, true, new TextDecoder().decode(ordered.stderr));
});

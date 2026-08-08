import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { env } from "../src/config/env.ts";
import { getDb } from "../src/config/database.ts";
import {
  assertTestDatabase,
  clearDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from "./test-utils.ts";
import { categoryRepository } from "../src/repositories/category.ts";
import { DB } from "sqlite";
import {
  cleanupTestUploadRoot,
  createTestUploadRoot,
  getNormalUploadRoot,
} from "./test-runtime-bootstrap.ts";

await setupTestDatabase();

Deno.test("test runtime uses tracked environment and an injected memory database", () => {
  assertEquals(env.NODE_ENV, "test");
  assertEquals(env.DATABASE_URL, ":memory:");
  assertEquals(env.UPLOAD_DIR.startsWith("/tmp/snapflow-backend-tests-"), true);
  assertEquals(env.UPLOAD_DIR.startsWith(getNormalUploadRoot()), false);
  assertTestDatabase();
  assertEquals(
    getDb().queryEntries<{ file: string }>("PRAGMA database_list")[0].file,
    "",
  );
});

Deno.test("test upload roots are unique and cleanup preserves normal upload sentinel", async () => {
  const normalRoot = getNormalUploadRoot();
  const sentinelPath = `${normalRoot}/issue84-normal-upload-sentinel`;
  const firstRoot = await createTestUploadRoot();
  const secondRoot = await createTestUploadRoot();
  await Deno.mkdir(normalRoot, { recursive: true });
  await Deno.writeTextFile(sentinelPath, "preserve-me");
  await Deno.writeTextFile(`${firstRoot}/isolated-test-file`, "temporary");

  try {
    assertEquals(firstRoot === secondRoot, false);
    await cleanupTestUploadRoot(firstRoot);
    assertEquals(await Deno.readTextFile(sentinelPath), "preserve-me");
    await assertRejects(() => Deno.stat(firstRoot), Deno.errors.NotFound);
  } finally {
    await cleanupTestUploadRoot(secondRoot).catch(() => {});
    await Deno.remove(sentinelPath).catch(() => {});
  }
});

Deno.test("test reset clears rows and sequence state deterministically", async () => {
  clearDatabase();
  const db = getDb();
  db.query("INSERT INTO item_types (name, abbreviation) VALUES ('Type', 'T')");
  await categoryRepository.create({ name: "First" });
  db.query(
    "INSERT INTO items (category_id, type_id, name, base_model_number) VALUES (1, 1, 'Item', 'MODEL')",
  );
  db.query(
    "INSERT INTO item_variants (item_id, style_name, price) VALUES (1, 'Style', 10)",
  );
  db.query(
    "INSERT INTO app_settings (key, value) VALUES ('test-setting', 'value')",
  );

  clearDatabase();
  const tables = db.queryEntries<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'",
  );
  for (const table of tables) {
    const count = db.queryEntries<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${table.name}`,
    )[0].count;
    assertEquals(
      count,
      table.name === "tenants" ? 1 : 0,
      `unexpected reset rows in ${table.name}`,
    );
  }

  const afterReset = await categoryRepository.create({ name: "After Reset" });
  const typeAfterReset = db.queryEntries<{ id: number }>(
    "INSERT INTO item_types (name, abbreviation) VALUES ('After', 'A') RETURNING id",
  )[0];
  assertEquals(afterReset.id, 1);
  assertEquals(typeAfterReset.id, 1);
});

Deno.test("test teardown clears injected singleton state before reinitialization", async () => {
  teardownTestDatabase();
  assertThrows(
    () => assertTestDatabase(),
    Error,
    "without an injected test database",
  );
  assertThrows(
    () => clearDatabase(),
    Error,
    "without an injected test database",
  );

  await setupTestDatabase();
  assertTestDatabase();
  clearDatabase();
});

Deno.test("normal bootstrap ignores hostile cwd .env without resolving its external database", async () => {
  const tempDir = await Deno.makeTempDir({ prefix: "snapflow-test-runtime-" });
  const externalDatabasePath = `${tempDir}/external.sqlite`;
  const externalDb = new DB(externalDatabasePath);
  externalDb.query("CREATE TABLE sentinel (value TEXT NOT NULL)");
  externalDb.query("INSERT INTO sentinel (value) VALUES ('preserve-me')");
  externalDb.close();
  await Deno.writeTextFile(
    `${tempDir}/.env`,
    `DATABASE_URL=${externalDatabasePath}\nJWT_SECRET=test-secret-key-for-tests-32-chars\nNODE_ENV=test\n`,
  );

  const databaseModule =
    new URL("../src/config/database.ts", import.meta.url).href;
  const testUtilsModule = new URL("./test-utils.ts", import.meta.url).href;
  const categoryModule =
    new URL("../src/repositories/category.ts", import.meta.url).href;
  const denoConfig = new URL("../deno.json", import.meta.url).pathname;
  const code = `
    const database = await import(${JSON.stringify(databaseModule)});
    const testUtils = await import(${JSON.stringify(testUtilsModule)});
    let resetRejected = false;
    try { testUtils.clearDatabase(); } catch { resetRejected = true; }
    if (!resetRejected) throw new Error('destructive reset did not fail closed');
    await testUtils.setupTestDatabase();
    const categories = await import(${JSON.stringify(categoryModule)});
    await categories.categoryRepository.create({ name: 'Isolated' });
    const active = database.getDb().queryEntries('PRAGMA database_list');
    if (active[0]?.file !== '') throw new Error('expected injected memory database');
    Deno.exit(0);
  `;

  try {
    const child = await new Deno.Command(Deno.execPath(), {
      args: ["eval", "--config", denoConfig, code],
      cwd: tempDir,
      env: {
        DATABASE_URL: "",
        UPLOAD_DIR: "",
        NODE_ENV: "",
        JWT_SECRET: "",
      },
    }).output();
    assertEquals(child.success, true, new TextDecoder().decode(child.stderr));

    const preservedDb = new DB(externalDatabasePath);
    const sentinel = preservedDb.queryEntries<{ value: string }>(
      "SELECT value FROM sentinel",
    );
    const schema = preservedDb.queryEntries<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );
    preservedDb.close();
    assertEquals(sentinel, [{ value: "preserve-me" }]);
    assertEquals(schema, [{ name: "sentinel" }]);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("Excel sync regression is equivalent in isolated and ordered execution", async () => {
  const backendRoot = new URL("../", import.meta.url).pathname;
  const common = {
    cwd: backendRoot,
  };
  const isolated = await new Deno.Command(Deno.execPath(), {
    ...common,
    args: [
      "task",
      "test",
      "tests/services/excel-sync_test.ts",
      "--filter",
      "import only deactivates",
    ],
  }).output();
  const ordered = await new Deno.Command(Deno.execPath(), {
    ...common,
    args: ["task", "test", "tests/services/excel-sync_test.ts"],
  }).output();

  assertEquals(
    isolated.success,
    true,
    new TextDecoder().decode(isolated.stderr),
  );
  assertEquals(ordered.success, true, new TextDecoder().decode(ordered.stderr));
  const extractOutcome = (output: Uint8Array) => {
    const match = new TextDecoder().decode(output).match(
      /EXCEL_SYNC_OUTCOME (\{[^\n]+\})/,
    );
    if (!match) {
      throw new Error(
        "Excel sync subprocess did not emit structured outcome evidence",
      );
    }
    return JSON.parse(match[1]);
  };
  assertEquals(extractOutcome(isolated.stdout), extractOutcome(ordered.stdout));
});

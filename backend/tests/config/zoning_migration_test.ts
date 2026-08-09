import { assertEquals } from "@std/assert";
import { DB } from "sqlite";
import { getDb, setTestDb } from "../../src/config/database.ts";
import { runMigrations } from "../../src/scripts/migrate.ts";
import { setupTestDatabase } from "../test-utils.ts";

await setupTestDatabase();

Deno.test("migration 039 upgrades pre-zoning data and repeated startup is idempotent", async () => {
  const normalTestDb = getDb();
  const legacy = new DB(":memory:");
  legacy.query("PRAGMA foreign_keys = ON");
  legacy.execute(`
    CREATE TABLE migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE item_types (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE placements (id INTEGER PRIMARY KEY, type TEXT NOT NULL);
    CREATE TABLE area_properties (placement_id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO item_types(id,name) VALUES (7,'Preserved Type');
    INSERT INTO placements(id,type) VALUES (11,'area');
    INSERT INTO area_properties(placement_id,name) VALUES (11,'Preserved Area');
  `);
  const applied = normalTestDb.queryEntries<{ name: string }>("SELECT name FROM migrations WHERE name <> '039_generic_zoning_parameters'");
  for (const row of applied) legacy.query("INSERT INTO migrations(name) VALUES (?)", [row.name]);
  setTestDb(legacy);
  try {
    await runMigrations();
    await runMigrations();
    assertEquals(legacy.queryEntries("SELECT * FROM item_types WHERE id=7").length, 1);
    assertEquals(legacy.queryEntries("SELECT * FROM area_properties WHERE placement_id=11 AND revision=0").length, 1);
    assertEquals(legacy.queryEntries("SELECT * FROM item_type_zoning_parameters").length, 0);
    assertEquals(legacy.queryEntries("SELECT * FROM area_zoning_values").length, 0);
    const indexes = legacy.queryEntries<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%zoning%' ORDER BY name").map((row) => row.name);
    for (const name of ["idx_area_zoning_values_area_parameter", "idx_zoning_parameters_active_name", "idx_zoning_parameters_item_type_active_order"]) assertEquals(indexes.includes(name), true);
    assertEquals(legacy.queryEntries("SELECT * FROM migrations WHERE name='039_generic_zoning_parameters'").length, 1);
  } finally {
    setTestDb(normalTestDb);
    legacy.close();
  }
});

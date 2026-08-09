import { assertEquals } from "@std/assert";
import { DB } from "sqlite";
import { getDb, setTestDb } from "../../src/config/database.ts";
import { runMigrations } from "../../src/scripts/migrate.ts";
import { setupTestDatabase } from "../test-utils.ts";

await setupTestDatabase();

Deno.test("migration 039 preserves a complete pre-zoning project graph and is idempotent", async () => {
  const normalTestDb = getDb();
  const legacy = new DB(":memory:");
  legacy.query("PRAGMA foreign_keys = ON");
  setTestDb(legacy);
  try {
    // Build the fixture through the repository's actual pre-zoning migrations.
    await runMigrations("038_oauth_clients");
    legacy.query("INSERT INTO tenants(id,name,is_distributor,is_active) VALUES (7,'Legacy tenant',0,1)");
    legacy.query("INSERT INTO item_types(id,name,abbreviation,color,sort_order,is_active) VALUES (17,'Legacy type','LT','#123456',4,1)");
    legacy.query("INSERT INTO project_groups(id,customer_name,tenant_id,status) VALUES (27,'Legacy customer',7,'active')");
    legacy.query("INSERT INTO projects(id,project_group_id,version_name,tenant_id) VALUES (37,27,'v7',7)");
    legacy.query("INSERT INTO project_item_types(project_id,item_type_id) VALUES (37,17)");
    legacy.query("INSERT INTO floorplans(id,project_id,name,image_path,sort_order) VALUES (47,37,'Legacy floor','legacy.png',2)");
    legacy.query("INSERT INTO placements(id,floorplan_id,type,x,y,width,height,rotation) VALUES (57,47,'area',10,20,300,200,0)");
    legacy.query("INSERT INTO area_properties(id,placement_id,name,color,opacity) VALUES (67,57,'Legacy area','#abcdef',0.25)");
    legacy.query("INSERT INTO area_vertices(id,placement_id,vertex_index,x,y) VALUES (77,57,0,10,20),(78,57,1,310,20),(79,57,2,310,220),(80,57,3,10,220)");

    await runMigrations();
    await runMigrations();

    assertEquals(legacy.queryEntries("SELECT id,name FROM tenants WHERE id=7 AND name='Legacy tenant'").length, 1);
    assertEquals(legacy.queryEntries("SELECT id,name FROM item_types WHERE id=17 AND name='Legacy type'").length, 1);
    assertEquals(legacy.queryEntries("SELECT id FROM projects WHERE id=37 AND project_group_id=27 AND tenant_id=7").length, 1);
    assertEquals(legacy.queryEntries("SELECT * FROM project_item_types WHERE project_id=37 AND item_type_id=17").length, 1);
    assertEquals(legacy.queryEntries("SELECT id FROM floorplans WHERE id=47 AND project_id=37").length, 1);
    assertEquals(legacy.queryEntries("SELECT id FROM placements WHERE id=57 AND floorplan_id=47 AND type='area'").length, 1);
    assertEquals(legacy.queryEntries("SELECT * FROM area_properties WHERE id=67 AND placement_id=57 AND name='Legacy area' AND revision=0").length, 1);
    assertEquals(legacy.queryEntries("SELECT * FROM area_vertices WHERE placement_id=57").length, 4);
    assertEquals(legacy.queryEntries("SELECT * FROM item_type_zoning_parameters").length, 0);
    assertEquals(legacy.queryEntries("SELECT * FROM area_zoning_values").length, 0);
    const indexes = legacy.queryEntries<{ name: string }>("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE '%zoning%' ORDER BY name").map((row) => row.name);
    for (const name of ["idx_area_zoning_values_area_parameter", "idx_zoning_parameters_active_name", "idx_zoning_parameters_item_type_active_order"]) assertEquals(indexes.includes(name), true);
    assertEquals(legacy.queryEntries("PRAGMA foreign_key_list(area_zoning_values)").length, 2);
    assertEquals(legacy.queryEntries("PRAGMA foreign_key_list(item_type_zoning_parameters)").length, 1);
    assertEquals(legacy.queryEntries("SELECT * FROM migrations WHERE name='039_generic_zoning_parameters'").length, 1);
  } finally {
    setTestDb(normalTestDb);
    legacy.close();
  }
});

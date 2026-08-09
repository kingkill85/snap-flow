import { assertEquals, assertThrows } from "@std/assert";
import { clearDatabase, setupTestDatabase } from "../test-utils.ts";

await setupTestDatabase();
const { getDb } = await import("../../src/config/database.ts");
const { areaRepository } = await import("../../src/repositories/area.ts");
const { zoningParameterRepository } = await import(
  "../../src/repositories/zoning-parameter.ts"
);

Deno.test("Area aggregate applies selected active Product Types and atomically replaces values", async () => {
  clearDatabase();
  const db = getDb();
  const type = db.queryEntries<{ id: number }>(
    "INSERT INTO item_types(name, abbreviation, sort_order) VALUES ('Lighting','LGT',1) RETURNING id",
  )[0];
  const other = db.queryEntries<{ id: number }>(
    "INSERT INTO item_types(name, abbreviation, sort_order) VALUES ('HVAC','HVC',2) RETURNING id",
  )[0];
  const relay = zoningParameterRepository.create(type.id, "Relay zones", 1);
  zoningParameterRepository.create(other.id, "Fan zones", 1);
  db.query(
    "INSERT INTO project_groups(customer_name, tenant_id) VALUES ('Customer',1)",
  );
  const group =
    db.queryEntries<{ id: number }>("SELECT id FROM project_groups")[0];
  const project = db.queryEntries<{ id: number }>(
    "INSERT INTO projects(project_group_id,version_name,tenant_id) VALUES (?,'v1',1) RETURNING id",
    [group.id],
  )[0];
  db.query(
    "INSERT INTO project_item_types(project_id,item_type_id) VALUES (?,?)",
    [project.id, type.id],
  );
  const floorplan = db.queryEntries<{ id: number }>(
    "INSERT INTO floorplans(project_id,name,image_path) VALUES (?,'Plan','plan.png') RETURNING id",
    [project.id],
  )[0];
  const area = await areaRepository.create({
    floorplan_id: floorplan.id,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    name: "Room",
  });
  assertEquals(area.zoning_groups.map((entry) => entry.item_type.name), [
    "Lighting",
  ]);
  assertEquals(area.zoning_groups[0].parameters[0].value, 0);
  const saved = await areaRepository.updateProperties(area.id, {
    name: "Renamed",
    revision: 0,
    applicable_parameter_ids: [relay.id],
    zoning_values: [{ parameter_id: relay.id, value: 3 }],
  });
  assertEquals(saved?.name, "Renamed");
  assertEquals(saved?.revision, 1);
  assertEquals(saved?.zoning_groups[0].parameters[0].value, 3);
  assertThrows(
    () =>
      areaRepository.updateProperties(area.id, {
        name: "Stale",
        revision: 0,
        applicable_parameter_ids: [relay.id],
        zoning_values: [{ parameter_id: relay.id, value: 4 }],
      }),
    Error,
    "reload required",
  );
  assertEquals((await areaRepository.findById(area.id))?.name, "Renamed");
  const cleared = await areaRepository.updateProperties(area.id, {
    revision: 1,
    applicable_parameter_ids: [relay.id],
    zoning_values: [{ parameter_id: relay.id, value: 0 }],
  });
  assertEquals(cleared?.zoning_groups[0].parameters[0].value, 0);
  assertEquals(db.queryEntries("SELECT * FROM area_zoning_values").length, 0);
  assertEquals(
    await areaRepository.findById(area.id, { role: "user", tenantId: 999 }),
    null,
  );
});

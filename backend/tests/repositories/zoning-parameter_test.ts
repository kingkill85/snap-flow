import { assertEquals, assertThrows } from "@std/assert";
import { clearDatabase, setupTestDatabase } from "../test-utils.ts";

await setupTestDatabase();
const { getDb } = await import("../../src/config/database.ts");
const {
  zoningParameterRepository,
  ZoningConflictError,
  ZoningValidationError,
} = await import("../../src/repositories/zoning-parameter.ts");

function createType(name = "Lighting"): number {
  return getDb().queryEntries<{ id: number }>(
    "INSERT INTO item_types(name, abbreviation, sort_order) VALUES (?, ?, 1) RETURNING id",
    [name, name.slice(0, 3).toUpperCase()],
  )[0].id;
}

Deno.test("migration 039 creates normalized constrained zoning schema without seed rows", () => {
  clearDatabase();
  const tables = getDb().queryEntries<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('item_type_zoning_parameters','area_zoning_values') ORDER BY name",
  );
  assertEquals(tables.map((row) => row.name), [
    "area_zoning_values",
    "item_type_zoning_parameters",
  ]);
  assertEquals(
    getDb().queryEntries("SELECT * FROM item_type_zoning_parameters").length,
    0,
  );
  assertEquals(
    getDb().queryEntries("SELECT * FROM area_zoning_values").length,
    0,
  );
  const revision = getDb().queryEntries<{ revision: number }>(
    "SELECT dflt_value revision FROM pragma_table_info('area_properties') WHERE name='revision'",
  )[0];
  assertEquals(String(revision.revision), "0");
});

Deno.test("parameter lifecycle preserves stable identity and orders deterministically", () => {
  clearDatabase();
  const typeId = createType();
  const second = zoningParameterRepository.create(typeId, "Fan zones", 2);
  const first = zoningParameterRepository.create(typeId, "Relay 16A", 1);
  assertEquals(zoningParameterRepository.findAll(typeId).map((row) => row.id), [
    first.id,
    second.id,
  ]);
  const renamed = zoningParameterRepository.update(typeId, first.id, {
    name: "Relay circuits",
  });
  assertEquals(renamed?.id, first.id);
  assertThrows(
    () => zoningParameterRepository.create(typeId, "RELAY CIRCUITS"),
    ZoningValidationError,
  );
  zoningParameterRepository.reorder(typeId, [second.id, first.id]);
  assertEquals(zoningParameterRepository.findAll(typeId).map((row) => row.id), [
    second.id,
    first.id,
  ]);
  assertThrows(
    () => zoningParameterRepository.reorder(typeId, [first.id, first.id]),
    ZoningValidationError,
  );
  zoningParameterRepository.setActive(typeId, first.id, false);
  assertEquals(zoningParameterRepository.findAll(typeId).map((row) => row.id), [
    second.id,
  ]);
  assertEquals(
    zoningParameterRepository.setActive(typeId, first.id, true)?.id,
    first.id,
  );
});

Deno.test("referenced parameters cannot be deleted and Area values enforce positive bounds", () => {
  clearDatabase();
  const db = getDb();
  const typeId = createType();
  const parameter = zoningParameterRepository.create(typeId, "Zones");
  db.query(
    "INSERT INTO project_groups(customer_name, tenant_id) VALUES ('Customer', 1)",
  );
  const groupId =
    db.queryEntries<{ id: number }>("SELECT id FROM project_groups")[0].id;
  const projectId = db.queryEntries<{ id: number }>(
    "INSERT INTO projects(project_group_id, version_name, tenant_id) VALUES (?, 'v1', 1) RETURNING id",
    [groupId],
  )[0].id;
  const floorplanId = db.queryEntries<{ id: number }>(
    "INSERT INTO floorplans(project_id, name, image_path) VALUES (?, 'Plan', 'plan.png') RETURNING id",
    [projectId],
  )[0].id;
  const areaId = db.queryEntries<{ id: number }>(
    "INSERT INTO placements(floorplan_id, type, x, y, width, height) VALUES (?, 'area', 0, 0, 10, 10) RETURNING id",
    [floorplanId],
  )[0].id;
  db.query(
    "INSERT INTO area_properties(placement_id, name) VALUES (?, 'Room')",
    [areaId],
  );
  db.query(
    "INSERT INTO area_zoning_values(area_placement_id, parameter_id, value) VALUES (?, ?, 2)",
    [areaId, parameter.id],
  );
  assertThrows(
    () => zoningParameterRepository.delete(typeId, parameter.id),
    ZoningConflictError,
  );
  assertThrows(() =>
    db.query(
      "INSERT INTO area_zoning_values(area_placement_id, parameter_id, value) VALUES (?, ?, 0)",
      [areaId, parameter.id + 1],
    )
  );
});

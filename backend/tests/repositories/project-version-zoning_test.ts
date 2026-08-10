import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import { getDb } from "../../src/config/database.ts";
import { projectGroupRepository } from "../../src/repositories/project-group.ts";
import { hashPassword } from "../../src/services/password.ts";
import { parseJSON, testRequest } from "../test-client.ts";
import { clearDatabase, setupTestDatabase } from "../test-utils.ts";

await setupTestDatabase();

type Fixture = {
  groupId: number;
  sourceProjectId: number;
  sourceAreaIds: number[];
  parameterIds: number[];
};

function insertId(sql: string, params: Array<string | number | null>): number {
  const rows = getDb().queryEntries<{ id: number }>(
    `${sql} RETURNING id`,
    params,
  );
  return rows[0]!.id;
}

function createFixture(): Fixture {
  clearDatabase();
  const db = getDb();
  const groupId = insertId(
    "INSERT INTO project_groups (customer_name, tenant_id) VALUES (?, ?)",
    ["Version zoning customer", 1],
  );
  const sourceProjectId = insertId(
    "INSERT INTO projects (project_group_id, version_name, tenant_id) VALUES (?, ?, ?)",
    [groupId, "v1", 1],
  );
  const itemTypeId = insertId(
    "INSERT INTO item_types (name, abbreviation, sort_order) VALUES (?, ?, ?)",
    ["Version zoning type", "VZT", 1],
  );
  db.query(
    "INSERT INTO project_item_types (project_id, item_type_id) VALUES (?, ?)",
    [sourceProjectId, itemTypeId],
  );
  const parameterIds = [
    insertId(
      "INSERT INTO item_type_zoning_parameters (item_type_id, name, name_key, sort_order) VALUES (?, ?, ?, ?)",
      [itemTypeId, "Heating zones", "heating zones", 0],
    ),
    insertId(
      "INSERT INTO item_type_zoning_parameters (item_type_id, name, name_key, sort_order) VALUES (?, ?, ?, ?)",
      [itemTypeId, "Cooling zones", "cooling zones", 1],
    ),
  ];

  const sourceAreaIds: number[] = [];
  for (const [index, floorName] of ["Ground", "Upper", "Garage"].entries()) {
    const floorplanId = insertId(
      "INSERT INTO floorplans (project_id, name, image_path, sort_order) VALUES (?, ?, ?, ?)",
      [sourceProjectId, floorName, `floorplans/missing-${index}.png`, index],
    );
    const areaId = insertId(
      "INSERT INTO placements (floorplan_id, type, x, y, width, height, rotation) VALUES (?, 'area', ?, ?, ?, ?, 0)",
      [floorplanId, 10 + index, 20 + index, 100, 80],
    );
    sourceAreaIds.push(areaId);
    db.query(
      "INSERT INTO area_properties (placement_id, name, color, opacity) VALUES (?, ?, ?, ?)",
      [areaId, `${floorName} Area`, "#123456", 0.2],
    );
    db.query(
      "INSERT INTO area_vertices (placement_id, vertex_index, x, y) VALUES (?, 0, 0, 0), (?, 1, 100, 0), (?, 2, 100, 80)",
      [areaId, areaId, areaId],
    );
  }
  db.query(
    "INSERT INTO area_zoning_values (area_placement_id, parameter_id, value) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)",
    [
      sourceAreaIds[0],
      parameterIds[0],
      2,
      sourceAreaIds[0],
      parameterIds[1],
      3,
      sourceAreaIds[1],
      parameterIds[0],
      4,
    ],
  );
  return { groupId, sourceProjectId, sourceAreaIds, parameterIds };
}

function destinationValues(projectId: number) {
  return getDb().queryEntries<{
    area_placement_id: number;
    area_name: string;
    parameter_id: number;
    value: number;
  }>(
    `
    SELECT azv.area_placement_id, ap.name AS area_name, azv.parameter_id, azv.value
    FROM area_zoning_values azv
    JOIN placements p ON p.id = azv.area_placement_id
    JOIN floorplans f ON f.id = p.floorplan_id
    JOIN area_properties ap ON ap.placement_id = p.id
    WHERE f.project_id = ?
    ORDER BY ap.name, azv.parameter_id
  `,
    [projectId],
  );
}

Deno.test("Create Version copies positive Area zoning values with remapped Areas and stable definitions", async () => {
  const fixture = createFixture();
  const definitionCountBefore = getDb().queryEntries<{ count: number }>(
    "SELECT COUNT(*) AS count FROM item_type_zoning_parameters",
  )[0]!.count;

  const copied = await projectGroupRepository.createVersion(
    fixture.sourceProjectId,
    { version_name: "v2", source_project_id: fixture.sourceProjectId },
    1,
  );
  const values = destinationValues(copied.id);
  const destinationAreaCount = getDb().queryEntries<{ count: number }>(
    `
    SELECT COUNT(*) AS count
    FROM placements p JOIN floorplans f ON f.id = p.floorplan_id
    WHERE f.project_id = ? AND p.type = 'area'
  `,
    [copied.id],
  )[0]!.count;

  assertEquals(destinationAreaCount, 3);
  assertEquals(
    values.map(({ area_name, parameter_id, value }) => ({
      area_name,
      parameter_id,
      value,
    })),
    [
      {
        area_name: "Ground Area",
        parameter_id: fixture.parameterIds[0],
        value: 2,
      },
      {
        area_name: "Ground Area",
        parameter_id: fixture.parameterIds[1],
        value: 3,
      },
      {
        area_name: "Upper Area",
        parameter_id: fixture.parameterIds[0],
        value: 4,
      },
    ],
  );
  assertEquals(
    new Set(values.map((row) => `${row.area_placement_id}:${row.parameter_id}`))
      .size,
    3,
  );
  for (const row of values) {
    assertEquals(fixture.sourceAreaIds.includes(row.area_placement_id), false);
  }
  assertEquals(
    getDb().queryEntries<{ count: number }>(
      "SELECT COUNT(*) AS count FROM item_type_zoning_parameters",
    )[0]!.count,
    definitionCountBefore,
  );

  getDb().query(
    "UPDATE area_zoning_values SET value = 9 WHERE area_placement_id = ? AND parameter_id = ?",
    [
      values[0]!.area_placement_id,
      values[0]!.parameter_id,
    ],
  );
  assertEquals(
    getDb().queryEntries<{ value: number }>(
      "SELECT value FROM area_zoning_values WHERE area_placement_id = ? AND parameter_id = ?",
      [fixture.sourceAreaIds[0], fixture.parameterIds[0]],
    )[0]!.value,
    2,
  );
  assertNotEquals(values[0]!.area_placement_id, fixture.sourceAreaIds[0]);
});

Deno.test("Create Version route copies zoning and preserves source membership checks", async () => {
  const fixture = createFixture();
  const password = "Issue89Version!";
  getDb().query(
    "INSERT INTO users (email, password_hash, role, tenant_id) VALUES (?, ?, 'tenant_admin', 1)",
    ["version@example.com", hashPassword(password)],
  );
  const login = await testRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "version@example.com", password }),
  });
  const token = (await parseJSON(login)).data.accessToken;
  const response = await testRequest(
    `/api/project-groups/${fixture.groupId}/versions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        version_name: "v2",
        source_project_id: fixture.sourceProjectId,
      }),
    },
  );
  assertEquals(response.status, 201);
  const projectId = (await parseJSON(response)).data.id;
  assertEquals(destinationValues(projectId).length, 3);

  const otherGroupId = insertId(
    "INSERT INTO project_groups (customer_name, tenant_id) VALUES (?, ?)",
    ["Other group", 1],
  );
  const rejected = await testRequest(
    `/api/project-groups/${otherGroupId}/versions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        version_name: "bad",
        source_project_id: fixture.sourceProjectId,
      }),
    },
  );
  assertEquals(rejected.status, 404);
});

Deno.test("Create Version rolls back the complete version when zoning persistence fails", async () => {
  const fixture = createFixture();
  const db = getDb();
  const before = Object.fromEntries(
    [
      "projects",
      "floorplans",
      "placements",
      "area_properties",
      "area_vertices",
      "area_zoning_values",
      "project_item_types",
    ].map((table) => [
      table,
      db.queryEntries<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      )[0]!.count,
    ]),
  );
  db.query(`
    CREATE TRIGGER reject_copied_zoning
    BEFORE INSERT ON area_zoning_values
    BEGIN
      SELECT RAISE(ABORT, 'injected zoning persistence failure');
    END
  `);

  await assertRejects(
    () =>
      projectGroupRepository.createVersion(
        fixture.sourceProjectId,
        { version_name: "v2", source_project_id: fixture.sourceProjectId },
        1,
      ),
    Error,
    "injected zoning persistence failure",
  );
  db.query("DROP TRIGGER reject_copied_zoning");
  for (const [table, count] of Object.entries(before)) {
    assertEquals(
      db.queryEntries<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${table}`,
      )[0]!.count,
      count,
      `${table} must roll back`,
    );
  }
});

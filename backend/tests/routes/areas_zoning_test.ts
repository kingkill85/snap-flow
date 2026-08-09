import { assertEquals, assertThrows } from "@std/assert";
import { clearDatabase, setupTestDatabase } from "../test-utils.ts";
import { parseJSON, testRequest } from "../test-client.ts";
import { hashPassword } from "../../src/services/password.ts";

await setupTestDatabase();
const { getDb } = await import("../../src/config/database.ts");
const { areaRepository } = await import("../../src/repositories/area.ts");
const { userRepository } = await import("../../src/repositories/user.ts");
const { zoningParameterRepository } = await import(
  "../../src/repositories/zoning-parameter.ts"
);

Deno.test("Area aggregate applies selected active Product Types and atomically replaces values", async () => {
  clearDatabase();
  const db = getDb();
  await userRepository.create({ email: "owner@area.test", password_hash: hashPassword("password123"), role: "user", tenant_id: 1 });
  const login = await testRequest("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "owner@area.test", password: "password123" }) });
  const bearer = `Bearer ${(await parseJSON(login)).data.accessToken}`;
  db.query("INSERT INTO tenants(id,name,is_distributor,is_active) VALUES (999,'Other tenant',0,1)");
  await userRepository.create({ email: "other@area.test", password_hash: hashPassword("password123"), role: "user", tenant_id: 999 });
  const otherLogin = await testRequest("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "other@area.test", password: "password123" }) });
  const otherBearer = `Bearer ${(await parseJSON(otherLogin)).data.accessToken}`;
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

  const restored = await areaRepository.updateProperties(area.id, {
    revision: 2,
    applicable_parameter_ids: [relay.id],
    zoning_values: [{ parameter_id: relay.id, value: 5 }],
  });
  const omittedResponse = await testRequest(`/api/areas/${area.id}`, { method: "PUT", headers: { Authorization: bearer, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Omitted clears", revision: restored!.revision, applicable_parameter_ids: [relay.id], zoning_values: [] }) });
  assertEquals(omittedResponse.status, 200);
  const omitted = (await parseJSON(omittedResponse)).data;
  assertEquals(omitted.zoning_groups[0].parameters[0].value, 0);
  assertEquals(db.queryEntries("SELECT * FROM area_zoning_values").length, 0);
  assertThrows(() => areaRepository.updateProperties(area.id, {
    name: "Must roll back",
    revision: omitted!.revision,
    applicable_parameter_ids: [relay.id],
    zoning_values: [{ parameter_id: relay.id + 999, value: 2 }],
  }), Error, "Values must be unique");
  assertEquals((await areaRepository.findById(area.id))?.name, "Omitted clears");
  zoningParameterRepository.setActive(type.id, relay.id, false);
  const changedApplicability = await testRequest(`/api/areas/${area.id}`, { method: "PUT", headers: { Authorization: bearer, "Content-Type": "application/json" }, body: JSON.stringify({ revision: omitted.revision, applicable_parameter_ids: [relay.id], zoning_values: [] }) });
  assertEquals(changedApplicability.status, 409);
  zoningParameterRepository.setActive(type.id, relay.id, true);
  const unauthenticated = await testRequest(`/api/areas/${area.id}`);
  assertEquals(unauthenticated.status, 401);
  const invalidResponse = await testRequest(`/api/areas/${area.id}`, { method: "PUT", headers: { Authorization: bearer, "Content-Type": "application/json" }, body: JSON.stringify({ name: "HTTP rollback", revision: omitted.revision, applicable_parameter_ids: [relay.id], zoning_values: [{ parameter_id: relay.id, value: 10000 }] }) });
  assertEquals(invalidResponse.status, 400);
  assertEquals((await areaRepository.findById(area.id))?.name, "Omitted clears");
  for (const request of [
    testRequest(`/api/areas?floorplan_id=${floorplan.id}`, { headers: { Authorization: otherBearer } }),
    testRequest(`/api/areas/${area.id}`, { headers: { Authorization: otherBearer } }),
    testRequest("/api/areas", { method: "POST", headers: { Authorization: otherBearer, "Content-Type": "application/json" }, body: JSON.stringify({ floorplan_id: floorplan.id, x: 0, y: 0, width: 5, height: 5 }) }),
    testRequest(`/api/areas/${area.id}`, { method: "PUT", headers: { Authorization: otherBearer, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Cross tenant" }) }),
    testRequest(`/api/areas/${area.id}/vertices`, { method: "PUT", headers: { Authorization: otherBearer, "Content-Type": "application/json" }, body: JSON.stringify({ vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 0, y: 5 }] }) }),
    testRequest(`/api/areas/${area.id}`, { method: "DELETE", headers: { Authorization: otherBearer } }),
  ]) assertEquals((await request).status, 404);
  assertEquals((await areaRepository.findById(area.id))?.name, "Omitted clears");
  assertEquals(
    await areaRepository.findById(area.id, { role: "user", tenantId: 999 }),
    null,
  );
});

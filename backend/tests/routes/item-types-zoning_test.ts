import { assertEquals, assertExists } from "@std/assert";
import { clearDatabase, setupTestDatabase } from "../test-utils.ts";
import { parseJSON, testRequest } from "../test-client.ts";
import { hashPassword } from "../../src/services/password.ts";

await setupTestDatabase();
const { userRepository } = await import("../../src/repositories/user.ts");
const { itemTypeRepository } = await import(
  "../../src/repositories/item-type.ts"
);
const { getDb } = await import("../../src/config/database.ts");

async function token(role: "admin" | "user"): Promise<string> {
  const email = `${role}@zoning.test`;
  await userRepository.create({
    email,
    password_hash: hashPassword("password123"),
    role,
    tenant_id: 1,
  });
  const response = await testRequest("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "password123" }),
  });
  return (await parseJSON(response)).data.accessToken;
}

Deno.test("nested zoning parameter routes validate, authorize, order and preserve parent identity", async () => {
  clearDatabase();
  const admin = await token("admin");
  const user = await token("user");
  const type = await itemTypeRepository.create({
    name: "Lighting",
    abbreviation: "LGT",
  });
  const forbidden = await testRequest(
    `/api/item-types/${type.id}/zoning-parameters`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Relay" }),
    },
  );
  assertEquals(forbidden.status, 403);
  const invalid = await testRequest(
    `/api/item-types/${type.id}/zoning-parameters`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Relay", unknown: true }),
    },
  );
  assertEquals(invalid.status, 400);
  for (const [name, sort_order] of [["Fan", 2], ["Relay", 1]] as const) {
    assertEquals(
      (await testRequest(`/api/item-types/${type.id}/zoning-parameters`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${admin}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, sort_order }),
      })).status,
      201,
    );
  }
  const list = await testRequest(
    `/api/item-types/${type.id}/zoning-parameters`,
    { headers: { Authorization: `Bearer ${user}` } },
  );
  const body = await parseJSON(list);
  assertEquals(body.data.map((row: { name: string }) => row.name), [
    "Relay",
    "Fan",
  ]);
  assertExists(body.data[0].id);
  const duplicate = await testRequest(
    `/api/item-types/${type.id}/zoning-parameters`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "relay" }),
    },
  );
  assertEquals(duplicate.status, 400);
  const badOrder = await testRequest(
    `/api/item-types/${type.id}/zoning-parameters/reorder`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${admin}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids: [body.data[0].id, body.data[0].id] }),
    },
  );
  assertEquals(badOrder.status, 400);

  const relayId = body.data[0].id as number;
  const fanId = body.data[1].id as number;
  for (const [path, method, requestBody] of [
    [`/api/item-types/${type.id}/zoning-parameters/${relayId}`, "PUT", { name: "Forbidden rename" }],
    [`/api/item-types/${type.id}/zoning-parameters/reorder`, "PATCH", { ids: [fanId, relayId] }],
    [`/api/item-types/${type.id}/zoning-parameters/${relayId}/deactivate`, "PATCH", undefined],
    [`/api/item-types/${type.id}/zoning-parameters/${relayId}/activate`, "PATCH", undefined],
    [`/api/item-types/${type.id}/zoning-parameters/${relayId}`, "DELETE", undefined],
  ] as const) {
    const response = await testRequest(path, { method, headers: { Authorization: `Bearer ${user}`, ...(requestBody ? { "Content-Type": "application/json" } : {}) }, ...(requestBody ? { body: JSON.stringify(requestBody) } : {}) });
    assertEquals(response.status, 403);
  }
  const renamed = await testRequest(`/api/item-types/${type.id}/zoning-parameters/${relayId}`, { method: "PUT", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Relay circuits" }) });
  assertEquals(renamed.status, 200);
  assertEquals((await parseJSON(renamed)).data.id, relayId);
  const deactivated = await testRequest(`/api/item-types/${type.id}/zoning-parameters/${relayId}/deactivate`, { method: "PATCH", headers: { Authorization: `Bearer ${admin}` } });
  assertEquals(deactivated.status, 200);
  const activeList = await parseJSON(await testRequest(`/api/item-types/${type.id}/zoning-parameters?include_inactive=true`, { headers: { Authorization: `Bearer ${user}` } }));
  assertEquals(activeList.data.map((row: { id: number }) => row.id), [fanId]);
  const adminList = await parseJSON(await testRequest(`/api/item-types/${type.id}/zoning-parameters?include_inactive=true`, { headers: { Authorization: `Bearer ${admin}` } }));
  assertEquals(adminList.data.length, 2);
  assertEquals((await testRequest(`/api/item-types/${type.id}/zoning-parameters/${relayId}/activate`, { method: "PATCH", headers: { Authorization: `Bearer ${admin}` } })).status, 200);
  const validOrder = await testRequest(`/api/item-types/${type.id}/zoning-parameters/reorder`, { method: "PATCH", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" }, body: JSON.stringify({ ids: [fanId, relayId] }) });
  assertEquals(validOrder.status, 200);
  assertEquals((await parseJSON(validOrder)).data.map((row: { id: number }) => row.id), [fanId, relayId]);
  const otherType = await itemTypeRepository.create({ name: "HVAC", abbreviation: "HVC" });
  assertEquals((await testRequest(`/api/item-types/${otherType.id}/zoning-parameters/${relayId}`, { method: "PUT", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Foreign" }) })).status, 404);
  const db = getDb();
  const dbParameterIds = () => db.queryEntries<{ id: number }>("SELECT id FROM item_type_zoning_parameters WHERE item_type_id=? ORDER BY sort_order,id", [type.id]).map((row) => row.id);
  for (const invalidDelete of [
    { body: JSON.stringify({ unknown: true }), contentType: "application/json" },
    { body: "{", contentType: "application/json" },
    { body: "[]", contentType: "application/json" },
    { body: JSON.stringify("invalid"), contentType: "application/json" },
    { body: "null", contentType: "application/json" },
    { body: "{}", contentType: "text/plain" },
  ]) {
    const invalid = await testRequest(`/api/item-types/${type.id}/zoning-parameters/${fanId}`, { method: "DELETE", headers: { Authorization: `Bearer ${admin}`, "Content-Type": invalidDelete.contentType }, body: invalidDelete.body });
    assertEquals(invalid.status, 400);
    const invalidBody = await parseJSON(invalid);
    assertEquals(invalidBody.error, "Invalid request body");
    assertEquals(typeof invalidBody.details, "object");
    assertEquals(dbParameterIds(), [fanId, relayId]);
  }
  assertEquals((await testRequest(`/api/item-types/${type.id}/zoning-parameters/${fanId}`, { method: "DELETE", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" }, body: "{}" })).status, 200);
  assertEquals(dbParameterIds(), [relayId]);
  const bodylessParameter = await parseJSON(await testRequest(`/api/item-types/${type.id}/zoning-parameters`, { method: "POST", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Bodyless delete", sort_order: 2 }) }));
  assertEquals((await testRequest(`/api/item-types/${type.id}/zoning-parameters/${bodylessParameter.data.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${admin}` } })).status, 200);
  assertEquals(dbParameterIds(), [relayId]);

  db.query("INSERT INTO project_groups(customer_name, tenant_id) VALUES ('Customer',1)");
  const groupId = db.queryEntries<{ id: number }>("SELECT id FROM project_groups")[0].id;
  const projectId = db.queryEntries<{ id: number }>("INSERT INTO projects(project_group_id,version_name,tenant_id) VALUES (?,'v1',1) RETURNING id", [groupId])[0].id;
  const floorplanId = db.queryEntries<{ id: number }>("INSERT INTO floorplans(project_id,name,image_path) VALUES (?,'Plan','plan.png') RETURNING id", [projectId])[0].id;
  const areaId = db.queryEntries<{ id: number }>("INSERT INTO placements(floorplan_id,type,x,y,width,height) VALUES (?,'area',0,0,10,10) RETURNING id", [floorplanId])[0].id;
  db.query("INSERT INTO area_properties(placement_id,name) VALUES (?,'Room')", [areaId]);
  db.query("INSERT INTO area_zoning_values(area_placement_id,parameter_id,value) VALUES (?,?,2)", [areaId, relayId]);

  for (const [action, expectedActive] of [["deactivate", 1], ["activate", 0]] as const) {
    if (action === "activate") assertEquals((await testRequest(`/api/item-types/${type.id}/zoning-parameters/${relayId}/deactivate`, { method: "PATCH", headers: { Authorization: `Bearer ${admin}` } })).status, 200);
    const invalidAction = await testRequest(`/api/item-types/${type.id}/zoning-parameters/${relayId}/${action}`, { method: "PATCH", headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" }, body: JSON.stringify({ unexpected: true }) });
    assertEquals(invalidAction.status, 400);
    assertEquals(typeof (await parseJSON(invalidAction)).details, "object");
    assertEquals(db.queryEntries<{ is_active: number }>("SELECT is_active FROM item_type_zoning_parameters WHERE id=?", [relayId])[0].is_active, expectedActive);
    assertEquals(db.queryEntries<{ value: number }>("SELECT value FROM area_zoning_values WHERE area_placement_id=? AND parameter_id=?", [areaId, relayId])[0].value, 2);
  }
  assertEquals((await testRequest(`/api/item-types/${type.id}/zoning-parameters/${relayId}/activate`, { method: "PATCH", headers: { Authorization: `Bearer ${admin}` } })).status, 200);

  const conflict = await testRequest(`/api/item-types/${type.id}/zoning-parameters/${relayId}`, { method: "DELETE", headers: { Authorization: `Bearer ${admin}` } });
  assertEquals(conflict.status, 409);
  assertEquals((await parseJSON(conflict)).code, "PARAMETER_IN_USE");
});

import { assertEquals, assertExists } from "@std/assert";
import { clearDatabase, setupTestDatabase } from "../test-utils.ts";
import { parseJSON, testRequest } from "../test-client.ts";
import { hashPassword } from "../../src/services/password.ts";

await setupTestDatabase();
const { userRepository } = await import("../../src/repositories/user.ts");
const { itemTypeRepository } = await import(
  "../../src/repositories/item-type.ts"
);

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
});

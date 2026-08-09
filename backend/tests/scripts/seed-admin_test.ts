import { assertEquals, assert } from "@std/assert";
import { comparePassword } from "../../src/services/password.ts";
import { seedAdmin } from "../../src/scripts/seed-admin.ts";
import { getDb } from "../../src/config/database.ts";
import { clearDatabase, setupTestDatabase } from "../test-utils.ts";

Deno.test("seedAdmin requires explicit credentials and never logs a secret", async () => {
  await setupTestDatabase();
  clearDatabase();
  const originalLog = console.log;
  const lines: string[] = [];
  console.log = (...values: unknown[]) => lines.push(values.map(String).join(" "));
  try {
    Deno.env.delete("ADMIN_EMAIL");
    Deno.env.delete("ADMIN_PASSWORD");
    assertEquals(seedAdmin().created, false);
    assertEquals(getDb().queryEntries("SELECT id FROM users").length, 0);

    Deno.env.set("ADMIN_EMAIL", "owner@example.test");
    Deno.env.set("ADMIN_PASSWORD", "correct-horse-battery-staple");
    assertEquals(seedAdmin().created, true);
    const user = getDb().queryEntries<{ email: string; password_hash: string }>(
      "SELECT email,password_hash FROM users",
    )[0];
    assertEquals(user.email, "owner@example.test");
    assert(comparePassword("correct-horse-battery-staple", user.password_hash));
    assert(!lines.join("\n").includes("correct-horse-battery-staple"));
  } finally {
    console.log = originalLog;
    Deno.env.delete("ADMIN_EMAIL");
    Deno.env.delete("ADMIN_PASSWORD");
    clearDatabase();
  }
});

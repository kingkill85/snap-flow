import { getDb } from "../config/database.ts";
import { hashPassword } from "../services/password.ts";

export function seedAdmin(): { created: boolean } {
  const db = getDb();

  try {
    // Check if admin user already exists
    const existingAdmin = db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

    if (existingAdmin.length > 0) {
      console.log("Admin user already exists, skipping seed");
      return { created: false };
    }

    const adminEmail = Deno.env.get("ADMIN_EMAIL")?.trim() || "";
    const adminPassword = Deno.env.get("ADMIN_PASSWORD") || "";
    const forbidden = new Set(["admin", "admin123", "password", "changeme"]);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail) || adminPassword.length < 16
      || forbidden.has(adminPassword.toLowerCase())) {
      console.log(
        "No administrator created. Set valid ADMIN_EMAIL and ADMIN_PASSWORD (minimum 16 characters), then restart.",
      );
      return { created: false };
    }
    const passwordHash = hashPassword(adminPassword);

    // Create admin user
    db.query(
      `INSERT INTO users (email, password_hash, role, full_name, created_at) VALUES (?, ?, ?, ?, ?)`,
      [adminEmail, passwordHash, "admin", "Administrator", new Date().toISOString()]
    );

    console.log("");
    console.log("========================================");
    console.log("       EXPLICIT ADMIN USER CREATED      ");
    console.log("========================================");
    console.log("Administrator created from explicit startup credentials.");
    console.log("========================================");
    console.log("");

    return { created: true };
  } catch (error) {
    console.error("Error in seedAdmin:", error);
    throw error;
  }
}

// Run if called directly
if (import.meta.main) {
  seedAdmin();
}

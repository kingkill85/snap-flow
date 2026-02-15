import { DB } from "https://deno.land/x/sqlite@v3.9.1/mod.ts";
import { hashPassword } from "../services/password.ts";

export async function seedAdmin(): Promise<{ created: boolean; password?: string }> {
  const db = new DB("./data/database.sqlite");

  try {
    // Check if admin user already exists
    const existingAdmin = db.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");

    if (existingAdmin.length > 0) {
      console.log("Admin user already exists, skipping seed");
      return { created: false };
    }

    // Generate a secure random password
    const generatePassword = () => {
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
      let password = "";
      for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return password;
    };

    const adminPassword = generatePassword();
    const passwordHash = await hashPassword(adminPassword);

    // Create admin user
    db.query(
      `INSERT INTO users (email, password_hash, role, full_name, created_at) VALUES (?, ?, ?, ?, ?)`,
      ["admin@snapflow.com", passwordHash, "admin", "Administrator", new Date().toISOString()]
    );

    console.log("");
    console.log("========================================");
    console.log("       DEFAULT ADMIN USER CREATED       ");
    console.log("========================================");
    console.log("Email: admin@snapflow.com");
    console.log("Password: " + adminPassword);
    console.log("========================================");
    console.log("IMPORTANT: Change this password immediately after logging in!");
    console.log("");

    return { created: true, password: adminPassword };
  } finally {
    db.close();
  }
}

// Run if called directly
if (import.meta.main) {
  await seedAdmin();
}

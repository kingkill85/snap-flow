import { getDb } from "../config/database.ts";
import { hashPassword } from "../services/password.ts";

export function seedAdmin(): { created: boolean; password?: string } {
  const db = getDb();

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
    const passwordHash = hashPassword(adminPassword);

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
    console.log("========================================");
    console.log("A one-time administrator credential was generated; its value is never logged.");
    console.log("");

    return { created: true, password: adminPassword };
  } catch (error) {
    console.error("Error in seedAdmin:", error);
    throw error;
  }
}

// Run if called directly
if (import.meta.main) {
  seedAdmin();
}

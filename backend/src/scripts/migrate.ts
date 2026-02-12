import { db } from '../config/database.ts';

/**
 * Migration runner
 * Applies pending migrations in order
 */

interface Migration {
  id: number;
  name: string;
  applied_at: string;
}

export async function setupMigrations(): Promise<void> {
  // Create migrations table if not exists
  db.execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function getAppliedMigrations(): Promise<string[]> {
  const result = db.query<[string]>(`SELECT name FROM migrations ORDER BY id`);
  return result.map((row: [string]) => row[0]);
}

export async function applyMigration(name: string, sql: string): Promise<void> {
  try {
    db.execute(sql);
    db.query(`INSERT INTO migrations (name) VALUES (?)`, [name]);
    console.log(`✅ Applied migration: ${name}`);
  } catch (error) {
    console.error(`❌ Failed to apply migration ${name}:`, error);
    throw error;
  }
}

export async function runMigrations(): Promise<void> {
  await setupMigrations();
  
  const appliedMigrations = await getAppliedMigrations();
  
  // Migration definitions
  const migrations: { name: string; sql: string }[] = [
    {
      name: '001_create_users_table',
      sql: `
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT CHECK(role IN ('admin', 'user')) NOT NULL DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_users_email ON users(email);
      `
    },
    {
      name: '002_create_categories_table',
      sql: `
        CREATE TABLE categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          sort_order INTEGER DEFAULT 0
        );
      `
    },
    {
      name: '003_create_items_table',
      sql: `
        CREATE TABLE items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER REFERENCES categories(id),
          name TEXT NOT NULL,
          description TEXT,
          model_number TEXT,
          dimensions TEXT,
          price REAL NOT NULL,
          image_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_items_category ON items(category_id);
      `
    },
    {
      name: '004_create_customers_table',
      sql: `
        CREATE TABLE customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          address TEXT,
          created_by INTEGER REFERENCES users(id),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_customers_name ON customers(name);
      `
    },
    {
      name: '005_create_projects_table',
      sql: `
        CREATE TABLE projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          customer_id INTEGER REFERENCES customers(id),
          name TEXT NOT NULL,
          status TEXT CHECK(status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_projects_customer ON projects(customer_id);
      `
    },
    {
      name: '006_create_floorplans_table',
      sql: `
        CREATE TABLE floorplans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER REFERENCES projects(id),
          name TEXT NOT NULL,
          image_path TEXT NOT NULL,
          sort_order INTEGER DEFAULT 0
        );
        CREATE INDEX idx_floorplans_project ON floorplans(project_id);
      `
    },
    {
      name: '007_create_placements_table',
      sql: `
        CREATE TABLE placements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          floorplan_id INTEGER REFERENCES floorplans(id),
          item_id INTEGER REFERENCES items(id),
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_placements_floorplan ON placements(floorplan_id);
        CREATE INDEX idx_placements_item ON placements(item_id);
      `
    }
  ];

  console.log('🔄 Running migrations...');
  
  for (const migration of migrations) {
    if (!appliedMigrations.includes(migration.name)) {
      await applyMigration(migration.name, migration.sql);
    } else {
      console.log(`⏭️  Skipping migration: ${migration.name} (already applied)`);
    }
  }
  
  console.log('✅ Migrations complete');
}

// Run migrations if this file is executed directly
if (import.meta.main) {
  await runMigrations();
  console.log('Done!');
}

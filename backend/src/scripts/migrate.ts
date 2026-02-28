import { getDb } from '../config/database.ts';

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
  getDb().execute(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

export async function getAppliedMigrations(): Promise<string[]> {
  const result = getDb().query<[string]>(`SELECT name FROM migrations ORDER BY id`);
  return result.map((row: [string]) => row[0]);
}

export async function applyMigration(name: string, sql: string): Promise<void> {
  try {
    const db = getDb();
    
    // For migration 025, we need to disable foreign keys temporarily
    // because we're recreating tables with foreign key references
    if (name === '025_remove_all_cascade_constraints') {
      db.query('PRAGMA foreign_keys = OFF');
    }
    
    db.execute(sql);
    db.query(`INSERT INTO migrations (name) VALUES (?)`, [name]);
    
    // Re-enable foreign keys if we disabled them
    if (name === '025_remove_all_cascade_constraints') {
      db.query('PRAGMA foreign_keys = ON');
    }
    
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
    },
    {
      name: '008_add_full_name_to_users',
      sql: `
        ALTER TABLE users ADD COLUMN full_name TEXT;
      `
    },
    {
      name: '009_create_item_variants_table',
      sql: `
        CREATE TABLE item_variants (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          style_name TEXT NOT NULL,
          model_number TEXT,
          price REAL NOT NULL,
          image_path TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_item_variants_item ON item_variants(item_id);
      `
    },
    {
      name: '010_create_item_addons_table',
      sql: `
        CREATE TABLE item_addons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          addon_item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
          slot_number INTEGER NOT NULL CHECK(slot_number BETWEEN 1 AND 4),
          is_required BOOLEAN NOT NULL DEFAULT false,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX idx_item_addons_parent ON item_addons(parent_item_id);
        CREATE INDEX idx_item_addons_addon ON item_addons(addon_item_id);
      `
    },
    {
      name: '011_add_base_model_number_to_items',
      sql: `
        ALTER TABLE items ADD COLUMN base_model_number TEXT;
        CREATE INDEX idx_items_base_model ON items(base_model_number);
      `
    },
    {
      name: '012_update_placements_for_variants',
      sql: `
        ALTER TABLE placements ADD COLUMN item_variant_id INTEGER REFERENCES item_variants(id);
        ALTER TABLE placements ADD COLUMN selected_addons TEXT;
        CREATE INDEX idx_placements_variant ON placements(item_variant_id);
      `
    },
    {
      name: '013_make_items_columns_nullable',
      sql: `
        -- SQLite doesn't support ALTER COLUMN, so we need to recreate the table
        CREATE TABLE items_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          category_id INTEGER REFERENCES categories(id),
          name TEXT NOT NULL,
          description TEXT,
          model_number TEXT,
          dimensions TEXT,
          price REAL DEFAULT 0,
          image_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          base_model_number TEXT
        );
        
        INSERT INTO items_new (id, category_id, name, description, model_number, dimensions, price, image_path, created_at, base_model_number)
        SELECT id, category_id, name, description, model_number, dimensions, COALESCE(price, 0), image_path, created_at, base_model_number
        FROM items;
        
        DROP TABLE items;
        
        ALTER TABLE items_new RENAME TO items;
        
        CREATE INDEX idx_items_category ON items(category_id);
        CREATE INDEX idx_items_base_model ON items(base_model_number);
      `
    },
    {
      name: '014_create_variant_addons_table',
      sql: `
        -- Add-ons are now per variant, not per item
        CREATE TABLE variant_addons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          variant_id INTEGER NOT NULL REFERENCES item_variants(id) ON DELETE CASCADE,
          addon_variant_id INTEGER NOT NULL REFERENCES item_variants(id) ON DELETE CASCADE,
          is_optional BOOLEAN NOT NULL DEFAULT true,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX idx_variant_addons_variant ON variant_addons(variant_id);
        CREATE INDEX idx_variant_addons_addon ON variant_addons(addon_variant_id);
      `
    },
    {
      name: '015_create_refresh_tokens_table',
      sql: `
        CREATE TABLE refresh_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          revoked_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
        CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);
        CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);
      `
    },
    {
      name: '016_add_is_active_to_catalog',
      sql: `
        ALTER TABLE categories ADD COLUMN is_active BOOLEAN DEFAULT true;
        ALTER TABLE items ADD COLUMN is_active BOOLEAN DEFAULT true;
        ALTER TABLE item_variants ADD COLUMN is_active BOOLEAN DEFAULT true;
        
        CREATE INDEX idx_categories_is_active ON categories(is_active);
        CREATE INDEX idx_items_is_active ON items(is_active);
        CREATE INDEX idx_item_variants_is_active ON item_variants(is_active);
      `
    },
    {
      name: '017_drop_item_addons_table',
      sql: `
        -- Drop indexes first
        DROP INDEX IF EXISTS idx_item_addons_parent;
        DROP INDEX IF EXISTS idx_item_addons_addon;
        -- Drop the table
        DROP TABLE IF EXISTS item_addons;
      `
    },
    {
      name: '018_remove_customers_table',
      sql: `
        -- Add customer fields to projects table
        ALTER TABLE projects ADD COLUMN customer_name TEXT NOT NULL DEFAULT 'Unknown Customer';
        ALTER TABLE projects ADD COLUMN customer_email TEXT;
        ALTER TABLE projects ADD COLUMN customer_phone TEXT;
        ALTER TABLE projects ADD COLUMN customer_address TEXT;
        
        -- Migrate existing customer data to projects
        UPDATE projects
        SET 
          customer_name = COALESCE(
            (SELECT c.name FROM customers c WHERE c.id = projects.customer_id),
            'Unknown Customer'
          ),
          customer_email = (
            SELECT c.email FROM customers c WHERE c.id = projects.customer_id
          ),
          customer_phone = (
            SELECT c.phone FROM customers c WHERE c.id = projects.customer_id
          ),
          customer_address = (
            SELECT c.address FROM customers c WHERE c.id = projects.customer_id
          );
        
        -- Recreate projects table without customer_id foreign key
        CREATE TABLE projects_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          status TEXT CHECK(status IN ('active', 'completed', 'cancelled')) DEFAULT 'active',
          customer_name TEXT NOT NULL,
          customer_email TEXT,
          customer_phone TEXT,
          customer_address TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Copy data to new table
        INSERT INTO projects_new (id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at)
        SELECT id, name, status, customer_name, customer_email, customer_phone, customer_address, created_at
        FROM projects;
        
        -- Drop old projects table and rename new one
        DROP TABLE projects;
        ALTER TABLE projects_new RENAME TO projects;
        
        -- Recreate indexes
        CREATE INDEX idx_projects_status ON projects(status);
        CREATE INDEX idx_projects_customer_name ON projects(customer_name);
        
        -- Drop customers table
        DROP INDEX IF EXISTS idx_customers_name;
        DROP TABLE IF EXISTS customers;
      `
    },
    {
      name: '019_add_unique_project_name_customer',
      sql: `
        -- Create unique index for project name + customer_name combination
        CREATE UNIQUE INDEX idx_projects_unique_name_customer ON projects(name, customer_name);
      `
    },
    {
      name: '020_create_floorplan_bom_entries',
      sql: `
        -- BOM entries table for per-floorplan bill of materials
        CREATE TABLE floorplan_bom_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          floorplan_id INTEGER NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
          item_id INTEGER NOT NULL REFERENCES items(id),
          variant_id INTEGER NOT NULL REFERENCES item_variants(id),
          parent_bom_entry_id INTEGER REFERENCES floorplan_bom_entries(id) ON DELETE CASCADE,
          name_snapshot TEXT NOT NULL,
          model_number_snapshot TEXT,
          price_snapshot REAL NOT NULL,
          picture_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX idx_bom_floorplan ON floorplan_bom_entries(floorplan_id);
        CREATE INDEX idx_bom_parent ON floorplan_bom_entries(parent_bom_entry_id);
        CREATE INDEX idx_bom_item ON floorplan_bom_entries(item_id);
        CREATE INDEX idx_bom_variant ON floorplan_bom_entries(variant_id);
        CREATE UNIQUE INDEX idx_bom_main_unique ON floorplan_bom_entries(floorplan_id, variant_id) 
          WHERE parent_bom_entry_id IS NULL;
      `
    },
    {
      name: '021_update_placements_for_bom',
      sql: `
        -- Add bom_entry_id to placements
        ALTER TABLE placements ADD COLUMN bom_entry_id INTEGER REFERENCES floorplan_bom_entries(id);
        CREATE INDEX idx_placements_bom ON placements(bom_entry_id);
      `
    },
    {
      name: '023_rename_bom_add_project',
      sql: `
        -- Rename floorplan_bom_entries to project_bom and add project_id + style_name
        
        -- Step 1: Create new table with correct structure
        CREATE TABLE project_bom (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          floorplan_id INTEGER NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
          item_id INTEGER NOT NULL REFERENCES items(id),
          variant_id INTEGER NOT NULL REFERENCES item_variants(id),
          parent_bom_id INTEGER REFERENCES project_bom(id) ON DELETE CASCADE,
          name_snapshot TEXT NOT NULL,
          style_name TEXT,
          model_number_snapshot TEXT,
          price_snapshot REAL NOT NULL,
          picture_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        -- Step 2: Migrate data from old table
        INSERT INTO project_bom (
          id, project_id, floorplan_id, item_id, variant_id, parent_bom_id,
          name_snapshot, style_name, model_number_snapshot, price_snapshot, picture_path,
          created_at, updated_at
        )
        SELECT 
          b.id,
          f.project_id,
          b.floorplan_id,
          b.item_id,
          b.variant_id,
          b.parent_bom_entry_id,
          b.name_snapshot,
          NULL,
          b.model_number_snapshot,
          b.price_snapshot,
          b.picture_path,
          b.created_at,
          b.updated_at
        FROM floorplan_bom_entries b
        JOIN floorplans f ON b.floorplan_id = f.id;
        
        -- Step 3: Backfill style_name from variants
        UPDATE project_bom 
        SET style_name = (
          SELECT iv.style_name 
          FROM item_variants iv 
          WHERE iv.id = project_bom.variant_id
        )
        WHERE style_name IS NULL;
        
        -- Step 4: Create indexes
        CREATE INDEX idx_project_bom_project ON project_bom(project_id);
        CREATE INDEX idx_project_bom_floorplan ON project_bom(floorplan_id);
        CREATE INDEX idx_project_bom_parent ON project_bom(parent_bom_id);
        CREATE INDEX idx_project_bom_item ON project_bom(item_id);
        CREATE INDEX idx_project_bom_variant ON project_bom(variant_id);
        CREATE UNIQUE INDEX idx_project_bom_unique ON project_bom(floorplan_id, variant_id) 
          WHERE parent_bom_id IS NULL;
        
        -- Step 5: Update placements table foreign key
        CREATE TABLE placements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bom_id INTEGER REFERENCES project_bom(id) ON DELETE CASCADE,
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        INSERT INTO placements_new (id, bom_id, x, y, width, height, created_at)
        SELECT id, bom_entry_id, x, y, width, height, created_at FROM placements;
        
        DROP TABLE placements;
        ALTER TABLE placements_new RENAME TO placements;
        
        CREATE INDEX idx_placements_bom ON placements(bom_id);
        
        -- Step 6: Drop old table
        DROP TABLE floorplan_bom_entries;
      `
    },
    {
      name: '024_rename_bom_snapshot_columns',
      sql: `
        -- Rename snapshot columns to remove '_snapshot' suffix
        ALTER TABLE project_bom RENAME COLUMN name_snapshot TO item_name;
        ALTER TABLE project_bom RENAME COLUMN model_number_snapshot TO model_number;
        ALTER TABLE project_bom RENAME COLUMN price_snapshot TO unit_price;
      `
    },
    {
      name: '025_allow_multiple_bom_entries_per_variant',
      sql: `
        -- Allow multiple BOM entries per variant
        -- This enables different placements of the same variant to have different addon configurations
        
        -- Drop the old unique index
        DROP INDEX IF EXISTS idx_project_bom_unique;
        
        -- Create a non-unique index for performance instead
        CREATE INDEX idx_project_bom_floorplan_variant ON project_bom(floorplan_id, variant_id) 
          WHERE parent_bom_id IS NULL;
      `
    },
    {
      name: '025_remove_all_cascade_constraints',
      sql: `
        -- Remove remaining ON DELETE CASCADE constraints
        -- Application will handle deletions manually
        
        -- 1. Fix item_variants table - remove CASCADE from item_id
        CREATE TABLE item_variants_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL REFERENCES items(id),
          style_name TEXT NOT NULL,
          model_number TEXT,
          price REAL NOT NULL,
          image_path TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          is_active BOOLEAN DEFAULT true
        );
        
        INSERT INTO item_variants_new SELECT * FROM item_variants;
        DROP TABLE item_variants;
        ALTER TABLE item_variants_new RENAME TO item_variants;
        
        CREATE INDEX idx_item_variants_item ON item_variants(item_id);
        CREATE INDEX idx_item_variants_is_active ON item_variants(is_active);
        
        -- 2. Fix refresh_tokens table - remove CASCADE from user_id
        CREATE TABLE refresh_tokens_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          token_hash TEXT NOT NULL UNIQUE,
          expires_at DATETIME NOT NULL,
          revoked_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        INSERT INTO refresh_tokens_new SELECT * FROM refresh_tokens;
        DROP TABLE refresh_tokens;
        ALTER TABLE refresh_tokens_new RENAME TO refresh_tokens;
        
        CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
        CREATE INDEX idx_refresh_tokens_token ON refresh_tokens(token_hash);
        
        -- 3. Fix placements table - remove CASCADE from bom_id
        CREATE TABLE placements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bom_id INTEGER REFERENCES project_bom(id),
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        INSERT INTO placements_new SELECT * FROM placements;
        DROP TABLE placements;
        ALTER TABLE placements_new RENAME TO placements;
        
        CREATE INDEX idx_placements_bom ON placements(bom_id);
      `
    },
    {
      name: '026_allow_null_item_id_in_project_bom',
      sql: `
        -- Allow item_id to be NULL in project_bom to preserve BOM history when items are deleted
        
        PRAGMA foreign_keys = OFF;
        
        CREATE TABLE project_bom_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          project_id INTEGER NOT NULL REFERENCES projects(id),
          floorplan_id INTEGER NOT NULL REFERENCES floorplans(id),
          item_id INTEGER REFERENCES items(id),
          variant_id INTEGER REFERENCES item_variants(id),
          parent_bom_id INTEGER REFERENCES project_bom(id),
          item_name TEXT NOT NULL,
          style_name TEXT,
          model_number TEXT,
          unit_price REAL NOT NULL,
          picture_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        INSERT INTO project_bom_new SELECT * FROM project_bom;
        DROP TABLE project_bom;
        ALTER TABLE project_bom_new RENAME TO project_bom;
        
        CREATE INDEX idx_project_bom_project ON project_bom(project_id);
        CREATE INDEX idx_project_bom_floorplan ON project_bom(floorplan_id);
        CREATE INDEX idx_project_bom_parent ON project_bom(parent_bom_id);
        CREATE INDEX idx_project_bom_item ON project_bom(item_id);
        CREATE INDEX idx_project_bom_variant ON project_bom(variant_id);
        CREATE INDEX idx_project_bom_floorplan_variant ON project_bom(floorplan_id, variant_id) 
          WHERE parent_bom_id IS NULL;
          
        PRAGMA foreign_keys = ON;
      `
    },
    {
      name: '027_add_placement_rotation',
      sql: `
        -- Add rotation column to placements table
        -- Allows placements to be rotated on the canvas (0-360 degrees)
        
        PRAGMA foreign_keys = OFF;
        
        CREATE TABLE placements_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bom_id INTEGER REFERENCES project_bom(id) ON DELETE CASCADE,
          x REAL NOT NULL,
          y REAL NOT NULL,
          width REAL NOT NULL,
          height REAL NOT NULL,
          rotation REAL NOT NULL DEFAULT 0.0 CHECK(rotation >= 0 AND rotation < 360),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        
        INSERT INTO placements_new (id, bom_id, x, y, width, height, rotation, created_at)
        SELECT id, bom_id, x, y, width, height, 0.0, created_at FROM placements;
        
        DROP TABLE placements;
        ALTER TABLE placements_new RENAME TO placements;
        
        CREATE INDEX idx_placements_bom ON placements(bom_id);
        
        PRAGMA foreign_keys = ON;
      `
    },
    {
      name: '028_add_invoice_settings_to_projects',
      sql: `
        -- Add invoice configuration columns to projects table
        ALTER TABLE projects ADD COLUMN discount_percentage REAL DEFAULT 0;
        ALTER TABLE projects ADD COLUMN discount_usd REAL DEFAULT 0;
        ALTER TABLE projects ADD COLUMN services_percentage REAL DEFAULT 0;
        ALTER TABLE projects ADD COLUMN services_usd REAL DEFAULT 0;
        ALTER TABLE projects ADD COLUMN local_currency_code TEXT DEFAULT 'PKR';
        ALTER TABLE projects ADD COLUMN exchange_rate REAL DEFAULT 0;
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

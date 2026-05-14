-- Migration 033: Project Versioning
-- Creates project_groups table, backfills existing projects, modifies projects table

-- Step 1: Create project_groups table with temporary source_project_id for backfill linking
CREATE TABLE IF NOT EXISTS project_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  tenant_id INTEGER NOT NULL,
  source_project_id INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
);

-- Step 2: Add new columns to projects (temporary nullable to allow backfill)
ALTER TABLE projects ADD COLUMN project_group_id INTEGER;
ALTER TABLE projects ADD COLUMN version_name TEXT DEFAULT 'v1';
ALTER TABLE projects ADD COLUMN google_exchange_rate REAL DEFAULT 1.0;

-- Step 3: Backfill: create one group per existing project with deduplication for duplicates
-- Uses ROW_NUMBER() to append (2), (3), etc. to duplicate names
INSERT INTO project_groups (
  name, customer_name, customer_email, customer_phone, customer_address, tenant_id, source_project_id
)
SELECT
  CASE
    WHEN row_num > 1 THEN name || ' (' || row_num || ')'
    ELSE name
  END,
  customer_name,
  customer_email,
  customer_phone,
  customer_address,
  tenant_id,
  id
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY name, customer_name, tenant_id
      ORDER BY id
    ) as row_num
  FROM projects
);

-- Step 4: Link projects to their new groups using source_project_id
UPDATE projects
SET project_group_id = (
  SELECT pg.id
  FROM project_groups pg
  WHERE pg.source_project_id = projects.id
);

-- Step 5: Recreate project_groups without temporary column, adding UNIQUE constraint
CREATE TABLE project_groups_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  customer_email TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  tenant_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  UNIQUE (name, customer_name, tenant_id)
);

INSERT INTO project_groups_new (
  id, name, customer_name, customer_email, customer_phone, customer_address, tenant_id, created_at
)
SELECT
  id, name, customer_name, customer_email, customer_phone, customer_address, tenant_id, created_at
FROM project_groups;

DROP TABLE project_groups;
ALTER TABLE project_groups_new RENAME TO project_groups;

-- Step 6: Recreate projects table without old customer/tenant columns
-- project_group_id now handles customer data; tenant_id stays on projects
CREATE TABLE projects_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_group_id INTEGER NOT NULL,
  version_name TEXT NOT NULL DEFAULT 'v1',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'completed', 'cancelled')),
  tenant_id INTEGER NOT NULL,
  discount_percentage REAL DEFAULT 0,
  discount_usd REAL DEFAULT 0,
  services_percentage REAL DEFAULT 0,
  services_usd REAL DEFAULT 0,
  local_currency_code TEXT,
  exchange_rate REAL DEFAULT 1.0,
  google_exchange_rate REAL DEFAULT 1.0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO projects_new (
  id, project_group_id, version_name, status, tenant_id,
  discount_percentage, discount_usd, services_percentage, services_usd,
  local_currency_code, exchange_rate, google_exchange_rate, created_at
)
SELECT
  id, project_group_id, COALESCE(version_name, 'v1'), status, tenant_id,
  discount_percentage, discount_usd, services_percentage, services_usd,
  local_currency_code, exchange_rate, google_exchange_rate, created_at
FROM projects;

DROP TABLE projects;
ALTER TABLE projects_new RENAME TO projects;

-- Step 7: Recreate indexes
CREATE INDEX idx_projects_group ON projects(project_group_id);
CREATE INDEX idx_projects_tenant ON projects(tenant_id);

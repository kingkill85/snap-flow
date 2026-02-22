-- Migration 023: Rename floorplan_bom_entries to project_bom and add project_id + style_name

-- Step 1: Create new table with correct structure
CREATE TABLE project_bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  floorplan_id INTEGER NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
  
  -- REFERENCES: For "Update from Catalog" feature only
  item_id INTEGER NOT NULL REFERENCES items(id),
  variant_id INTEGER NOT NULL REFERENCES item_variants(id),
  parent_bom_id INTEGER REFERENCES project_bom(id) ON DELETE CASCADE,
  
  -- SNAPSHOTS: Frozen display/pricing data (independent of catalog)
  name_snapshot TEXT NOT NULL,
  style_name TEXT,  -- Snapshot of variant.style_name (e.g., "Ivory White")
  model_number_snapshot TEXT,
  price_snapshot REAL NOT NULL,
  picture_path TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Migrate data from old table
-- We need to get project_id from floorplans
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
  NULL,  -- style_name will be backfilled later from variants
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

-- Unique constraint: only one main BOM entry per variant per floorplan
CREATE UNIQUE INDEX idx_project_bom_unique ON project_bom(floorplan_id, variant_id) 
  WHERE parent_bom_id IS NULL;

-- Step 5: Update placements table foreign key
-- SQLite doesn't support ALTER TABLE for foreign keys, so we need to recreate
CREATE TABLE placements_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER REFERENCES project_bom(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL
);

INSERT INTO placements_new (id, bom_id, x, y, width, height)
SELECT id, bom_entry_id, x, y, width, height FROM placements;

DROP TABLE placements;
ALTER TABLE placements_new RENAME TO placements;

CREATE INDEX idx_placements_bom ON placements(bom_id);

-- Step 6: Drop old table
DROP TABLE floorplan_bom_entries;

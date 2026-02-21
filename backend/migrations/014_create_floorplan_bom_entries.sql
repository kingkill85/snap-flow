-- Migration 014: Create floorplan_bom_entries table for BOM
-- BOM entries are per-floorplan, storing references + snapshots

CREATE TABLE floorplan_bom_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floorplan_id INTEGER NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
  
  -- REFERENCES: For "Update from Catalog" feature only
  item_id INTEGER NOT NULL REFERENCES items(id),
  variant_id INTEGER NOT NULL REFERENCES item_variants(id),
  parent_bom_entry_id INTEGER REFERENCES floorplan_bom_entries(id) ON DELETE CASCADE,
  
  -- SNAPSHOTS: Frozen display/pricing data (independent of catalog)
  name_snapshot TEXT NOT NULL,
  model_number_snapshot TEXT,
  price_snapshot REAL NOT NULL,
  picture_path TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_bom_floorplan ON floorplan_bom_entries(floorplan_id);
CREATE INDEX idx_bom_parent ON floorplan_bom_entries(parent_bom_entry_id);
CREATE INDEX idx_bom_item ON floorplan_bom_entries(item_id);
CREATE INDEX idx_bom_variant ON floorplan_bom_entries(variant_id);

-- Unique constraint: only one main BOM entry per variant per floorplan
-- (parent_bom_entry_id IS NULL means it's a main item, not an addon)
CREATE UNIQUE INDEX idx_bom_main_unique ON floorplan_bom_entries(floorplan_id, variant_id) 
  WHERE parent_bom_entry_id IS NULL;

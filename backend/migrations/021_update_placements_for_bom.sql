-- Migration 015: Update placements table to reference BOM entries
-- Remove old columns, add bom_entry_id reference

-- Step 1: Add new column
ALTER TABLE placements ADD COLUMN bom_entry_id INTEGER REFERENCES floorplan_bom_entries(id);

-- Step 2: Create index on new column
CREATE INDEX idx_placements_bom ON placements(bom_entry_id);

-- Step 3: Remove old columns (will be done in backfill migration)
-- We keep them for now to allow data migration

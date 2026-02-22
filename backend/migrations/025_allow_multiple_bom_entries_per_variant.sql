-- Migration: Allow multiple BOM entries per variant
-- This enables different placements of the same variant to have different addon configurations
--
-- Previously, the unique constraint prevented this, causing all placements of the same
-- variant to share addons. Now each placement gets its own BOM entry.

-- Drop the old unique index
DROP INDEX IF EXISTS idx_project_bom_unique;

-- Create a non-unique index for performance instead
CREATE INDEX idx_project_bom_floorplan_variant ON project_bom(floorplan_id, variant_id) 
  WHERE parent_bom_id IS NULL;

-- Create item_types table
CREATE TABLE IF NOT EXISTS item_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  sort_order INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default Zigbee type
INSERT INTO item_types (name, abbreviation, color, sort_order)
VALUES ('Zigbee', 'ZB', '#3b82f6', 1);

-- Add type_id to items, default all existing items to Zigbee (id=1)
ALTER TABLE items ADD COLUMN type_id INTEGER DEFAULT 1;

-- Add item_type_name to project_bom for snapshot
ALTER TABLE project_bom ADD COLUMN item_type_name TEXT;

-- Backfill existing BOM entries with 'Zigbee'
UPDATE project_bom SET item_type_name = 'Zigbee' WHERE item_type_name IS NULL;

-- Create project_item_types junction table
CREATE TABLE IF NOT EXISTS project_item_types (
  project_id INTEGER NOT NULL,
  item_type_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, item_type_id)
);

-- Link all existing projects to the Zigbee type
INSERT INTO project_item_types (project_id, item_type_id)
SELECT id, 1 FROM projects;

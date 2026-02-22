-- Migration 024: Add created_at column to placements
-- This fixes the missing column from migration 023
-- Note: This will fail on fresh DBs where 023 already created the column
-- In that case, manually mark this migration as applied:
-- INSERT INTO migrations (name) VALUES ('024_add_created_at_to_placements');

ALTER TABLE placements ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

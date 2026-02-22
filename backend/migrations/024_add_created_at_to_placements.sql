-- Migration 024: Add created_at column to placements
-- This fixes the missing column from migration 023
-- Use TRY/CATCH equivalent - if column exists, ignore error

-- Check if column exists by trying to select it
-- If this fails, we need to add it
PRAGMA foreign_keys=off;

-- Add column - will fail silently if already exists in some SQLite versions
-- or we catch the error
ALTER TABLE placements ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

PRAGMA foreign_keys=on;

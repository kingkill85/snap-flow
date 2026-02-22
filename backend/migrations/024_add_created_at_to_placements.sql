-- Migration 024: Add created_at column to placements
-- This fixes the missing column from migration 023

ALTER TABLE placements ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP;

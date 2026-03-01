-- Create app_settings table for global configuration
-- Used to store settings that should be shared across all users
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Initialize last_sync_timestamp for image cache busting
-- This timestamp is updated after every Excel sync operation
-- and used by all clients to bust image caches
INSERT OR REPLACE INTO app_settings (key, value) 
VALUES ('last_sync_timestamp', '0');

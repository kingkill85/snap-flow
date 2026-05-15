-- Migration 034: OAuth 2.1 tables for remote MCP server
-- Adds two tables: oauth_clients (registered MCP clients) and oauth_auth_codes (short-lived auth codes)

CREATE TABLE IF NOT EXISTS oauth_clients (
  id            TEXT PRIMARY KEY,
  client_secret TEXT,
  redirect_uris TEXT NOT NULL,
  client_name   TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS oauth_auth_codes (
  code           TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL,
  user_id        INTEGER NOT NULL,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope          TEXT,
  expires_at     DATETIME NOT NULL,
  consumed_at    DATETIME,
  FOREIGN KEY (client_id) REFERENCES oauth_clients(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)   REFERENCES users(id)         ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_expires ON oauth_auth_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_oauth_codes_client  ON oauth_auth_codes(client_id);

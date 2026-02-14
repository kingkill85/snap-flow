import { getDb } from '../config/database.ts';
import { encodeBase64 } from '../utils/encoding.ts';

/**
 * Refresh token service
 * Handles creation, verification, and revocation of refresh tokens
 */

// Refresh tokens expire in 7 days
// Long-lived tokens used to obtain new access tokens
// Users must re-login after this period
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

export interface RefreshToken {
  id: number;
  user_id: number;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

/**
 * Generate a cryptographically secure random token
 */
function generateSecureToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return encodeBase64(array);
}

/**
 * Hash a token using SHA-256
 * We store the hash, not the raw token
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Create a new refresh token for a user
 * Returns the raw token (which must be sent to the client)
 */
export async function createRefreshToken(userId: number): Promise<string> {
  const rawToken = generateSecureToken();
  const tokenHash = await hashToken(rawToken);
  
  // Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
  
  // Insert into database
  getDb().query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );
  
  return rawToken;
}

/**
 * Verify a refresh token
 * Returns the user ID if valid, null otherwise
 */
export async function verifyRefreshToken(token: string): Promise<number | null> {
  const tokenHash = await hashToken(token);
  
  const result = getDb().query<[
    number,
    string,
    string | null,
    string
  ]>(
    `SELECT user_id, expires_at, revoked_at, created_at 
     FROM refresh_tokens 
     WHERE token_hash = ?`,
    [tokenHash]
  );
  
  if (result.length === 0) {
    return null;
  }
  
  const [userId, expiresAt, revokedAt] = result[0];
  
  // Check if token is expired
  if (new Date(expiresAt) < new Date()) {
    return null;
  }
  
  // Check if token is revoked
  if (revokedAt) {
    return null;
  }
  
  return userId;
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token);
  
  const result = getDb().query(
    `UPDATE refresh_tokens 
     SET revoked_at = CURRENT_TIMESTAMP 
     WHERE token_hash = ? AND revoked_at IS NULL`,
    [tokenHash]
  );
  
  return true;
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserTokens(userId: number): Promise<void> {
  getDb().query(
    `UPDATE refresh_tokens 
     SET revoked_at = CURRENT_TIMESTAMP 
     WHERE user_id = ? AND revoked_at IS NULL`,
    [userId]
  );
}

/**
 * Clean up expired tokens (can be called periodically)
 */
export function cleanupExpiredTokens(): void {
  getDb().query(
    `DELETE FROM refresh_tokens 
     WHERE expires_at < datetime('now', '-7 days') 
     OR (revoked_at IS NOT NULL AND revoked_at < datetime('now', '-7 days'))`
  );
}

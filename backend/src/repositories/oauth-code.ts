import { getDb } from '../config/database.ts';

export interface OAuthAuthCode {
  code: string;
  client_id: string;
  user_id: number;
  redirect_uri: string;
  code_challenge: string;
  scope: string | null;
  expires_at: string;
  consumed_at: string | null;
}

export interface CreateOAuthCodeDTO {
  client_id: string;
  user_id: number;
  redirect_uri: string;
  code_challenge: string;
  scope?: string;
  ttl_seconds?: number;
}

const DEFAULT_TTL_SECONDS = 60;

function generateCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class OAuthCodeRepository {
  create(dto: CreateOAuthCodeDTO): Promise<OAuthAuthCode> {
    const code = generateCode();
    const ttl = dto.ttl_seconds ?? DEFAULT_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
    getDb().query(
      `INSERT INTO oauth_auth_codes (code, client_id, user_id, redirect_uri, code_challenge, scope, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, dto.client_id, dto.user_id, dto.redirect_uri, dto.code_challenge, dto.scope ?? null, expiresAt]
    );
    return Promise.resolve({
      code, client_id: dto.client_id, user_id: dto.user_id,
      redirect_uri: dto.redirect_uri, code_challenge: dto.code_challenge,
      scope: dto.scope ?? null, expires_at: expiresAt, consumed_at: null,
    });
  }

  consume(code: string): Promise<OAuthAuthCode | null> {
    const rows = getDb().query<[string, string, number, string, string, string | null, string, string | null]>(
      `SELECT code, client_id, user_id, redirect_uri, code_challenge, scope, expires_at, consumed_at
       FROM oauth_auth_codes WHERE code = ?`,
      [code]
    );
    if (rows.length === 0) return Promise.resolve(null);
    const [c, cid, uid, ruri, chal, scope, exp, consumed] = rows[0];
    if (consumed !== null) return Promise.resolve(null);
    if (new Date(exp).getTime() <= Date.now()) return Promise.resolve(null);
    getDb().query(`UPDATE oauth_auth_codes SET consumed_at = ? WHERE code = ?`, [new Date().toISOString(), c]);
    return Promise.resolve({
      code: c, client_id: cid, user_id: uid, redirect_uri: ruri, code_challenge: chal,
      scope, expires_at: exp, consumed_at: new Date().toISOString(),
    });
  }

  deleteExpired(): Promise<void> {
    getDb().query(
      `DELETE FROM oauth_auth_codes WHERE expires_at <= ? OR consumed_at IS NOT NULL`,
      [new Date().toISOString()]
    );
    return Promise.resolve();
  }
}

export const oauthCodeRepository = new OAuthCodeRepository();

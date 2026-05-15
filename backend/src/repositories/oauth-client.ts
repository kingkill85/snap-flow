import { getDb } from '../config/database.ts';
import { hashClientSecret, timingSafeEqual } from '../services/oauth/client-secret.ts';

export interface OAuthClient {
  id: string;
  client_secret_hash: string | null;
  redirect_uris: string[];
  client_name: string | null;
  created_at: string;
}

export interface CreateOAuthClientDTO {
  redirect_uris: string[];
  client_name?: string;
  client_secret_hash?: string;
}

function generateClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class OAuthClientRepository {
  create(dto: CreateOAuthClientDTO): Promise<OAuthClient> {
    const id = generateClientId();
    const redirectUrisJson = JSON.stringify(dto.redirect_uris);
    getDb().query(
      `INSERT INTO oauth_clients (id, client_secret, redirect_uris, client_name)
       VALUES (?, ?, ?, ?)`,
      [id, dto.client_secret_hash ?? null, redirectUrisJson, dto.client_name ?? null],
    );
    return Promise.resolve({
      id,
      client_secret_hash: dto.client_secret_hash ?? null,
      redirect_uris: dto.redirect_uris,
      client_name: dto.client_name ?? null,
      created_at: new Date().toISOString(),
    });
  }

  findById(id: string): Promise<OAuthClient | null> {
    const rows = getDb().query<[string, string | null, string, string | null, string]>(
      `SELECT id, client_secret, redirect_uris, client_name, created_at
       FROM oauth_clients WHERE id = ?`,
      [id],
    );
    if (rows.length === 0) return Promise.resolve(null);
    const [rid, secretHash, redirectsJson, name, createdAt] = rows[0];
    return Promise.resolve({
      id: rid,
      client_secret_hash: secretHash,
      redirect_uris: JSON.parse(redirectsJson),
      client_name: name,
      created_at: createdAt,
    });
  }

  async verifySecret(clientId: string, rawSecret: string): Promise<boolean> {
    const client = await this.findById(clientId);
    if (!client || client.client_secret_hash === null) return false;
    const computed = await hashClientSecret(rawSecret);
    return timingSafeEqual(client.client_secret_hash, computed);
  }
}

export const oauthClientRepository = new OAuthClientRepository();

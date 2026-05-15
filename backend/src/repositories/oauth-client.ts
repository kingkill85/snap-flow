import { getDb } from '../config/database.ts';

export interface OAuthClient {
  id: string;
  client_secret: string | null;
  redirect_uris: string[];
  client_name: string | null;
  created_at: string;
}

export interface CreateOAuthClientDTO {
  redirect_uris: string[];
  client_name?: string;
  client_secret?: string;
}

function generateClientId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export class OAuthClientRepository {
  create(dto: CreateOAuthClientDTO): Promise<OAuthClient> {
    const id = generateClientId();
    const redirectUrisJson = JSON.stringify(dto.redirect_uris);
    getDb().query(
      `INSERT INTO oauth_clients (id, client_secret, redirect_uris, client_name)
       VALUES (?, ?, ?, ?)`,
      [id, dto.client_secret ?? null, redirectUrisJson, dto.client_name ?? null]
    );
    return Promise.resolve({
      id,
      client_secret: dto.client_secret ?? null,
      redirect_uris: dto.redirect_uris,
      client_name: dto.client_name ?? null,
      created_at: new Date().toISOString(),
    });
  }

  findById(id: string): Promise<OAuthClient | null> {
    const rows = getDb().query<[string, string | null, string, string | null, string]>(
      `SELECT id, client_secret, redirect_uris, client_name, created_at
       FROM oauth_clients WHERE id = ?`,
      [id]
    );
    if (rows.length === 0) return Promise.resolve(null);
    const [rid, secret, redirectsJson, name, createdAt] = rows[0];
    return Promise.resolve({
      id: rid,
      client_secret: secret,
      redirect_uris: JSON.parse(redirectsJson),
      client_name: name,
      created_at: createdAt,
    });
  }
}

export const oauthClientRepository = new OAuthClientRepository();

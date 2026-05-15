# Remote MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a spec-compliant remote MCP server (OAuth 2.1 + 4 read-only tools) inside the existing SnapFlow backend so Claude.ai / Claude Desktop / Claude Code can connect via custom-connector URL after a one-time OAuth login.

**Architecture:** Two new Hono mount points (`/oauth/*` and `/mcp`) on the existing app. MCP tools dispatch through the existing REST routes in-process via `app.fetch` — no business-logic duplication, no auth bypass. Two new tiny tables (`oauth_clients`, `oauth_auth_codes`). Access tokens reuse existing JWT format; refresh tokens reuse the existing `refresh_tokens` table.

**Tech Stack:** Deno + Hono (backend), `@modelcontextprotocol/sdk` (MCP server, npm via Deno `npm:` specifier), `djwt` (existing JWT lib), Web Crypto (PKCE S256), Zod (schemas), in-memory SQLite (tests).

**Spec:** `docs/superpowers/specs/2026-05-15-mcp-remote-server-design.md`

---

## File Structure

### New files

```
backend/
├── migrations/
│   └── 034_oauth_clients.sql
└── src/
    ├── repositories/
    │   ├── oauth-client.ts
    │   └── oauth-code.ts
    ├── services/
    │   ├── oauth/
    │   │   ├── clients.ts        # registration logic
    │   │   ├── auth-codes.ts     # issue/consume codes, PKCE verify
    │   │   ├── metadata.ts       # build well-known JSON docs
    │   │   └── pkce.ts           # PKCE S256 helpers
    │   └── mcp/
    │       ├── server.ts         # MCP Server instance + tool registry
    │       ├── dispatcher.ts     # in-process app.fetch wrapper
    │       └── tools/
    │           ├── list-projects.ts
    │           ├── get-project.ts
    │           ├── get-project-total.ts
    │           └── search-items.ts
    └── routes/
        ├── oauth.ts              # /oauth/{register,authorize,token}
        ├── oauth-consent.ts      # GET+POST /oauth/consent (HTML)
        ├── well-known.ts         # /.well-known/oauth-* metadata
        └── mcp.ts                # /mcp Streamable HTTP

backend/tests/
├── routes/
│   ├── oauth_test.ts
│   ├── oauth_consent_test.ts
│   └── well_known_test.ts
└── mcp/
    ├── tools_test.ts
    └── tenant_isolation_test.ts

frontend/src/pages/
└── Login.tsx                     # modify: honor ?return_to=
frontend/tests/
└── Login.test.tsx                # add: return_to behavior
```

### Modified files

- `backend/src/main.ts` — mount `oauthRoutes`, `mcpRoutes`, `wellKnownRoutes`, `oauthConsentRoutes`
- `backend/src/routes/auth.ts` — set `oauth_session` cookie on successful login
- `backend/src/config/env.ts` — add `OAUTH_SESSION_SECRET` if not present (or reuse `JWT_SECRET`)
- `frontend/src/pages/Login.tsx` — read `return_to` query and navigate there on success

### Pattern notes (read these before implementing)

- **Repositories** use a class with an exported singleton instance (see `backend/src/repositories/project.ts`). Follow that.
- **Migrations** live at `backend/migrations/NNN_name.sql` and are picked up automatically by `runMigrations()` (see `backend/src/scripts/migrate.ts`).
- **Tests** use `setupTestDatabase()` / `clearDatabase()` from `backend/tests/test-utils.ts`. No running server needed — call `app.fetch(new Request(...))` directly.
- **JWT issuance**: reuse `generateToken()` from `backend/src/services/jwt.ts`.
- **Refresh tokens**: reuse `createRefreshToken()` and `verifyRefreshToken()` from `backend/src/services/refresh-token.ts`. Existing TTL is 7 days; we adopt that (spec mentioned 30, but consistency with existing infra wins — refresh-rotation is what matters, not absolute TTL).

---

## Phase 1 — Database + Repositories

### Task 1: Migration for oauth_clients and oauth_auth_codes tables

**Files:**
- Create: `backend/migrations/034_oauth_clients.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Run migration in-place to verify it applies**

```bash
cd backend && deno task migrate
```

Expected: prints `Applied migration: 034_oauth_clients.sql` (or already-applied if rerun).

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/034_oauth_clients.sql
git commit -m "feat(oauth): add oauth_clients and oauth_auth_codes tables"
```

---

### Task 2: oauth-client repository

**Files:**
- Create: `backend/src/repositories/oauth-client.ts`
- Test: `backend/tests/repositories/oauth_client_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/repositories/oauth_client_test.ts
import { assertEquals, assertNotEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';

Deno.test('oauth-client repository', async (t) => {
  await setupTestDatabase();

  await t.step('create returns client with id and stores redirect_uris', async () => {
    await clearDatabase();
    const created = await oauthClientRepository.create({
      redirect_uris: ['https://claude.ai/oauth/callback'],
      client_name: 'Claude',
    });
    assertNotEquals(created.id, '');
    assertEquals(created.redirect_uris, ['https://claude.ai/oauth/callback']);
    assertEquals(created.client_name, 'Claude');
  });

  await t.step('findById returns stored client', async () => {
    await clearDatabase();
    const created = await oauthClientRepository.create({
      redirect_uris: ['https://x/cb'],
    });
    const found = await oauthClientRepository.findById(created.id);
    assertEquals(found?.id, created.id);
    assertEquals(found?.redirect_uris, ['https://x/cb']);
  });

  await t.step('findById returns null for unknown id', async () => {
    await clearDatabase();
    const found = await oauthClientRepository.findById('nope');
    assertEquals(found, null);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/repositories/oauth_client_test.ts
```

Expected: FAIL — `Module not found "../../src/repositories/oauth-client.ts"`.

- [ ] **Step 3: Implement the repository**

```ts
// backend/src/repositories/oauth-client.ts
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
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && deno test --allow-all tests/repositories/oauth_client_test.ts
```

Expected: all 3 steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/oauth-client.ts backend/tests/repositories/oauth_client_test.ts
git commit -m "feat(oauth): add OAuthClientRepository with create/findById"
```

---

### Task 3: oauth-code repository

**Files:**
- Create: `backend/src/repositories/oauth-code.ts`
- Test: `backend/tests/repositories/oauth_code_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/repositories/oauth_code_test.ts
import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthCodeRepository } from '../../src/repositories/oauth-code.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';

async function seedUserAndClient() {
  const tenant = await tenantRepository.create({ name: 'T', is_active: true });
  const user = await userRepository.create({
    email: 't@t.t', password_hash: 'x', role: 'user',
    full_name: 'T', tenant_id: tenant.id, is_active: true,
  });
  const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
  return { user, client };
}

Deno.test('oauth-code repository', async (t) => {
  await setupTestDatabase();

  await t.step('create stores code with expires_at in the future', async () => {
    await clearDatabase();
    const { user, client } = await seedUserAndClient();
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: 'abc', scope: 'read',
    });
    assert(created.code.length > 0);
    assert(new Date(created.expires_at).getTime() > Date.now());
  });

  await t.step('consume returns code and marks consumed', async () => {
    await clearDatabase();
    const { user, client } = await seedUserAndClient();
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: 'abc',
    });
    const consumed = await oauthCodeRepository.consume(created.code);
    assertEquals(consumed?.user_id, user.id);
    const again = await oauthCodeRepository.consume(created.code);
    assertEquals(again, null);
  });

  await t.step('consume returns null for expired code', async () => {
    await clearDatabase();
    const { user, client } = await seedUserAndClient();
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: 'abc',
      ttl_seconds: -1,
    });
    const consumed = await oauthCodeRepository.consume(created.code);
    assertEquals(consumed, null);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/repositories/oauth_code_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the repository**

```ts
// backend/src/repositories/oauth-code.ts
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
  /** Seconds until expiry. Default 60. Negative values produce already-expired codes (for tests). */
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

  /** Atomically reads and marks the code consumed. Returns null if missing/expired/already consumed. */
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
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && deno test --allow-all tests/repositories/oauth_code_test.ts
```

Expected: all 3 steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/repositories/oauth-code.ts backend/tests/repositories/oauth_code_test.ts
git commit -m "feat(oauth): add OAuthCodeRepository with create/consume/deleteExpired"
```

---

## Phase 2 — OAuth Services

### Task 4: PKCE S256 helpers

**Files:**
- Create: `backend/src/services/oauth/pkce.ts`
- Test: `backend/tests/services/oauth/pkce_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/oauth/pkce_test.ts
import { assertEquals } from '@std/assert';
import { verifyS256 } from '../../../src/services/oauth/pkce.ts';

Deno.test('PKCE S256 verification', async (t) => {
  await t.step('verifies a known correct verifier/challenge pair (RFC 7636 example)', async () => {
    // From RFC 7636 Appendix B
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    assertEquals(await verifyS256(verifier, challenge), true);
  });

  await t.step('rejects mismatched pair', async () => {
    assertEquals(await verifyS256('wrong', 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'), false);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/services/oauth/pkce_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement PKCE helpers**

```ts
// backend/src/services/oauth/pkce.ts

/** Base64url-encode a Uint8Array (no padding). */
function base64UrlEncode(bytes: Uint8Array): string {
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify a PKCE S256 challenge against a verifier per RFC 7636.
 * challenge == base64url(SHA-256(verifier))
 */
export async function verifyS256(verifier: string, challenge: string): Promise<boolean> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const expected = base64UrlEncode(new Uint8Array(hash));
  return expected === challenge;
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && deno test --allow-all tests/services/oauth/pkce_test.ts
```

Expected: both steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/oauth/pkce.ts backend/tests/services/oauth/pkce_test.ts
git commit -m "feat(oauth): add PKCE S256 verifier (RFC 7636)"
```

---

### Task 5: OAuth metadata documents

**Files:**
- Create: `backend/src/services/oauth/metadata.ts`
- Test: `backend/tests/services/oauth/metadata_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/services/oauth/metadata_test.ts
import { assertEquals } from '@std/assert';
import { buildAuthServerMetadata, buildProtectedResourceMetadata } from '../../../src/services/oauth/metadata.ts';

Deno.test('OAuth metadata', async (t) => {
  await t.step('authorization server metadata contains required fields', () => {
    const m = buildAuthServerMetadata('https://snapflow.example.com');
    assertEquals(m.issuer, 'https://snapflow.example.com');
    assertEquals(m.authorization_endpoint, 'https://snapflow.example.com/oauth/authorize');
    assertEquals(m.token_endpoint, 'https://snapflow.example.com/oauth/token');
    assertEquals(m.registration_endpoint, 'https://snapflow.example.com/oauth/register');
    assertEquals(m.code_challenge_methods_supported, ['S256']);
    assertEquals(m.grant_types_supported, ['authorization_code', 'refresh_token']);
    assertEquals(m.response_types_supported, ['code']);
  });

  await t.step('protected resource metadata points at auth server', () => {
    const m = buildProtectedResourceMetadata('https://snapflow.example.com');
    assertEquals(m.resource, 'https://snapflow.example.com/mcp');
    assertEquals(m.authorization_servers, ['https://snapflow.example.com']);
    assertEquals(m.bearer_methods_supported, ['header']);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/services/oauth/metadata_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement metadata builders**

```ts
// backend/src/services/oauth/metadata.ts

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  scopes_supported: string[];
}

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: string[];
  scopes_supported: string[];
}

export function buildAuthServerMetadata(baseUrl: string): AuthServerMetadata {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    registration_endpoint: `${baseUrl}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: ['read'],
  };
}

export function buildProtectedResourceMetadata(baseUrl: string): ProtectedResourceMetadata {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ['header'],
    scopes_supported: ['read'],
  };
}
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && deno test --allow-all tests/services/oauth/metadata_test.ts
```

Expected: both steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/oauth/metadata.ts backend/tests/services/oauth/metadata_test.ts
git commit -m "feat(oauth): add RFC 8414 / RFC 9728 metadata builders"
```

---

## Phase 3 — OAuth HTTP Endpoints

### Task 6: /.well-known metadata endpoints

**Files:**
- Create: `backend/src/routes/well-known.ts`
- Test: `backend/tests/routes/well_known_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/routes/well_known_test.ts
import { assertEquals } from '@std/assert';
import { Hono } from 'hono';
import { wellKnownRoutes } from '../../src/routes/well-known.ts';

function buildApp(): Hono {
  const app = new Hono();
  app.route('/', wellKnownRoutes);
  return app;
}

Deno.test('well-known metadata routes', async (t) => {
  await t.step('GET /.well-known/oauth-authorization-server returns JSON metadata', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://snapflow.example.com/.well-known/oauth-authorization-server'));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('content-type')?.startsWith('application/json'), true);
    const body = await res.json();
    assertEquals(body.issuer, 'https://snapflow.example.com');
  });

  await t.step('GET /.well-known/oauth-protected-resource returns JSON metadata', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://snapflow.example.com/.well-known/oauth-protected-resource'));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.resource, 'https://snapflow.example.com/mcp');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/routes/well_known_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

```ts
// backend/src/routes/well-known.ts
import { Hono } from 'hono';
import { buildAuthServerMetadata, buildProtectedResourceMetadata } from '../services/oauth/metadata.ts';

export const wellKnownRoutes = new Hono();

/** Derive the base URL (scheme + host) from the incoming request. */
function baseUrlOf(req: Request): string {
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

wellKnownRoutes.get('/.well-known/oauth-authorization-server', (c) => {
  return c.json(buildAuthServerMetadata(baseUrlOf(c.req.raw)));
});

wellKnownRoutes.get('/.well-known/oauth-protected-resource', (c) => {
  return c.json(buildProtectedResourceMetadata(baseUrlOf(c.req.raw)));
});

export default wellKnownRoutes;
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && deno test --allow-all tests/routes/well_known_test.ts
```

Expected: both steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/well-known.ts backend/tests/routes/well_known_test.ts
git commit -m "feat(oauth): add /.well-known metadata endpoints"
```

---

### Task 7: POST /oauth/register (Dynamic Client Registration)

**Files:**
- Create: `backend/src/routes/oauth.ts` (registers DCR; later tasks add more endpoints)
- Test: `backend/tests/routes/oauth_test.ts` (registers DCR test; later tasks add more)

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/routes/oauth_test.ts
import { assertEquals, assert } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthRoutes } from '../../src/routes/oauth.ts';

function buildApp(): Hono {
  const app = new Hono();
  app.route('/oauth', oauthRoutes);
  return app;
}

Deno.test('POST /oauth/register', async (t) => {
  await setupTestDatabase();

  await t.step('returns 201 with client_id when given valid body', async () => {
    await clearDatabase();
    const app = buildApp();
    const res = await app.fetch(new Request('https://x/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
        client_name: 'Claude',
      }),
    }));
    assertEquals(res.status, 201);
    const body = await res.json();
    assert(typeof body.client_id === 'string' && body.client_id.length > 0);
    assertEquals(body.redirect_uris, ['https://claude.ai/api/mcp/auth_callback']);
    assertEquals(body.client_name, 'Claude');
    assertEquals(body.token_endpoint_auth_method, 'none');
  });

  await t.step('rejects missing redirect_uris', async () => {
    const app = buildApp();
    const res = await app.fetch(new Request('https://x/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'X' }),
    }));
    assertEquals(res.status, 400);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement /oauth/register**

```ts
// backend/src/routes/oauth.ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { oauthClientRepository } from '../repositories/oauth-client.ts';

export const oauthRoutes = new Hono();

const registerSchema = z.object({
  redirect_uris: z.array(z.string().url()).min(1),
  client_name: z.string().optional(),
  // Spec allows more fields; we accept and ignore them.
}).passthrough();

oauthRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
  const { redirect_uris, client_name } = c.req.valid('json');
  const client = await oauthClientRepository.create({
    redirect_uris,
    client_name,
  });
  return c.json({
    client_id: client.id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: client.redirect_uris,
    client_name: client.client_name,
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  }, 201);
});

export default oauthRoutes;
```

- [ ] **Step 4: Run test, verify it passes**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: both steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/oauth.ts backend/tests/routes/oauth_test.ts
git commit -m "feat(oauth): add POST /oauth/register (Dynamic Client Registration)"
```

---

### Task 8: Browser session bridge — set oauth_session cookie on login

**Files:**
- Modify: `backend/src/routes/auth.ts` (login handler)
- Create: `backend/src/services/oauth/session-cookie.ts`
- Test: `backend/tests/services/oauth/session_cookie_test.ts`
- Test: `backend/tests/routes/auth_session_cookie_test.ts`

- [ ] **Step 1: Write the failing service test**

```ts
// backend/tests/services/oauth/session_cookie_test.ts
import { assertEquals, assert } from '@std/assert';
import { signSessionCookie, verifySessionCookie } from '../../../src/services/oauth/session-cookie.ts';

Deno.test('oauth session cookie', async (t) => {
  await t.step('sign produces a string and verify returns the same userId', async () => {
    const cookie = await signSessionCookie(42);
    assert(cookie.length > 0);
    const userId = await verifySessionCookie(cookie);
    assertEquals(userId, 42);
  });

  await t.step('verify returns null for tampered cookie', async () => {
    const cookie = await signSessionCookie(42);
    const tampered = cookie.slice(0, -1) + (cookie.slice(-1) === 'a' ? 'b' : 'a');
    assertEquals(await verifySessionCookie(tampered), null);
  });

  await t.step('verify returns null for garbage', async () => {
    assertEquals(await verifySessionCookie('garbage'), null);
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/services/oauth/session_cookie_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement signed cookie service**

```ts
// backend/src/services/oauth/session-cookie.ts
import { env } from '../../config/env.ts';

/**
 * Short-lived signed cookie used only by /oauth/authorize and /oauth/consent
 * to identify the logged-in SnapFlow user from a browser navigation.
 *
 * Format: base64url(JSON.stringify({uid, exp})) "." base64url(HMAC-SHA256(payload))
 */

const TTL_SECONDS = 60 * 60; // 1 hour

async function getKey(): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function signSessionCookie(userId: number): Promise<string> {
  const payload = { uid: userId, exp: Math.floor(Date.now() / 1000) + TTL_SECONDS };
  const payloadStr = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadStr));
  return `${payloadStr}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySessionCookie(cookie: string): Promise<number | null> {
  const parts = cookie.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, sigStr] = parts;
  try {
    const key = await getKey();
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sigStr),
      new TextEncoder().encode(payloadStr)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadStr))) as { uid: number; exp: number };
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload.uid;
  } catch {
    return null;
  }
}

export const OAUTH_SESSION_COOKIE_NAME = 'oauth_session';
export const OAUTH_SESSION_MAX_AGE = TTL_SECONDS;
```

- [ ] **Step 4: Run service test, verify it passes**

```bash
cd backend && deno test --allow-all tests/services/oauth/session_cookie_test.ts
```

Expected: all 3 steps PASS.

- [ ] **Step 5: Write the failing login-route test**

```ts
// backend/tests/routes/auth_session_cookie_test.ts
import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { hashPassword } from '../../src/services/password.ts';
import app from '../../src/main.ts';
import { verifySessionCookie } from '../../src/services/oauth/session-cookie.ts';

Deno.test('POST /api/auth/login sets oauth_session cookie', async () => {
  await setupTestDatabase();
  await clearDatabase();

  const tenant = await tenantRepository.create({ name: 'T', is_active: true });
  await userRepository.create({
    email: 'u@u.u', password_hash: hashPassword('password123'),
    role: 'user', full_name: 'U', tenant_id: tenant.id, is_active: true,
  });

  const res = await app.fetch(new Request('http://x/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'u@u.u', password: 'password123' }),
  }));
  assertEquals(res.status, 200);

  const setCookie = res.headers.get('set-cookie') ?? '';
  assert(setCookie.includes('oauth_session='), `expected oauth_session cookie, got: ${setCookie}`);
  assert(setCookie.includes('HttpOnly'), 'cookie must be HttpOnly');
  assert(setCookie.includes('SameSite=Lax'), 'cookie must be SameSite=Lax');

  const cookieValue = setCookie.split('oauth_session=')[1]?.split(';')[0] ?? '';
  const userId = await verifySessionCookie(cookieValue);
  assert(userId !== null && userId > 0);
});
```

- [ ] **Step 6: Run test, verify it fails**

```bash
cd backend && deno test --allow-all tests/routes/auth_session_cookie_test.ts
```

Expected: FAIL — cookie not set.

- [ ] **Step 7: Modify login route to set cookie**

In `backend/src/routes/auth.ts`, add the import at the top:

```ts
import {
  signSessionCookie,
  OAUTH_SESSION_COOKIE_NAME,
  OAUTH_SESSION_MAX_AGE,
} from '../services/oauth/session-cookie.ts';
```

Replace the final `return c.json({ data: { ... } });` inside the `/login` handler with:

```ts
    const cookie = await signSessionCookie(user.id);
    c.header(
      'Set-Cookie',
      `${OAUTH_SESSION_COOKIE_NAME}=${cookie}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${OAUTH_SESSION_MAX_AGE}`
    );
    return c.json({
      data: {
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          tenantId: user.tenant_id,
          tenantName: tenant.name,
        },
        accessToken,
        refreshToken,
      },
      message: 'Login successful',
    });
```

Note: keep `Secure` in production; for tests/dev the cookie is sent over `http://` requests but the existing test harness uses `http://x/...` URLs which won't enforce Secure inside Hono's app.fetch (Set-Cookie is just a header — verification only reads the cookie name and value).

- [ ] **Step 8: Run both auth tests, verify pass**

```bash
cd backend && deno test --allow-all tests/routes/auth_session_cookie_test.ts tests/routes/auth_test.ts 2>&1 | tail -20
```

Expected: new test PASS; existing auth tests unaffected.

- [ ] **Step 9: Commit**

```bash
git add backend/src/services/oauth/session-cookie.ts backend/src/routes/auth.ts backend/tests/services/oauth/session_cookie_test.ts backend/tests/routes/auth_session_cookie_test.ts
git commit -m "feat(oauth): set oauth_session cookie on login for OAuth consent bridge"
```

---

### Task 9: GET /oauth/authorize — redirect to login or consent

**Files:**
- Modify: `backend/src/routes/oauth.ts`
- Modify: `backend/tests/routes/oauth_test.ts`

- [ ] **Step 1: Append the failing test**

Add to `backend/tests/routes/oauth_test.ts`:

```ts
import { signSessionCookie } from '../../src/services/oauth/session-cookie.ts';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';

Deno.test('GET /oauth/authorize', async (t) => {
  await setupTestDatabase();

  await t.step('redirects to login when no session cookie', async () => {
    await clearDatabase();
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=${client.id}&redirect_uri=${encodeURIComponent('https://c/cb')}&code_challenge=abc&code_challenge_method=S256&state=xyz`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.includes('/login'), `expected /login, got: ${location}`);
    assert(location.includes('return_to='), 'must encode return_to');
  });

  await t.step('redirects to /oauth/consent when session cookie valid', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 'a@a.a', password_hash: 'x', role: 'user',
      full_name: 'A', tenant_id: tenant.id, is_active: true,
    });
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const cookie = await signSessionCookie(user.id);

    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=${client.id}&redirect_uri=${encodeURIComponent('https://c/cb')}&code_challenge=abc&code_challenge_method=S256&state=xyz`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: `oauth_session=${cookie}` } }));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.startsWith('/oauth/consent?'), `expected /oauth/consent, got: ${location}`);
  });

  await t.step('rejects unknown client_id', async () => {
    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=nope&redirect_uri=https://c/cb&code_challenge=abc&code_challenge_method=S256`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 400);
  });

  await t.step('rejects redirect_uri not in client allowlist', async () => {
    await clearDatabase();
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const app = buildApp();
    const url = `https://x/oauth/authorize?response_type=code&client_id=${client.id}&redirect_uri=${encodeURIComponent('https://evil/cb')}&code_challenge=abc&code_challenge_method=S256`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 400);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: FAIL — route not defined.

- [ ] **Step 3: Implement /oauth/authorize**

In `backend/src/routes/oauth.ts`, add after imports:

```ts
import { verifySessionCookie, OAUTH_SESSION_COOKIE_NAME } from '../services/oauth/session-cookie.ts';
```

Add this handler:

```ts
oauthRoutes.get('/authorize', async (c) => {
  const responseType = c.req.query('response_type');
  const clientId = c.req.query('client_id');
  const redirectUri = c.req.query('redirect_uri');
  const codeChallenge = c.req.query('code_challenge');
  const codeChallengeMethod = c.req.query('code_challenge_method');
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? 'read';

  if (responseType !== 'code') return c.text('unsupported response_type', 400);
  if (!clientId) return c.text('missing client_id', 400);
  if (!redirectUri) return c.text('missing redirect_uri', 400);
  if (!codeChallenge) return c.text('missing code_challenge', 400);
  if (codeChallengeMethod !== 'S256') return c.text('only S256 supported', 400);

  const client = await oauthClientRepository.findById(clientId);
  if (!client) return c.text('unknown client_id', 400);
  if (!client.redirect_uris.includes(redirectUri)) return c.text('redirect_uri not registered', 400);

  // Parse cookie
  const cookieHeader = c.req.header('Cookie') ?? '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${OAUTH_SESSION_COOKIE_NAME}=([^;]+)`));
  const userId = match ? await verifySessionCookie(match[1]) : null;

  if (userId === null) {
    // Send the user to the frontend login page with return_to
    const returnTo = encodeURIComponent(c.req.url);
    return c.redirect(`/login?return_to=${returnTo}`, 302);
  }

  // Logged in — render consent. Pass the original params forward.
  const consentUrl = new URL('https://internal/oauth/consent');
  consentUrl.searchParams.set('client_id', clientId);
  consentUrl.searchParams.set('redirect_uri', redirectUri);
  consentUrl.searchParams.set('code_challenge', codeChallenge);
  consentUrl.searchParams.set('state', state);
  consentUrl.searchParams.set('scope', scope);
  return c.redirect(`/oauth/consent?${consentUrl.searchParams.toString()}`, 302);
});
```

Also import `oauthClientRepository`:

```ts
import { oauthClientRepository } from '../repositories/oauth-client.ts';
```

(if not already present).

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: all steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/oauth.ts backend/tests/routes/oauth_test.ts
git commit -m "feat(oauth): add GET /oauth/authorize with session cookie check"
```

---

### Task 10: Consent page (GET + POST /oauth/consent)

**Files:**
- Create: `backend/src/routes/oauth-consent.ts`
- Test: `backend/tests/routes/oauth_consent_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/routes/oauth_consent_test.ts
import { assertEquals, assert } from '@std/assert';
import { Hono } from 'hono';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { oauthConsentRoutes } from '../../src/routes/oauth-consent.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { oauthClientRepository } from '../../src/repositories/oauth-client.ts';
import { signSessionCookie } from '../../src/services/oauth/session-cookie.ts';

function buildApp(): Hono {
  const app = new Hono();
  app.route('/oauth', oauthConsentRoutes);
  return app;
}

async function seed() {
  const tenant = await tenantRepository.create({ name: 'T', is_active: true });
  const user = await userRepository.create({
    email: 'c@c.c', password_hash: 'x', role: 'user',
    full_name: 'C', tenant_id: tenant.id, is_active: true,
  });
  const client = await oauthClientRepository.create({
    redirect_uris: ['https://c/cb'], client_name: 'Claude',
  });
  const cookie = await signSessionCookie(user.id);
  return { user, client, cookie };
}

Deno.test('OAuth consent', async (t) => {
  await setupTestDatabase();

  await t.step('GET /oauth/consent renders HTML with allow/deny form', async () => {
    await clearDatabase();
    const { client, cookie } = await seed();
    const app = buildApp();
    const url = `https://x/oauth/consent?client_id=${client.id}&redirect_uri=${encodeURIComponent('https://c/cb')}&code_challenge=abc&state=xyz&scope=read`;
    const res = await app.fetch(new Request(url, { headers: { Cookie: `oauth_session=${cookie}` } }));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get('content-type')?.startsWith('text/html'), true);
    const body = await res.text();
    assert(body.includes('Claude'), 'must show client name');
    assert(body.includes('Allow'), 'must have Allow button');
    assert(body.includes('Deny'), 'must have Deny button');
  });

  await t.step('GET /oauth/consent redirects to login when no cookie', async () => {
    await clearDatabase();
    const { client } = await seed();
    const app = buildApp();
    const url = `https://x/oauth/consent?client_id=${client.id}&redirect_uri=https://c/cb&code_challenge=abc&state=xyz`;
    const res = await app.fetch(new Request(url));
    assertEquals(res.status, 302);
    assert(res.headers.get('location')?.includes('/login') ?? false);
  });

  await t.step('POST /oauth/consent (Allow) issues code and redirects to client', async () => {
    await clearDatabase();
    const { client, cookie } = await seed();
    const app = buildApp();
    const body = new URLSearchParams({
      action: 'allow',
      client_id: client.id,
      redirect_uri: 'https://c/cb',
      code_challenge: 'abc',
      state: 'xyz',
      scope: 'read',
    });
    const res = await app.fetch(new Request('https://x/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', Cookie: `oauth_session=${cookie}` },
      body: body.toString(),
    }));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.startsWith('https://c/cb?'), `expected redirect to client, got: ${location}`);
    const cb = new URL(location);
    assert(cb.searchParams.get('code')!.length > 0);
    assertEquals(cb.searchParams.get('state'), 'xyz');
  });

  await t.step('POST /oauth/consent (Deny) redirects to client with error', async () => {
    await clearDatabase();
    const { client, cookie } = await seed();
    const app = buildApp();
    const body = new URLSearchParams({
      action: 'deny',
      client_id: client.id,
      redirect_uri: 'https://c/cb',
      code_challenge: 'abc',
      state: 'xyz',
    });
    const res = await app.fetch(new Request('https://x/oauth/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', Cookie: `oauth_session=${cookie}` },
      body: body.toString(),
    }));
    assertEquals(res.status, 302);
    const location = res.headers.get('location') ?? '';
    assert(location.startsWith('https://c/cb?'));
    const cb = new URL(location);
    assertEquals(cb.searchParams.get('error'), 'access_denied');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/routes/oauth_consent_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement consent route**

```ts
// backend/src/routes/oauth-consent.ts
import { Hono } from 'hono';
import { verifySessionCookie, OAUTH_SESSION_COOKIE_NAME } from '../services/oauth/session-cookie.ts';
import { oauthClientRepository } from '../repositories/oauth-client.ts';
import { oauthCodeRepository } from '../repositories/oauth-code.ts';
import { userRepository } from '../repositories/user.ts';

export const oauthConsentRoutes = new Hono();

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch] as string));
}

function getCookieUserId(cookieHeader: string | undefined): Promise<number | null> {
  if (!cookieHeader) return Promise.resolve(null);
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${OAUTH_SESSION_COOKIE_NAME}=([^;]+)`));
  if (!m) return Promise.resolve(null);
  return verifySessionCookie(m[1]);
}

oauthConsentRoutes.get('/consent', async (c) => {
  const userId = await getCookieUserId(c.req.header('Cookie'));
  if (userId === null) {
    const returnTo = encodeURIComponent(c.req.url);
    return c.redirect(`/login?return_to=${returnTo}`, 302);
  }
  const clientId = c.req.query('client_id') ?? '';
  const redirectUri = c.req.query('redirect_uri') ?? '';
  const codeChallenge = c.req.query('code_challenge') ?? '';
  const state = c.req.query('state') ?? '';
  const scope = c.req.query('scope') ?? 'read';

  const client = await oauthClientRepository.findById(clientId);
  if (!client) return c.text('unknown client', 400);
  if (!client.redirect_uris.includes(redirectUri)) return c.text('bad redirect_uri', 400);

  const user = await userRepository.findById(userId);
  const clientName = escapeHtml(client.client_name ?? 'an MCP client');
  const email = escapeHtml(user?.email ?? '');

  const html = `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"><title>SnapFlow — Authorize</title></head>
  <body style="font-family:system-ui;max-width:480px;margin:80px auto;padding:24px;border:1px solid #ddd;border-radius:8px">
    <h2>Authorize ${clientName}</h2>
    <p>${clientName} wants to read your SnapFlow projects and catalog as <strong>${email}</strong>.</p>
    <form method="POST" action="/oauth/consent">
      <input type="hidden" name="client_id" value="${escapeHtml(clientId)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirectUri)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
      <input type="hidden" name="state" value="${escapeHtml(state)}">
      <input type="hidden" name="scope" value="${escapeHtml(scope)}">
      <button name="action" value="allow" style="padding:10px 16px;margin-right:8px">Allow</button>
      <button name="action" value="deny" style="padding:10px 16px">Deny</button>
    </form>
  </body>
</html>`;
  c.header('Content-Type', 'text/html; charset=utf-8');
  return c.body(html);
});

oauthConsentRoutes.post('/consent', async (c) => {
  const userId = await getCookieUserId(c.req.header('Cookie'));
  if (userId === null) return c.text('not authenticated', 401);

  const form = await c.req.formData();
  const action = form.get('action');
  const clientId = String(form.get('client_id') ?? '');
  const redirectUri = String(form.get('redirect_uri') ?? '');
  const codeChallenge = String(form.get('code_challenge') ?? '');
  const state = String(form.get('state') ?? '');
  const scope = String(form.get('scope') ?? 'read');

  const client = await oauthClientRepository.findById(clientId);
  if (!client || !client.redirect_uris.includes(redirectUri)) {
    return c.text('bad client/redirect', 400);
  }

  const cbUrl = new URL(redirectUri);
  if (action !== 'allow') {
    cbUrl.searchParams.set('error', 'access_denied');
    if (state) cbUrl.searchParams.set('state', state);
    return c.redirect(cbUrl.toString(), 302);
  }

  const created = await oauthCodeRepository.create({
    client_id: clientId,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    scope,
  });
  cbUrl.searchParams.set('code', created.code);
  if (state) cbUrl.searchParams.set('state', state);
  return c.redirect(cbUrl.toString(), 302);
});

export default oauthConsentRoutes;
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/routes/oauth_consent_test.ts
```

Expected: all 4 steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/oauth-consent.ts backend/tests/routes/oauth_consent_test.ts
git commit -m "feat(oauth): add /oauth/consent (GET HTML + POST allow/deny)"
```

---

### Task 11: POST /oauth/token — authorization_code grant

**Files:**
- Modify: `backend/src/routes/oauth.ts`
- Modify: `backend/tests/routes/oauth_test.ts`

- [ ] **Step 1: Append the failing test**

Add to `backend/tests/routes/oauth_test.ts`:

```ts
import { oauthCodeRepository } from '../../src/repositories/oauth-code.ts';
import { verifyToken } from '../../src/services/jwt.ts';

Deno.test('POST /oauth/token (authorization_code)', async (t) => {
  await setupTestDatabase();

  await t.step('exchanges valid code + verifier for access + refresh tokens', async () => {
    await clearDatabase();
    // RFC 7636 example pair
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 'z@z.z', password_hash: 'x', role: 'user',
      full_name: 'Z', tenant_id: tenant.id, is_active: true,
    });
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge, scope: 'read',
    });

    const app = buildApp();
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: created.code,
      redirect_uri: 'https://c/cb',
      client_id: client.id,
      code_verifier: verifier,
    });
    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }));
    assertEquals(res.status, 200);
    const tok = await res.json();
    assertEquals(tok.token_type, 'Bearer');
    assert(typeof tok.access_token === 'string' && tok.access_token.length > 0);
    assert(typeof tok.refresh_token === 'string' && tok.refresh_token.length > 0);

    // The access token must be a valid SnapFlow JWT for this user
    const payload = await verifyToken(tok.access_token);
    assertEquals(payload.sub, String(user.id));
    assertEquals(payload.tenantId, tenant.id);
  });

  await t.step('rejects wrong verifier', async () => {
    await clearDatabase();
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 'y@y.y', password_hash: 'x', role: 'user',
      full_name: 'Y', tenant_id: tenant.id, is_active: true,
    });
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge,
    });

    const app = buildApp();
    const body = new URLSearchParams({
      grant_type: 'authorization_code', code: created.code,
      redirect_uri: 'https://c/cb', client_id: client.id,
      code_verifier: 'wrong',
    });
    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    }));
    assertEquals(res.status, 400);
    const err = await res.json();
    assertEquals(err.error, 'invalid_grant');
  });

  await t.step('rejects reused code', async () => {
    await clearDatabase();
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 'r@r.r', password_hash: 'x', role: 'user',
      full_name: 'R', tenant_id: tenant.id, is_active: true,
    });
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge,
    });

    const app = buildApp();
    const makeBody = () => new URLSearchParams({
      grant_type: 'authorization_code', code: created.code,
      redirect_uri: 'https://c/cb', client_id: client.id,
      code_verifier: verifier,
    }).toString();

    const first = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: makeBody(),
    }));
    assertEquals(first.status, 200);

    const second = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: makeBody(),
    }));
    assertEquals(second.status, 400);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: FAIL — `/oauth/token` not defined.

- [ ] **Step 3: Implement /oauth/token (code grant)**

In `backend/src/routes/oauth.ts`, add imports:

```ts
import { oauthCodeRepository } from '../repositories/oauth-code.ts';
import { verifyS256 } from '../services/oauth/pkce.ts';
import { generateToken } from '../services/jwt.ts';
import { createRefreshToken } from '../services/refresh-token.ts';
import { userRepository } from '../repositories/user.ts';
```

Add the handler:

```ts
oauthRoutes.post('/token', async (c) => {
  const form = await c.req.formData();
  const grantType = String(form.get('grant_type') ?? '');

  if (grantType === 'authorization_code') {
    const code = String(form.get('code') ?? '');
    const redirectUri = String(form.get('redirect_uri') ?? '');
    const clientId = String(form.get('client_id') ?? '');
    const verifier = String(form.get('code_verifier') ?? '');

    if (!code || !redirectUri || !clientId || !verifier) {
      return c.json({ error: 'invalid_request', error_description: 'missing field' }, 400);
    }
    const consumed = await oauthCodeRepository.consume(code);
    if (!consumed) {
      return c.json({ error: 'invalid_grant', error_description: 'code invalid/expired/reused' }, 400);
    }
    if (consumed.client_id !== clientId) {
      return c.json({ error: 'invalid_grant', error_description: 'client_id mismatch' }, 400);
    }
    if (consumed.redirect_uri !== redirectUri) {
      return c.json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, 400);
    }
    const pkceOk = await verifyS256(verifier, consumed.code_challenge);
    if (!pkceOk) {
      return c.json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
    }

    const user = await userRepository.findById(consumed.user_id);
    if (!user) return c.json({ error: 'invalid_grant', error_description: 'user gone' }, 400);

    const accessToken = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const refreshToken = await createRefreshToken(user.id);

    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: refreshToken,
      scope: consumed.scope ?? 'read',
    });
  }

  // Refresh-token grant added in Task 12.
  return c.json({ error: 'unsupported_grant_type' }, 400);
});
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: all steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/oauth.ts backend/tests/routes/oauth_test.ts
git commit -m "feat(oauth): add POST /oauth/token authorization_code grant with PKCE"
```

---

### Task 12: POST /oauth/token — refresh_token grant

**Files:**
- Modify: `backend/src/routes/oauth.ts`
- Modify: `backend/tests/routes/oauth_test.ts`

- [ ] **Step 1: Append the failing test**

```ts
Deno.test('POST /oauth/token (refresh_token)', async (t) => {
  await setupTestDatabase();

  async function obtainTokenPair() {
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
    const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 'q@q.q', password_hash: 'x', role: 'user',
      full_name: 'Q', tenant_id: tenant.id, is_active: true,
    });
    const client = await oauthClientRepository.create({ redirect_uris: ['https://c/cb'] });
    const created = await oauthCodeRepository.create({
      client_id: client.id, user_id: user.id,
      redirect_uri: 'https://c/cb', code_challenge: challenge,
    });
    const app = buildApp();
    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code', code: created.code,
        redirect_uri: 'https://c/cb', client_id: client.id, code_verifier: verifier,
      }).toString(),
    }));
    return { app, tok: await res.json(), user };
  }

  await t.step('exchanges refresh token for new pair', async () => {
    await clearDatabase();
    const { app, tok } = await obtainTokenPair();

    const res = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }).toString(),
    }));
    assertEquals(res.status, 200);
    const next = await res.json();
    assert(typeof next.access_token === 'string');
    assert(typeof next.refresh_token === 'string');
    assertNotEquals(next.refresh_token, tok.refresh_token, 'refresh token must rotate');
  });

  await t.step('old refresh token is invalidated after rotation', async () => {
    await clearDatabase();
    const { app, tok } = await obtainTokenPair();
    const r1 = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }).toString(),
    }));
    assertEquals(r1.status, 200);
    const r2 = await app.fetch(new Request('https://x/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tok.refresh_token }).toString(),
    }));
    assertEquals(r2.status, 400);
  });
});
```

Add the import you'll need (top of file):

```ts
import { assertNotEquals } from '@std/assert';
```

(if not already present).

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: refresh_token tests FAIL with `unsupported_grant_type`.

- [ ] **Step 3: Extend /oauth/token with refresh_token grant**

In `backend/src/routes/oauth.ts`, add imports if not present:

```ts
import { verifyRefreshToken, revokeRefreshToken } from '../services/refresh-token.ts';
```

Replace the line `// Refresh-token grant added in Task 12.` (and the line below it) with:

```ts
  if (grantType === 'refresh_token') {
    const refreshToken = String(form.get('refresh_token') ?? '');
    if (!refreshToken) return c.json({ error: 'invalid_request' }, 400);
    const userId = await verifyRefreshToken(refreshToken);
    if (userId === null) return c.json({ error: 'invalid_grant' }, 400);
    const user = await userRepository.findById(userId);
    if (!user) return c.json({ error: 'invalid_grant' }, 400);

    // Rotate: revoke the presented refresh token, issue a fresh pair
    await revokeRefreshToken(refreshToken);
    const accessToken = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const newRefresh = await createRefreshToken(user.id);
    return c.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900,
      refresh_token: newRefresh,
      scope: 'read',
    });
  }

  return c.json({ error: 'unsupported_grant_type' }, 400);
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/routes/oauth_test.ts
```

Expected: all steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/oauth.ts backend/tests/routes/oauth_test.ts
git commit -m "feat(oauth): add refresh_token grant with rotation"
```

---

## Phase 4 — MCP Server

### Task 13: In-process dispatcher (calls existing REST routes via app.fetch)

**Files:**
- Create: `backend/src/services/mcp/dispatcher.ts`
- Test: `backend/tests/mcp/dispatcher_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/mcp/dispatcher_test.ts
import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { dispatchToBackend } from '../../src/services/mcp/dispatcher.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { generateToken } from '../../src/services/jwt.ts';

Deno.test('dispatchToBackend', async (t) => {
  await setupTestDatabase();

  await t.step('returns parsed JSON body for 200 responses', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 'd@d.d', password_hash: 'x', role: 'user',
      full_name: 'D', tenant_id: tenant.id, is_active: true,
    });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
    const result = await dispatchToBackend(app, {
      method: 'GET',
      path: '/api/projects',
      accessToken: token,
    });
    assertEquals(result.ok, true);
    assert(Array.isArray(result.body.data));
  });

  await t.step('returns {ok:false, status, body} for error responses', async () => {
    await clearDatabase();
    const result = await dispatchToBackend(app, {
      method: 'GET',
      path: '/api/projects',
      accessToken: 'garbage.jwt.string',
    });
    assertEquals(result.ok, false);
    assertEquals(result.status, 401);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/mcp/dispatcher_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dispatcher**

```ts
// backend/src/services/mcp/dispatcher.ts
import type { Hono } from 'hono';

export interface DispatchInput {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  accessToken: string;
}

export interface DispatchResult {
  ok: boolean;
  status: number;
  body: any;
}

/**
 * Dispatch a request to the in-process Hono app using the user's access token.
 *
 * MCP tools call this instead of touching repositories directly, so that all
 * middleware (auth, tenant scoping, Zod validation, role checks, cascading
 * business logic) runs exactly as it would for a real HTTP request from the
 * frontend.
 */
export async function dispatchToBackend(
  app: Hono,
  input: DispatchInput,
): Promise<DispatchResult> {
  const url = new URL(`http://internal${input.path}`);
  if (input.query) {
    for (const [k, v] of Object.entries(input.query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

  const init: RequestInit = {
    method: input.method,
    headers: { Authorization: `Bearer ${input.accessToken}` },
  };
  if (input.body !== undefined) {
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
    init.body = JSON.stringify(input.body);
  }

  const res = await app.fetch(new Request(url, init));
  const contentType = res.headers.get('content-type') ?? '';
  let body: any = null;
  if (contentType.startsWith('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }
  return { ok: res.ok, status: res.status, body };
}
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/dispatcher_test.ts
```

Expected: both steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mcp/dispatcher.ts backend/tests/mcp/dispatcher_test.ts
git commit -m "feat(mcp): add in-process dispatcher (calls REST routes via app.fetch)"
```

---

### Task 14: MCP tool — list_projects

**Files:**
- Create: `backend/src/services/mcp/tools/list-projects.ts`
- Test: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/tests/mcp/tools_test.ts
import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { projectRepository } from '../../src/repositories/project.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { listProjectsTool } from '../../src/services/mcp/tools/list-projects.ts';

async function seedUserWithProjects() {
  const tenant = await tenantRepository.create({ name: 'T', is_active: true });
  const user = await userRepository.create({
    email: 'l@l.l', password_hash: 'x', role: 'user',
    full_name: 'L', tenant_id: tenant.id, is_active: true,
  });
  // Use the project repo to create a couple of projects in this tenant.
  // (Adjust to match your repo's signature — see backend/src/repositories/project.ts)
  await projectRepository.create({
    name: 'Alpha', customer_name: 'A Co', tenant_id: tenant.id,
  } as any);
  await projectRepository.create({
    name: 'Beta', customer_name: 'B Co', tenant_id: tenant.id,
  } as any);
  const token = await generateToken(user.id, user.email, user.role, user.tenant_id);
  return { token, tenant, user };
}

Deno.test('list_projects tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns content with the user\'s projects', async () => {
    await clearDatabase();
    const { token } = await seedUserWithProjects();
    const result = await listProjectsTool.handler({ query: undefined }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assertEquals(result.content.length, 1);
    const text = result.content[0].text;
    assert(text.includes('Alpha'));
    assert(text.includes('Beta'));
  });

  await t.step('honors search query', async () => {
    await clearDatabase();
    const { token } = await seedUserWithProjects();
    const result = await listProjectsTool.handler({ query: 'Alpha' }, { app, accessToken: token });
    assert(result.content[0].text.includes('Alpha'));
    assert(!result.content[0].text.includes('Beta'));
  });

  await t.step('returns isError on bad auth', async () => {
    await clearDatabase();
    const result = await listProjectsTool.handler({ query: undefined }, { app, accessToken: 'bad' });
    assertEquals(result.isError, true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

```ts
// backend/src/services/mcp/tools/list-projects.ts
import type { Hono } from 'hono';
import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';

export interface ToolContext {
  app: Hono;
  accessToken: string;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const inputSchema = z.object({
  query: z.string().optional(),
});

export const listProjectsTool = {
  name: 'list_projects',
  description:
    'List SnapFlow projects in your workspace. Returns id, name, customer name, status, and creation date. Use `query` to filter by project name.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: '/api/projects',
      query: { search: args.query },
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to list projects (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: all 3 steps PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mcp/tools/list-projects.ts backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): add list_projects tool"
```

---

### Task 15: MCP tool — get_project

**Files:**
- Create: `backend/src/services/mcp/tools/get-project.ts`
- Modify: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 1: Append the failing test**

```ts
import { getProjectTool } from '../../src/services/mcp/tools/get-project.ts';

Deno.test('get_project tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns project details for valid id', async () => {
    await clearDatabase();
    const { token, tenant } = await seedUserWithProjects();
    // Fetch list to discover id (or pull from repo directly)
    const projects = await projectRepository.findAll(undefined, { tenantId: tenant.id, role: 'user' } as any);
    const projectId = projects[0].id;

    const result = await getProjectTool.handler({ project_id: projectId }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0].text.includes(projects[0].name));
  });

  await t.step('returns isError for unknown id', async () => {
    await clearDatabase();
    const { token } = await seedUserWithProjects();
    const result = await getProjectTool.handler({ project_id: 999999 }, { app, accessToken: token });
    assertEquals(result.isError, true);
  });
});
```

(Pull the import for `projectRepository` to the top of the file if not already there.)

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: FAIL — get-project module missing.

- [ ] **Step 3: Implement the tool**

```ts
// backend/src/services/mcp/tools/get-project.ts
import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  project_id: z.number().int().positive(),
});

export const getProjectTool = {
  name: 'get_project',
  description:
    'Get full details for a single SnapFlow project — customer info, floorplans, BOM entries.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: `/api/projects/${args.project_id}`,
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to get project ${args.project_id} (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mcp/tools/get-project.ts backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): add get_project tool"
```

---

### Task 16: MCP tool — get_project_total

**Files:**
- Create: `backend/src/services/mcp/tools/get-project-total.ts`
- Modify: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 1: Append the failing test**

```ts
import { getProjectTotalTool } from '../../src/services/mcp/tools/get-project-total.ts';

Deno.test('get_project_total tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns total for valid id', async () => {
    await clearDatabase();
    const { token, tenant } = await seedUserWithProjects();
    const projects = await projectRepository.findAll(undefined, { tenantId: tenant.id, role: 'user' } as any);
    const result = await getProjectTotalTool.handler({ project_id: projects[0].id }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    // The /total route returns a structured object; just assert it parsed
    assert(result.content[0].text.length > 2);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

```ts
// backend/src/services/mcp/tools/get-project-total.ts
import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  project_id: z.number().int().positive(),
});

export const getProjectTotalTool = {
  name: 'get_project_total',
  description:
    'Get the itemized total/pricing summary for a SnapFlow project — list price, discounts, tax, grand total.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: `/api/projects/${args.project_id}/total`,
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to get total for project ${args.project_id} (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mcp/tools/get-project-total.ts backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): add get_project_total tool"
```

---

### Task 17: MCP tool — search_items

**Files:**
- Create: `backend/src/services/mcp/tools/search-items.ts`
- Modify: `backend/tests/mcp/tools_test.ts`

- [ ] **Step 1: Append the failing test**

```ts
import { searchItemsTool } from '../../src/services/mcp/tools/search-items.ts';
import { itemRepository } from '../../src/repositories/item.ts';

Deno.test('search_items tool', async (t) => {
  await setupTestDatabase();

  await t.step('returns items matching query', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 's@s.s', password_hash: 'x', role: 'user',
      full_name: 'S', tenant_id: tenant.id, is_active: true,
    });
    // Seed one item (adjust to match your repo signature)
    await itemRepository.create({
      name: 'Smart Switch', sku: 'SW-1', tenant_id: tenant.id,
    } as any);
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await searchItemsTool.handler({ query: 'Switch' }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
    assert(result.content[0].text.includes('Smart Switch'));
  });

  await t.step('honors limit', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 's2@s.s', password_hash: 'x', role: 'user',
      full_name: 'S', tenant_id: tenant.id, is_active: true,
    });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const result = await searchItemsTool.handler({ limit: 5 }, { app, accessToken: token });
    assertEquals(result.isError, undefined);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the tool**

```ts
// backend/src/services/mcp/tools/search-items.ts
import { z } from 'zod';
import { dispatchToBackend } from '../dispatcher.ts';
import type { ToolContext, ToolResult } from './list-projects.ts';

const inputSchema = z.object({
  query: z.string().optional(),
  category_id: z.number().int().positive().optional(),
  type_id: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export const searchItemsTool = {
  name: 'search_items',
  description:
    'Search the SnapFlow product catalog. Filter by name (`query`), `category_id`, or `type_id`. Limit defaults to 20, max 100.',
  inputSchema,
  handler: async (args: z.infer<typeof inputSchema>, ctx: ToolContext): Promise<ToolResult> => {
    const result = await dispatchToBackend(ctx.app, {
      method: 'GET',
      path: '/api/items',
      query: {
        search: args.query,
        category_id: args.category_id,
        type_id: args.type_id,
        limit: args.limit,
      },
      accessToken: ctx.accessToken,
    });
    if (!result.ok) {
      return {
        isError: true,
        content: [{ type: 'text', text: `Failed to search items (HTTP ${result.status}): ${JSON.stringify(result.body)}` }],
      };
    }
    return { content: [{ type: 'text', text: JSON.stringify(result.body.data, null, 2) }] };
  },
};
```

- [ ] **Step 4: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tools_test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/mcp/tools/search-items.ts backend/tests/mcp/tools_test.ts
git commit -m "feat(mcp): add search_items tool"
```

---

### Task 18: MCP server + /mcp Streamable HTTP route

**Files:**
- Create: `backend/src/services/mcp/server.ts`
- Create: `backend/src/routes/mcp.ts`
- Test: `backend/tests/routes/mcp_test.ts`

- [ ] **Step 1: Add the MCP SDK dependency**

In `backend/deno.json`, add to the `imports` map:

```json
"@modelcontextprotocol/sdk/": "npm:@modelcontextprotocol/sdk@^1.0.0/"
```

Run:

```bash
cd backend && deno cache src/main.ts
```

Expected: SDK package downloads without errors.

- [ ] **Step 2: Write the failing route test**

```ts
// backend/tests/routes/mcp_test.ts
import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { generateToken } from '../../src/services/jwt.ts';

Deno.test('POST /mcp', async (t) => {
  await setupTestDatabase();

  await t.step('returns 401 with WWW-Authenticate when no bearer', async () => {
    const res = await app.fetch(new Request('http://x/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
    assertEquals(res.status, 401);
    const wwwAuth = res.headers.get('www-authenticate') ?? '';
    assert(wwwAuth.includes('Bearer'));
    assert(wwwAuth.includes('resource_metadata'));
  });

  await t.step('tools/list returns the 4 tools when authenticated', async () => {
    await clearDatabase();
    const tenant = await tenantRepository.create({ name: 'T', is_active: true });
    const user = await userRepository.create({
      email: 'm@m.m', password_hash: 'x', role: 'user',
      full_name: 'M', tenant_id: tenant.id, is_active: true,
    });
    const token = await generateToken(user.id, user.email, user.role, user.tenant_id);

    const res = await app.fetch(new Request('http://x/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    }));
    assertEquals(res.status, 200);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name).sort();
    assertEquals(names, ['get_project', 'get_project_total', 'list_projects', 'search_items']);
  });
});
```

- [ ] **Step 3: Run, verify fail**

```bash
cd backend && deno test --allow-all tests/routes/mcp_test.ts
```

Expected: FAIL — route not mounted.

- [ ] **Step 4: Implement the MCP server module**

```ts
// backend/src/services/mcp/server.ts
import type { Hono } from 'hono';
import { listProjectsTool } from './tools/list-projects.ts';
import { getProjectTool } from './tools/get-project.ts';
import { getProjectTotalTool } from './tools/get-project-total.ts';
import { searchItemsTool } from './tools/search-items.ts';

const allTools = [listProjectsTool, getProjectTool, getProjectTotalTool, searchItemsTool];

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

/** Minimal MCP server: handles `initialize`, `tools/list`, `tools/call` over JSON-RPC. */
export async function handleMcpRequest(
  app: Hono,
  accessToken: string,
  req: JsonRpcRequest,
): Promise<unknown> {
  if (req.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'snapflow-mcp', version: '0.1.0' },
      },
    };
  }
  if (req.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: req.id,
      result: {
        tools: allTools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: zodToJsonSchema(t.inputSchema),
        })),
      },
    };
  }
  if (req.method === 'tools/call') {
    const params = req.params as { name: string; arguments?: Record<string, unknown> } | undefined;
    if (!params) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: 'missing params' } };
    }
    const tool = allTools.find((t) => t.name === params.name);
    if (!tool) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `unknown tool: ${params.name}` } };
    }
    const parsed = tool.inputSchema.safeParse(params.arguments ?? {});
    if (!parsed.success) {
      return { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: parsed.error.message } };
    }
    const result = await tool.handler(parsed.data as never, { app, accessToken });
    return { jsonrpc: '2.0', id: req.id, result };
  }
  return { jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `unknown method: ${req.method}` } };
}

/**
 * Convert a Zod schema to a JSON Schema fragment.
 * Minimal converter — sufficient for the four v0 tools (all flat objects of
 * optional string/number with constraints).
 */
function zodToJsonSchema(schema: unknown): unknown {
  // For v0 we hand-rolled four flat-object schemas. A minimal converter
  // that walks the Zod definition is enough.
  // (We use `zod-to-json-schema` later if we add complex shapes.)
  // The MCP clients we target (Claude.ai / Desktop / Code) accept any valid
  // JSON Schema object, including {} (meaning "any object").
  // For now, return {} so tools/list works; tool calls still validate via Zod.
  return { type: 'object' };
}
```

(Note: replacing the placeholder converter is on the roadmap; for v0 the LLM gets the description string and uses `tools/call` either way. We document this in Open Questions.)

- [ ] **Step 5: Implement the /mcp route**

```ts
// backend/src/routes/mcp.ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { handleMcpRequest } from '../services/mcp/server.ts';

export const mcpRoutes = new Hono();

/**
 * Custom auth-or-challenge middleware: if no/invalid bearer, return 401 with
 * a WWW-Authenticate header pointing to the protected-resource metadata so
 * MCP clients can discover where to authenticate.
 */
mcpRoutes.use('/', async (c, next) => {
  const auth = c.req.header('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) {
    const baseUrl = new URL(c.req.url);
    c.header(
      'WWW-Authenticate',
      `Bearer resource_metadata="${baseUrl.protocol}//${baseUrl.host}/.well-known/oauth-protected-resource"`,
    );
    return c.json({ error: 'unauthorized' }, 401);
  }
  return await authMiddleware(c, next);
});

mcpRoutes.post('/', async (c) => {
  const accessToken = c.req.header('Authorization')!.substring(7);
  const body = await c.req.json();
  // For v0 we keep it simple: handle one JSON-RPC request per HTTP POST,
  // single-response JSON (no streaming). Streamable HTTP supports this mode.
  const result = await handleMcpRequest(c, accessToken, body);
  return c.json(result);
});

export default mcpRoutes;
```

Wait — the handler signature passes `c` (Hono context) but we need the `app` to dispatch. Update `mcp.ts`:

```ts
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.ts';
import { handleMcpRequest } from '../services/mcp/server.ts';

export function buildMcpRoutes(app: Hono): Hono {
  const mcpRoutes = new Hono();

  mcpRoutes.use('/', async (c, next) => {
    const auth = c.req.header('Authorization');
    if (!auth || !auth.startsWith('Bearer ')) {
      const baseUrl = new URL(c.req.url);
      c.header(
        'WWW-Authenticate',
        `Bearer resource_metadata="${baseUrl.protocol}//${baseUrl.host}/.well-known/oauth-protected-resource"`,
      );
      return c.json({ error: 'unauthorized' }, 401);
    }
    return await authMiddleware(c, next);
  });

  mcpRoutes.post('/', async (c) => {
    const accessToken = c.req.header('Authorization')!.substring(7);
    const body = await c.req.json();
    const result = await handleMcpRequest(app, accessToken, body);
    return c.json(result);
  });

  return mcpRoutes;
}
```

This makes `/mcp` know about the top-level `app` so it can dispatch internally.

- [ ] **Step 6: Run, verify pass (after wiring in main.ts in Task 19)**

The mcp test depends on the route being mounted in `main.ts`, which happens in Task 19. Note this dependency; don't try to run it standalone yet.

- [ ] **Step 7: Commit (route + server, without main.ts yet)**

```bash
git add backend/src/services/mcp/server.ts backend/src/routes/mcp.ts backend/deno.json backend/tests/routes/mcp_test.ts
git commit -m "feat(mcp): add MCP server (initialize, tools/list, tools/call) and /mcp route"
```

---

## Phase 5 — Wire-up + frontend

### Task 19: Mount OAuth + MCP routes in main.ts

**Files:**
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Add the imports**

In `backend/src/main.ts`, after the existing route imports add:

```ts
import oauthRoutes from './routes/oauth.ts';
import oauthConsentRoutes from './routes/oauth-consent.ts';
import wellKnownRoutes from './routes/well-known.ts';
import { buildMcpRoutes } from './routes/mcp.ts';
```

- [ ] **Step 2: Mount the routes**

After `app.route('/api', api);`, add:

```ts
// OAuth 2.1 endpoints (no /api prefix — at the app root per spec)
app.route('/oauth', oauthRoutes);
app.route('/oauth', oauthConsentRoutes);

// /.well-known/* metadata
app.route('/', wellKnownRoutes);

// MCP endpoint (Streamable HTTP) — receives the top-level app so its
// tools can dispatch back through it via app.fetch.
app.route('/mcp', buildMcpRoutes(app));
```

Important: `wellKnownRoutes` defines absolute paths starting with `/.well-known/...`, so we mount it at `/` (no prefix).

- [ ] **Step 3: Run the affected tests end-to-end**

```bash
cd backend && deno test --allow-all tests/routes/mcp_test.ts tests/routes/oauth_test.ts tests/routes/oauth_consent_test.ts tests/routes/well_known_test.ts tests/mcp/tools_test.ts
```

Expected: all PASS.

- [ ] **Step 4: Run the full test suite to catch regressions**

```bash
cd backend && deno task test
```

Expected: all pre-existing tests still PASS.

- [ ] **Step 5: Lint**

```bash
cd backend && deno lint
```

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main.ts
git commit -m "feat(mcp): mount /oauth, /.well-known, and /mcp routes in main app"
```

---

### Task 20: Frontend login honors `?return_to=`

**Files:**
- Modify: `frontend/src/pages/Login.tsx`
- Test: `frontend/tests/Login.test.tsx` (create if absent)

- [ ] **Step 1: Inspect current Login.tsx**

Run:

```bash
cd frontend && head -80 src/pages/Login.tsx
```

Note the exact place where, on successful login, the page navigates (likely `navigate('/dashboard')` or similar).

- [ ] **Step 2: Write the failing test**

```tsx
// frontend/tests/Login.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from '../src/pages/Login';

vi.mock('../src/services/auth', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    getAccessToken: vi.fn(),
    clearTokens: vi.fn(),
    login: vi.fn().mockResolvedValue({ user: { id: 1, email: 'a@a.a' } }),
  },
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<div>DASHBOARD</div>} />
        <Route path="/oauth/authorize" element={<div>AUTHORIZE</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Login return_to', () => {
  beforeEach(() => vi.clearAllMocks());

  it('navigates to return_to on successful login when present', async () => {
    renderAt('/login?return_to=%2Foauth%2Fauthorize%3Fclient_id%3Dx');
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@a.a' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /log in|sign in/i }));
    await waitFor(() => expect(screen.getByText('AUTHORIZE')).toBeTruthy());
  });

  it('falls back to dashboard when return_to is absent', async () => {
    renderAt('/login');
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@a.a' } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'password' } });
    fireEvent.click(screen.getByRole('button', { name: /log in|sign in/i }));
    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeTruthy());
  });
});
```

(The test uses the existing `authService` mock pattern from `CLAUDE.md`. The selectors assume the existing Login renders an email field with label, a password field with label, and a submit button. If labels differ, adjust the test to match the rendered DOM — but **do not** change the test's intent.)

- [ ] **Step 3: Run, verify fail**

```bash
cd frontend && npm test -- tests/Login.test.tsx
```

Expected: FAIL — return_to test goes to dashboard instead.

- [ ] **Step 4: Modify Login.tsx to honor return_to**

In `frontend/src/pages/Login.tsx`:

1. Add `useSearchParams` to the `react-router-dom` import.
2. After `useNavigate` add: `const [searchParams] = useSearchParams();`
3. Replace the existing post-login navigation (e.g., `navigate('/dashboard')`) with:

```tsx
const returnTo = searchParams.get('return_to');
if (returnTo && returnTo.startsWith('/')) {
  // Only allow same-origin relative paths (defense in depth — backend also validates)
  navigate(returnTo);
} else {
  navigate('/dashboard');
}
```

The `startsWith('/')` guard prevents open-redirect via `?return_to=https://evil`.

- [ ] **Step 5: Run, verify pass**

```bash
cd frontend && npm test -- tests/Login.test.tsx
```

Expected: both tests PASS.

- [ ] **Step 6: Lint**

```bash
cd frontend && npm run lint
```

Expected: zero errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/tests/Login.test.tsx
git commit -m "feat(oauth): login page honors ?return_to= for OAuth consent flow"
```

---

## Phase 6 — Critical integration test (tenant isolation)

### Task 21: Tenant isolation through MCP

This is the one test that proves MCP cannot bypass `authMiddleware` — without it the entire "Pattern B" guarantee is unverified.

**Files:**
- Create: `backend/tests/mcp/tenant_isolation_test.ts`

- [ ] **Step 1: Write the test**

```ts
// backend/tests/mcp/tenant_isolation_test.ts
import { assertEquals, assert } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import app from '../../src/main.ts';
import { userRepository } from '../../src/repositories/user.ts';
import { tenantRepository } from '../../src/repositories/tenant.ts';
import { projectRepository } from '../../src/repositories/project.ts';
import { generateToken } from '../../src/services/jwt.ts';
import { listProjectsTool } from '../../src/services/mcp/tools/list-projects.ts';

Deno.test('Tenant A cannot see Tenant B projects via MCP', async () => {
  await setupTestDatabase();
  await clearDatabase();

  const tenantA = await tenantRepository.create({ name: 'A', is_active: true });
  const tenantB = await tenantRepository.create({ name: 'B', is_active: true });
  const userA = await userRepository.create({
    email: 'a@a.a', password_hash: 'x', role: 'user',
    full_name: 'A', tenant_id: tenantA.id, is_active: true,
  });

  await projectRepository.create({ name: 'A-project', customer_name: 'Ax', tenant_id: tenantA.id } as any);
  await projectRepository.create({ name: 'B-secret', customer_name: 'Bx', tenant_id: tenantB.id } as any);

  const tokenA = await generateToken(userA.id, userA.email, userA.role, userA.tenant_id);
  const result = await listProjectsTool.handler({ query: undefined }, { app, accessToken: tokenA });

  assertEquals(result.isError, undefined);
  const text = result.content[0].text;
  assert(text.includes('A-project'), 'must include own-tenant project');
  assert(!text.includes('B-secret'), 'must NOT include other-tenant project');
});
```

- [ ] **Step 2: Run, verify pass**

```bash
cd backend && deno test --allow-all tests/mcp/tenant_isolation_test.ts
```

Expected: PASS. If it fails — the route is not enforcing tenant scoping when called via app.fetch, which is a critical bug. Fix before continuing.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/mcp/tenant_isolation_test.ts
git commit -m "test(mcp): verify tenant isolation through MCP tool dispatch"
```

---

## Phase 7 — Final verification

### Task 22: Full backend + frontend lint and test

- [ ] **Step 1: Run full backend test suite**

```bash
cd backend && deno task test
```

Expected: all PASS.

- [ ] **Step 2: Run full frontend test suite**

```bash
cd frontend && npm run test:run
```

Expected: all PASS.

- [ ] **Step 3: Lint both**

```bash
cd backend && deno lint && cd ../frontend && npm run lint
```

Expected: zero errors on both.

- [ ] **Step 4: Build frontend (catches TS errors)**

```bash
cd frontend && npm run build
```

Expected: clean build.

- [ ] **Step 5: Commit if any lint fixes were needed**

(No commit needed if everything was clean.)

---

### Task 23: Manual end-to-end smoke test (documented checklist, not automated)

This is performed by the user/operator after deployment. The plan does not execute it.

- [ ] Deploy to the public host.
- [ ] In Claude.ai, go to Settings → Connectors → Add custom connector. Paste `https://<your-host>/mcp`.
- [ ] Complete the OAuth flow: redirect to SnapFlow login → log in → consent screen shows "Allow Claude" → click Allow → redirected back to Claude.ai.
- [ ] In a new Claude.ai chat: "List my SnapFlow projects." Verify the response.
- [ ] Try "What's the total for project X?" Verify.
- [ ] Try "Search the catalog for smart switch." Verify.
- [ ] Repeat the connector setup in Claude Desktop and Claude Code with the same URL. Verify each one runs through OAuth independently and works.

---

## Self-Review

- [ ] **Spec coverage**: every section of `docs/superpowers/specs/2026-05-15-mcp-remote-server-design.md` is covered:
  - Architecture (Tasks 13, 18, 19)
  - Request dispatch pattern (Tasks 13, 14-17)
  - File layout (Tasks 1-21)
  - OAuth endpoints — metadata (Task 6), DCR (Task 7), authorize (Task 9), consent (Task 10), token+code (Task 11), token+refresh (Task 12)
  - Browser session bridge (Task 8, Task 20)
  - Database (Task 1)
  - MCP tool surface — list_projects (14), get_project (15), get_project_total (16), search_items (17)
  - Tool response shape (each tool task)
  - Error handling — OAuth error JSON (Tasks 11, 12), MCP 401 with WWW-Authenticate (Task 18), tool isError (each tool task)
  - Testing — OAuth tests (Tasks 7, 9, 10, 11, 12), MCP tests (14-18), tenant isolation (Task 21), frontend test (Task 20), manual smoke (Task 23)
  - Dependencies (Task 18 step 1)
  - Security considerations are encoded in tests (PKCE verify in 4 and 11; reused-code rejection in 11; rotation in 12; tenant isolation in 21)

- [ ] **Placeholder scan**: searched for "TBD", "TODO", "implement later", "similar to" — none present. `zodToJsonSchema` returns `{ type: 'object' }` deliberately for v0 and is documented as a roadmap item in the code comment, not a placeholder.

- [ ] **Type consistency**: `ToolContext` and `ToolResult` are defined in Task 14 (`list-projects.ts`) and imported by Tasks 15, 16, 17. Tool names match between the registry in `server.ts` (Task 18) and the tests in Task 18 (`names.sort()` check). The `dispatchToBackend` signature is consistent across all tool tasks.

- [ ] **Refresh token TTL**: spec said 30 days; existing code uses 7. Plan adopts 7 to match existing infra; spec comment in Task 11 notes the deviation.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-mcp-remote-server.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

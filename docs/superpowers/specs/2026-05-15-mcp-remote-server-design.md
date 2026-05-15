# Remote MCP Server for SnapFlow — Design

**Status:** Approved (brainstorming complete, awaiting user review before implementation plan)
**Date:** 2026-05-15
**Scope:** v0 — read-only

## Overview

Add a Model Context Protocol (MCP) server to SnapFlow so that MCP-compatible clients
(Claude.ai web, Claude Desktop, Claude Code, etc.) can read project, total, and
catalog data through a user-friendly OAuth login. The server lives inside the
existing Hono backend; no new service, no third-party auth provider.

A user adds `https://<snapflow-host>/mcp` as a custom connector in their MCP
client once, logs in via the standard SnapFlow login, approves a consent screen,
and from that point the MCP tools are available in every chat without further
setup.

## Goals

- One-time OAuth setup per user, then the connector "just works"
- Spec-compliant remote MCP — usable from Claude.ai, Claude Desktop, Claude Code,
  and any other MCP client that implements OAuth 2.1 with Dynamic Client
  Registration
- Reuse the existing JWT/user/tenant model; no duplicate identity store
- MCP tool calls are indistinguishable from frontend API calls at the
  business-logic layer (same routes, same middleware, same validation, same
  tenant scoping)

## Non-Goals (v0)

- Write operations (create/update/delete) — read only for v0
- File uploads (floorplan images, Excel imports)
- Placement-on-canvas operations (deferred until area-anchored placement is
  designed)
- Admin operations (catalog management, user management)
- Multi-tenant tenant switching during one MCP session (a user is bound to the
  tenant their JWT carries)

## Architecture

```
                       ┌──────────────────────────────────────────┐
                       │   Hono app (one process, one deploy)     │
                       │                                          │
  React frontend ──────┼──▶  /api/projects   ──┐                  │
  (Bearer JWT from     │    /api/items       ──┤                  │
   /api/auth/login)    │    /api/floorplans  ──┤                  │
                       │    ...              ──┤                  │
                       │                       ├──▶  projectRepo  │
                       │                       │    itemRepo      │──▶ SQLite
                       │                       │    floorplanRepo │
                       │                       │    ...           │
  MCP client ──────────┼──▶  /mcp            ──┘                  │
  (Bearer JWT from     │    /oauth/*  (new OAuth flow)            │
   OAuth flow)         │    /.well-known/oauth-*                  │
                       └──────────────────────────────────────────┘
```

Two new entry points (`/mcp` and `/oauth/*`) sit on top of the existing
repositories and middleware. The MCP layer is a translation layer — it speaks
MCP protocol on the outside and dispatches to existing REST routes internally.

### Request dispatch pattern (critical)

MCP tools do **not** call repositories directly. Each tool builds an internal
`Request` object and dispatches it through the same Hono app via `app.fetch`:

```ts
const url = new URL('http://internal/api/projects')
if (args.query) url.searchParams.set('search', args.query)
const res = await app.fetch(new Request(url, {
  headers: { Authorization: `Bearer ${ctx.accessToken}` }
}))
```

This guarantees that:

- All route-level Zod validation runs
- All middleware runs (auth, role checks, tenant scoping)
- All cascade/business logic in route handlers runs
- All side effects fire
- Future changes to routes automatically apply to MCP — no "remember to update
  the MCP tool" footgun

`app.fetch` is Hono's standard execution model (Deno.serve uses it for every
real request). Performance overhead is negligible — no network, no socket.

## File Layout

New files under `backend/src/`:

```
routes/
  oauth.ts              # OAuth 2.1 endpoints + DCR + metadata
  mcp.ts                # /mcp Streamable HTTP endpoint
  oauth-consent.ts      # HTML consent page (GET + POST)

services/
  oauth/
    clients.ts          # Register/lookup OAuth clients
    auth-codes.ts       # Issue/consume auth codes (with PKCE verify)
    metadata.ts         # Builds the two metadata JSON docs

  mcp/
    server.ts           # MCP Server instance + tool registration
    context.ts          # Bridges Hono context → MCP tool context
    tools/
      list-projects.ts
      get-project.ts
      get-project-total.ts
      search-items.ts

repositories/
  oauth-client-repo.ts
  oauth-code-repo.ts

scripts/migrations/
  NNN_oauth_clients.sql
```

Modified files:

- `main.ts` — mount `oauthRoutes` at `/oauth`, `mcpRoutes` at `/mcp`, plus two
  metadata endpoints under `/.well-known/`
- `middleware/auth.ts` — unchanged; MCP route uses existing `authMiddleware`
  as-is

## OAuth 2.1 Design

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/.well-known/oauth-authorization-server` | Authorization server metadata (RFC 8414) |
| GET | `/.well-known/oauth-protected-resource` | Protected resource metadata (RFC 9728) |
| POST | `/oauth/register` | Dynamic Client Registration (RFC 7591) |
| GET | `/oauth/authorize` | Start authorization flow → redirect to login or consent |
| POST | `/oauth/consent` | User clicks Allow → issue auth code, redirect to client |
| POST | `/oauth/token` | Exchange code or refresh token for access token |

Supported features:

- Grant types: `authorization_code`, `refresh_token`
- PKCE required (`S256`)
- Token format: JWT (reuses existing JWT signing key and claim shape)
- Access token TTL: 15 minutes (matches existing JWT TTL)
- Refresh token: opaque, stored in existing `refresh_tokens` table, 30-day TTL,
  rotated on every refresh

### Browser session bridge

The existing SnapFlow frontend uses Bearer JWT in the `Authorization` header,
not cookies. The OAuth consent page is a browser navigation, so it needs a way
to identify the logged-in user. The bridge:

- The OAuth `/oauth/authorize` route checks for a short-lived `oauth_session`
  cookie (HTTP-only, Secure, SameSite=Lax)
- If absent, redirects the browser to the existing frontend login page with
  `?return_to=<original /oauth/authorize URL>`
- The backend's `POST /api/auth/login` route sets the `oauth_session` cookie
  via a `Set-Cookie` header in its response (in addition to returning the JWT
  in the response body). The cookie is set unconditionally; it's only ever
  used by the OAuth flow.
- The frontend login page reads the `return_to` query parameter on successful
  login and navigates to it instead of the dashboard

Frontend impact: only the login page's post-success redirect logic. No other
frontend changes. The regular API still uses Bearer JWT exclusively; the
cookie is *only* read by `/oauth/authorize` and `/oauth/consent`.

### End-to-end flow

1. User pastes `https://<snapflow-host>/mcp` into their MCP client's connector
   settings.
2. Client fetches `/.well-known/oauth-protected-resource` → discovers auth
   server URL.
3. Client fetches `/.well-known/oauth-authorization-server` → discovers
   endpoints.
4. Client POSTs `/oauth/register` → receives `client_id`.
5. Client opens a browser to `/oauth/authorize?client_id=...&redirect_uri=...&code_challenge=...&...`.
6. User logs in (if not already) → consent page shows
   "Allow Claude to access SnapFlow as <email>".
7. User clicks Allow → backend issues auth code (60s TTL), redirects to
   `redirect_uri?code=...&state=...`.
8. Client POSTs `/oauth/token` with `code` + `code_verifier` → verifies PKCE,
   issues access JWT + refresh token.
9. Client calls `/mcp` with `Authorization: Bearer <access_token>` → tools run
   as that user.
10. On token expiry: client POSTs `/oauth/token` with refresh token → new pair.

### Database

Two new tables (one migration):

```sql
CREATE TABLE oauth_clients (
  id            TEXT PRIMARY KEY,            -- client_id
  client_secret TEXT,                        -- optional, hashed
  redirect_uris TEXT NOT NULL,               -- JSON array
  client_name   TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE oauth_auth_codes (
  code           TEXT PRIMARY KEY,
  client_id      TEXT NOT NULL REFERENCES oauth_clients(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  redirect_uri   TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  scope          TEXT,
  expires_at     TIMESTAMP NOT NULL,
  consumed_at    TIMESTAMP
);

CREATE INDEX idx_oauth_codes_expires ON oauth_auth_codes(expires_at);
```

The existing `refresh_tokens` table is reused unchanged. The hourly cleanup job
in `main.ts` extends to also delete expired/consumed auth codes.

## MCP Tool Surface (v0)

Four read-only tools. Each is a thin wrapper around an existing REST route via
`app.fetch`. Schemas are validated with Zod (consistent with route validation).

### `list_projects`

- **Description**: "List SnapFlow projects in your workspace. Returns id, name,
  customer name, status, creation date. Use `query` to filter by name."
- **Input**: `{ query?: string }`
- **Dispatches**: `GET /api/projects?search={query}`

### `get_project`

- **Description**: "Get full details for a single SnapFlow project — customer
  info, floorplans, BOM entries."
- **Input**: `{ project_id: number }`
- **Dispatches**: `GET /api/projects/{project_id}`

### `get_project_total`

- **Description**: "Get the itemized total/pricing summary for a project — list
  price, discounts, tax, grand total."
- **Input**: `{ project_id: number }`
- **Dispatches**: `GET /api/projects/{project_id}/total`

### `search_items`

- **Description**: "Search the SnapFlow product catalog. Filter by name,
  category, or item type."
- **Input**: `{ query?: string, category_id?: number, type_id?: number, limit?: number }`
  (limit defaults to 20, max 100)
- **Dispatches**: `GET /api/items?search=...&category_id=...&type_id=...&limit=...`

### Tool response shape

Each tool returns an MCP content block:

```ts
{ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
```

On underlying route error:

```ts
{ isError: true, content: [{ type: 'text', text: 'Failed to ...: <message>' }] }
```

Tools never throw — errors propagate as MCP errors so the LLM can recover.

## Error Handling

Three failure layers, each handled distinctly:

1. **OAuth errors**: standard OAuth 2.1 JSON responses (`{ error, error_description }`)
   with appropriate HTTP status. Lets MCP clients trigger re-auth on
   `invalid_grant`.
2. **MCP transport errors** (missing/invalid bearer): `401` with a
   `WWW-Authenticate: Bearer resource_metadata="..."` header so the client can
   discover where to re-authenticate.
3. **Tool execution errors**: caught inside the tool, returned as
   `{ isError: true, content: ... }`. Never throw out of a tool handler.

## Testing Strategy

Following existing backend test conventions (Deno test, in-memory SQLite from
`tests/test-utils.ts`).

### OAuth endpoint tests (`backend/tests/routes/oauth_test.ts`)

- Happy path: register client → authorize → consent → token exchange (with
  PKCE) → token authorizes `/mcp` requests
- Failure paths: wrong PKCE verifier, expired code, reused code, wrong
  redirect_uri, invalid/revoked refresh token
- Refresh token rotation: refreshing invalidates the old refresh token
- Metadata documents are valid JSON conforming to RFC 8414 and RFC 9728

### MCP tool tests (`backend/tests/mcp/tools_test.ts`)

- Each of the 4 tools called with a real JWT → response matches the equivalent
  REST call
- **Tenant isolation test**: a tool called with tenant-A's JWT cannot see
  tenant-B's data. This is the test that proves `app.fetch` is genuinely going
  through `authMiddleware` and not bypassing it.
- Tool error response: when underlying route returns 404, tool returns
  `isError: true` (not a thrown exception)

### Frontend test

One small test for the login page: navigates to `return_to` on successful
login when the query parameter is present, falls back to the dashboard
otherwise. Target test suite depends on whether v0 wires up `frontend/` or
`frontend-v2/` (see Open Questions).

### Manual end-to-end smoke test

Documented as a checklist in the implementation plan:

1. Deploy to public host
2. Paste `https://<host>/mcp` into Claude.ai connector settings
3. Walk through OAuth login + consent
4. Ask Claude "list my projects" → verify expected data returned
5. Repeat from Claude Desktop and Claude Code → confirm one OAuth flow handles
   all three clients

## Dependencies

- `@modelcontextprotocol/sdk` (TypeScript SDK, npm) — imported via Deno's
  `npm:` specifier, consistent with how `hono`, `zod`, `xlsx`, `sharp` are
  already imported
- No new runtime dependencies for OAuth — built on existing `djwt`, `zod`, and
  Web Crypto APIs

## Security Considerations

- **PKCE required**: prevents authorization code interception
- **Auth code TTL is 60 seconds**, single-use
- **Refresh token rotation**: each refresh invalidates the previous token
- **Tenant scoping is enforced at the route layer**, not the MCP layer —
  bypassing the MCP layer (e.g., via stolen access token) hits the same auth
  middleware as the React app, so there is no additional attack surface
- **DCR is unrestricted by design**: any client can register, but this only
  yields a `client_id`, which is useless without a user completing the consent
  flow. The user is always in the loop for granting access to their data.
- **Bearer JWTs are short-lived (15 min)**: stolen access tokens have minimal
  lifetime; refresh tokens can be revoked via existing token table

## Open Questions / Future Work

- **Frontend target**: the repo has both `frontend/` and `frontend-v2/`. The
  small login-page change needs to land in whichever is the active surface for
  user logins. To be confirmed before implementation.
- **Scope claims**: v0 uses a single implicit scope ("read"). Future writes
  will introduce explicit scopes (e.g., `projects:read`, `projects:write`) so
  users can grant read-only access without write capability.
- **Per-client revocation UI**: deferred. v0 relies on user revoking the refresh
  token (no UI yet). Add an admin/profile page later.
- **Rate limiting on `/mcp`**: deferred. Tools dispatch to existing routes that
  already have per-route rate limiting; the MCP layer itself doesn't add limits
  yet.
- **Audit log**: deferred. The existing logger captures all REST calls
  (including MCP-dispatched ones) by virtue of going through `app.fetch`, so
  basic auditing exists.

## Acceptance Criteria

v0 is complete when:

1. A new SnapFlow user can paste `https://<host>/mcp` into Claude.ai's connector
   UI, complete OAuth login + consent, and see the 4 tools appear in a chat.
2. Asking Claude "list my projects" returns the user's projects, scoped to
   their tenant.
3. The same flow works in Claude Desktop and Claude Code from the same OAuth
   registration.
4. All new tests pass; existing tests are unaffected.
5. `deno lint` and `npm run lint` pass.

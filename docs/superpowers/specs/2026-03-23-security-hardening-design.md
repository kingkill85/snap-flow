# Security Hardening — Design Spec

## Context

SnapFlow is an internet-facing smart home automation proposal generator (Deno + Hono + SQLite backend, React frontend). A comprehensive code review identified 12 security issues. One (IDOR/BOLA) was confirmed as intentional shared-workspace design. The remaining 11 are addressed here.

## Scope

11 security fixes in 3 batches. Each batch is independently deployable.

---

## Batch 1 — File Upload Hardening

### 1.1 Path Traversal in `/uploads/*` Static File Serving

**Files:** `backend/src/main.ts` (lines 118-119), `backend/src/middleware/upload.ts` (lines 152-153)

**Problem:** The `/uploads/*` route concatenates the raw request path into a filesystem path without sanitization. A request like `/uploads/../../backend/src/config/env.ts` could serve arbitrary server files.

**Fix:**
- In the `/uploads/*` handler in `main.ts`, after extracting `filePath`:
  1. Use `path.resolve(env.UPLOAD_DIR, filePath)` to get the absolute path
  2. Use `path.resolve(env.UPLOAD_DIR)` to get the canonical upload base
  3. Assert the resolved path starts with the canonical base + `/`
  4. Return 404 if the assertion fails
- Remove or fix the duplicate dead code in `upload.ts` (`serveUploadsMiddleware`)

**Acceptance criteria:**
- `GET /uploads/../../etc/passwd` returns 404
- `GET /uploads/%2e%2e%2f%2e%2e%2fetc/passwd` returns 404
- `GET /uploads/items/valid-image.jpg` still works
- The unused `serveUploadsMiddleware` in `upload.ts` is removed (dead code)

### 1.2 Magic Byte Validation on File Uploads

**File:** `backend/src/middleware/upload.ts` (lines 77-85)

**Problem:** MIME type validation relies solely on the client-supplied `Content-Type` header. An attacker can upload any file by setting `Content-Type: image/jpeg`.

**Fix:**
- After reading the file buffer in the upload middleware, before calling `saveFile`:
  1. Read the first 12 bytes of the buffer
  2. Check against known magic bytes:
     - JPEG: `FF D8 FF`
     - PNG: `89 50 4E 47`
     - WebP: `52 49 46 46` at offset 0 and `57 45 42 50` at offset 8
  3. For Excel uploads (the `skipValidation` path), check for:
     - XLSX (ZIP): `50 4B 03 04`
     - XLS (OLE): `D0 CF 11 E0`
  4. Reject with 400 if magic bytes don't match any allowed format

**Acceptance criteria:**
- A `.php` file renamed to `.jpg` with `Content-Type: image/jpeg` is rejected
- Valid JPEG, PNG, WebP files upload successfully
- Valid XLSX files upload successfully via the Excel import path
- Error response: `{ "error": "Invalid file format" }`

---

## Batch 2 — Auth & Token Hardening

### 2.1 Refresh Token Rotation

**Files:** `backend/src/services/refresh-token.ts` (lines 69-101), `backend/src/routes/auth.ts` (lines 107-137), `frontend/src/services/auth.ts`, `frontend/src/services/api.ts`

**Problem:** The same refresh token is valid for the full 7-day window. If exfiltrated, an attacker can generate access tokens indefinitely.

**Fix — Backend:**
- In `verifyRefreshToken` (or in the `/auth/refresh` route handler):
  1. After validating the token, delete it from the `refresh_tokens` table
  2. Generate a new refresh token via `generateRefreshToken`
  3. Store the new token in the database
  4. Return both the new access token AND the new refresh token in the response body:
     ```json
     { "data": { "accessToken": "...", "refreshToken": "..." } }
     ```

**Fix — Frontend:**
- In `auth.ts`, update the `refreshToken` method to store the new refresh token from the response
- In `api.ts`, the interceptor's refresh callback should call `authService.refreshToken()` which already handles storage — no additional changes needed if `refreshToken()` is updated

**Acceptance criteria:**
- After a refresh, the old refresh token returns 401 on subsequent use
- The new refresh token works for the next refresh
- Frontend seamlessly handles the rotation (no user-visible change)
- Concurrent requests during refresh still work (the subscriber queue pattern is preserved)

### 2.2 Input Validation on `PUT /auth/me`

**File:** `backend/src/routes/auth.ts` (lines 165-216)

**Problem:** No Zod schema. No length limits on name/email/password. Every other write endpoint uses `zValidator`.

**Fix:**
- Create an `updateProfileSchema` with:
  - `full_name`: `z.string().min(1).max(255).optional()`
  - `email`: `z.string().email().optional()`
  - `password`: `z.string().min(12).optional()` (new minimum, see 2.3)
  - `current_password`: `z.string().min(1)` (required when changing password)
- Apply via `zValidator('json', updateProfileSchema)` middleware on the route

**Acceptance criteria:**
- Requests with missing/invalid fields return 400 with Zod error details
- Valid requests still work as before
- Password changes require `current_password`

### 2.3 Raise Password Minimum Length

**Files:** `backend/src/routes/auth.ts` (line 20), `backend/src/routes/users.ts` (line 13)

**Problem:** Minimum password length is 6 characters. NIST SP 800-63B recommends at least 8; modern guidance suggests 12+.

**Fix:**
- Change `z.string().min(6)` to `z.string().min(12)` in both `loginSchema` (registration path) and `createUserSchema`
- Update `updateProfileSchema` (from 2.2) to use `.min(12)` as well

**Acceptance criteria:**
- Registration with an 11-character password returns 400
- Registration with a 12-character password succeeds
- Existing users with short passwords can still log in (no retroactive enforcement)

### 2.4 Schedule `cleanupExpiredTokens`

**File:** `backend/src/services/refresh-token.ts` (lines 135-141), `backend/src/main.ts`

**Problem:** The cleanup function exists but is never called. The `refresh_tokens` table grows indefinitely.

**Fix:**
- In `main.ts`, after app setup and before `Deno.serve`:
  1. Import `cleanupExpiredTokens` from the refresh token service
  2. Call it once at startup
  3. Set a `setInterval` to call it every hour: `setInterval(cleanupExpiredTokens, 60 * 60 * 1000)`

**Acceptance criteria:**
- Expired tokens are cleaned up on server start
- Expired tokens are cleaned up hourly while the server runs

---

## Batch 3 — Network & Miscellaneous

### 3.1 Rate Limiting — Fix IP Detection

**File:** `backend/src/middleware/rate-limit.ts` (lines 43-46)

**Problem:** `X-Forwarded-For` and `X-Real-IP` are client-controllable. All clients without headers share a single `'unknown'` bucket.

**Fix:**
- Replace the current `getClientIp` implementation:
  1. Use Hono's `c.env` to access the Deno `ConnInfo` or `remoteAddr` from the underlying server connection
  2. Only trust `X-Forwarded-For` / `X-Real-IP` if an env var `TRUSTED_PROXY=true` is set (opt-in)
  3. Remove the `'unknown'` fallback — use `'no-ip'` with a very restrictive limit (e.g., 3 requests/window) to force proper IP detection rather than silently allowing abuse
- Add `TRUSTED_PROXY` to `env.ts` config (default: `false`)

**Acceptance criteria:**
- Without `TRUSTED_PROXY=true`, `X-Forwarded-For` header is ignored
- Client IP is derived from the transport connection
- With `TRUSTED_PROXY=true`, the rightmost non-private IP from `X-Forwarded-For` is used
- No shared bucket for unknown IPs

### 3.2 CORS — Remove Localhost Allowance in Production

**File:** `backend/src/main.ts` (lines 29-57)

**Problem:** The production CORS branch allows all `localhost` and LAN IPs (`192.168.x.x`, `10.x.x.x`).

**Fix:**
- In the production branch of the CORS `origin` function:
  1. Remove the `localhost` check
  2. Remove the LAN IP regex checks
  3. Only allow origins matching `env.CORS_ORIGIN`
- Keep the localhost/LAN allowance in the development (`NODE_ENV !== 'production'`) branch only

**Acceptance criteria:**
- In production, `Origin: http://localhost:5173` is rejected
- In production, only `CORS_ORIGIN` value is allowed
- In development, localhost and LAN IPs still work

### 3.3 Excel Import — Validate Preview Payload

**File:** `backend/src/routes/items.ts` (lines 774-791)

**Problem:** The `preview` JSON object is passed directly to `executeImport` with no structural validation.

**Fix:**
- Create a Zod schema for the preview structure matching what `importPreview` returns:
  ```
  previewSchema = z.object({
    items: z.array(z.object({
      name: z.string(),
      model_number: z.string().optional(),
      category_name: z.string().optional(),
      ... (match the actual ExcelPreviewItem shape)
    })),
    errors: z.array(...).optional(),
    warnings: z.array(...).optional(),
  })
  ```
- Validate with `previewSchema.parse(preview)` before calling `executeImport`

**Acceptance criteria:**
- A crafted payload with unexpected fields is rejected
- A valid preview from `/import-preview` passes validation
- Error response matches the standard format

### 3.4 Require Auth for `include_inactive` Parameter

**File:** `backend/src/routes/items.ts` (lines 29-70)

**Problem:** `include_inactive=true` on `GET /items` is accessible without authentication, exposing hidden catalog items.

**Fix:**
- In the `GET /items` handler, check if `include_inactive` is requested:
  1. If yes, verify the request has a valid auth context (`c.get('userId')`)
  2. If not authenticated, silently ignore the parameter (treat as `false`)
- Same treatment for `GET /items/:id/variants`

**Acceptance criteria:**
- Unauthenticated `GET /items?include_inactive=true` returns only active items
- Authenticated `GET /items?include_inactive=true` returns all items
- No change to the default behavior (active items only)

### 3.5 Remove Error Details from Placement 500 Response

**File:** `backend/src/routes/placements.ts` (line 111)

**Problem:** Only the `POST /placements` handler includes raw error message in the 500 response.

**Fix:**
- Change `return c.json({ error: 'Internal server error', details: errorMessage }, 500)` to `return c.json({ error: 'Internal server error' }, 500)`
- Keep the `console.error` for server-side logging

**Acceptance criteria:**
- 500 responses from `POST /placements` no longer include `details`
- Error is still logged server-side

---

## Out of Scope

- **IDOR/ownership checks** — confirmed intentional shared-workspace design. Add a comment in `main.ts` or CLAUDE.md documenting this decision.
- **Login rate limit window tuning** — fixing the IP detection (3.1) addresses the root cause
- **`.env` file in repo** — verify `.gitignore` separately; not a code change
- **Uploads CORS `*` header** (line 143 of `main.ts`) — low severity, defer

## Testing Strategy

- Each batch gets its own test additions in `backend/tests/`
- Path traversal: add a test in the upload/static serving test file
- Magic bytes: unit test the validation function with valid/invalid buffers
- Token rotation: update existing auth tests to verify old token rejection
- Rate limiting: test that spoofed headers are ignored
- Frontend: verify the refresh interceptor stores the new refresh token

## Shared-Workspace Documentation

Add a comment block in `main.ts` near the route mounting section:
```typescript
// NOTE: All authenticated users share a single workspace by design.
// There are no per-user ownership checks on projects, floorplans,
// or placements. This is intentional for single-business deployments.
```

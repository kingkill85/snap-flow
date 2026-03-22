# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden SnapFlow's backend security across file uploads, auth/token handling, and network configuration.

**Architecture:** 11 fixes in 3 independent batches. Each batch produces a commit. All changes are backend-only except Task 4 (frontend token rotation). Tests use the existing in-memory SQLite test harness.

**Tech Stack:** Deno, Hono, Zod, SQLite, bcrypt, Vitest (frontend tests)

**Spec:** `docs/superpowers/specs/2026-03-23-security-hardening-design.md`

---

## File Structure

### Files to modify
- `backend/src/main.ts` — path traversal fix, CORS cleanup, Deno.serve ConnInfo, token cleanup scheduling, shared-workspace comment
- `backend/src/middleware/upload.ts` — magic byte validation, remove dead `serveUploadsMiddleware`
- `backend/src/middleware/rate-limit.ts` — IP detection from transport layer
- `backend/src/routes/auth.ts` — refresh token rotation, `PUT /auth/me` validation, import `revokeRefreshToken`
- `backend/src/routes/users.ts` — password minimum length
- `backend/src/routes/items.ts` — excel preview validation, `include_inactive` auth gate
- `backend/src/routes/placements.ts` — remove error details leak
- `backend/src/services/refresh-token.ts` — fix cleanup query retention window
- `backend/src/config/env.ts` — add `TRUSTED_PROXY` env var
- `frontend/src/services/auth.ts` — store rotated refresh token

### Files to create
- `backend/src/utils/magic-bytes.ts` — magic byte validation utility
- `backend/tests/routes/security_test.ts` — path traversal + upload security tests
- `backend/tests/routes/auth-security_test.ts` — token rotation + profile validation tests

---

## Task 1: Path Traversal Fix

**Files:**
- Modify: `backend/src/main.ts:117-171`
- Modify: `backend/src/middleware/upload.ts:147-187`
- Modify: `backend/deno.json` (add `@std/path` import)
- Test: `backend/tests/routes/security_test.ts`

- [ ] **Step 1: Add `@std/path` to deno.json imports**

In `backend/deno.json`, add to the `"imports"` block:

```json
"@std/path": "jsr:@std/path@^1.0.0"
```

- [ ] **Step 2: Write the failing test for path traversal**

Create `backend/tests/routes/security_test.ts`:

```typescript
import { assertEquals } from '@std/assert';
import { setupTestDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';

await setupTestDatabase();

Deno.test('Security - path traversal via /uploads/../../ returns 404', async () => {
  const response = await testRequest('/uploads/../../etc/passwd');
  assertEquals(response.status, 404);
});

Deno.test('Security - URL-encoded path traversal returns 404', async () => {
  const response = await testRequest('/uploads/%2e%2e%2f%2e%2e%2fetc/passwd');
  assertEquals(response.status, 404);
});

Deno.test('Security - normal upload path still works (returns 404 for missing file, not 500)', async () => {
  const response = await testRequest('/uploads/items/nonexistent.jpg');
  assertEquals(response.status, 404);
  const data = await parseJSON(response);
  assertEquals(data.error, 'File not found');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && deno test --allow-all tests/routes/security_test.ts`
Expected: First two tests may pass accidentally (file not found) or fail depending on path resolution. Third should pass.

- [ ] **Step 4: Implement path traversal fix in main.ts**

In `backend/src/main.ts`, add import at top:

```typescript
import { resolve } from '@std/path';
```

Replace lines 117-119 (the filePath extraction):

```typescript
// Serve uploaded files statically at /uploads/*
app.get('/uploads/*', async (c: Context) => {
  const filePath = c.req.path.replace('/uploads/', '');

  // Prevent path traversal
  const uploadBase = resolve(env.UPLOAD_DIR);
  const fullPath = resolve(env.UPLOAD_DIR, filePath);
  if (!fullPath.startsWith(uploadBase + '/')) {
    return c.json({ error: 'File not found' }, 404);
  }
```

Keep the rest of the handler (lines 121-171) unchanged.

- [ ] **Step 5: Remove dead `serveUploadsMiddleware` from upload.ts**

Delete lines 146-187 in `backend/src/middleware/upload.ts` (the comment block and entire `serveUploadsMiddleware` function).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && deno test --allow-all tests/routes/security_test.ts`
Expected: All 3 tests PASS

- [ ] **Step 7: Run full backend test suite to check for regressions**

Run: `cd backend && deno test --allow-all`
Expected: All existing tests PASS

- [ ] **Step 8: Commit**

```bash
git add backend/deno.json backend/src/main.ts backend/src/middleware/upload.ts backend/tests/routes/security_test.ts
git commit -m "security: fix path traversal in /uploads/* and remove dead code"
```

---

## Task 2: Magic Byte Validation

**Files:**
- Create: `backend/src/utils/magic-bytes.ts`
- Modify: `backend/src/middleware/upload.ts:76-96`
- Test: `backend/tests/routes/security_test.ts` (append)

- [ ] **Step 1: Write the failing test for magic byte validation**

Append to `backend/tests/routes/security_test.ts`:

```typescript
import { validateMagicBytes } from '../../src/utils/magic-bytes.ts';

Deno.test('Magic bytes - valid JPEG is accepted', () => {
  const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assertEquals(validateMagicBytes(jpeg, 'image'), true);
});

Deno.test('Magic bytes - valid PNG is accepted', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x00]);
  assertEquals(validateMagicBytes(png, 'image'), true);
});

Deno.test('Magic bytes - valid WebP is accepted', () => {
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  assertEquals(validateMagicBytes(webp, 'image'), true);
});

Deno.test('Magic bytes - valid XLSX is accepted', () => {
  const xlsx = new Uint8Array([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  assertEquals(validateMagicBytes(xlsx, 'excel'), true);
});

Deno.test('Magic bytes - random bytes rejected for image', () => {
  const fake = new Uint8Array([0x3C, 0x3F, 0x70, 0x68, 0x70, 0x20, 0x65, 0x63, 0x68, 0x6F, 0x20, 0x31]);
  assertEquals(validateMagicBytes(fake, 'image'), false);
});

Deno.test('Magic bytes - empty buffer rejected', () => {
  const empty = new Uint8Array(0);
  assertEquals(validateMagicBytes(empty, 'image'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && deno test --allow-all tests/routes/security_test.ts --filter "Magic bytes"`
Expected: FAIL — `validateMagicBytes` does not exist

- [ ] **Step 3: Create magic-bytes.ts utility**

Create `backend/src/utils/magic-bytes.ts`:

```typescript
/**
 * Validate file content by checking magic bytes.
 * Returns true if the buffer matches a known format for the given type.
 */
export function validateMagicBytes(buffer: Uint8Array, type: 'image' | 'excel'): boolean {
  if (buffer.length < 4) return false;

  if (type === 'image') {
    // JPEG: FF D8 FF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return true;
    }
    // PNG: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      return true;
    }
    // WebP: 52 49 46 46 at 0, 57 45 42 50 at 8
    if (buffer.length >= 12 &&
        buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
        buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      return true;
    }
    return false;
  }

  if (type === 'excel') {
    // XLSX (ZIP): 50 4B 03 04
    if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
      return true;
    }
    // XLS (OLE): D0 CF 11 E0
    if (buffer[0] === 0xD0 && buffer[1] === 0xCF && buffer[2] === 0x11 && buffer[3] === 0xE0) {
      return true;
    }
    return false;
  }

  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && deno test --allow-all tests/routes/security_test.ts --filter "Magic bytes"`
Expected: All 6 magic byte tests PASS

- [ ] **Step 5: Integrate magic byte check into upload middleware**

In `backend/src/middleware/upload.ts`, add import at top:

```typescript
import { validateMagicBytes } from '../utils/magic-bytes.ts';
```

After the `skipValidation` block (line 96), replace the `const fileBuffer = await file.arrayBuffer();` on line 99 and restructure so the buffer read happens before the magic byte check:

```typescript
      // Read file buffer (needed for magic byte validation and saving)
      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);

      // Validate magic bytes regardless of skipValidation
      const magicType = skipValidation ? 'excel' : 'image';
      if (!validateMagicBytes(fileBytes, magicType)) {
        c.set('uploadResult', {
          success: false,
          error: 'Invalid file format',
        });
        await next();
        return;
      }

      let buffer: Uint8Array;
```

Then remove the duplicate `const fileBuffer = await file.arrayBuffer();` that was on the old line 99, and replace all `new Uint8Array(fileBuffer)` references with `fileBytes`.

- [ ] **Step 6: Run full test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/utils/magic-bytes.ts backend/src/middleware/upload.ts backend/tests/routes/security_test.ts
git commit -m "security: add magic byte validation for file uploads"
```

---

## Task 3: Refresh Token Rotation (Backend)

**Files:**
- Modify: `backend/src/routes/auth.ts:7-11,106-137`
- Modify: `backend/src/services/refresh-token.ts:135-141`
- Test: `backend/tests/routes/auth-security_test.ts`

- [ ] **Step 1: Write the failing test for token rotation**

Create `backend/tests/routes/auth-security_test.ts`:

```typescript
import { assertEquals, assertExists, assertNotEquals } from '@std/assert';
import { setupTestDatabase, clearDatabase } from '../test-utils.ts';
import { testRequest, parseJSON } from '../test-client.ts';
import { hashPassword } from '../../src/services/password.ts';

await setupTestDatabase();
const { userRepository } = await import('../../src/repositories/user.ts');

Deno.test('Token rotation - refresh returns new refresh token', async () => {
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({
    email: 'rotation@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Login to get initial tokens
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rotation@example.com', password: 'testpassword123' }),
  });
  const loginData = await parseJSON(loginRes);
  const originalRefreshToken = loginData.data.refreshToken;

  // Refresh — should get new access token AND new refresh token
  const refreshRes = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: originalRefreshToken }),
  });
  const refreshData = await parseJSON(refreshRes);

  assertEquals(refreshRes.status, 200);
  assertExists(refreshData.data.accessToken);
  assertExists(refreshData.data.refreshToken);
  assertNotEquals(refreshData.data.refreshToken, originalRefreshToken);
});

Deno.test('Token rotation - old refresh token is rejected after rotation', async () => {
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({
    email: 'rotation2@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Login
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'rotation2@example.com', password: 'testpassword123' }),
  });
  const loginData = await parseJSON(loginRes);
  const originalRefreshToken = loginData.data.refreshToken;

  // First refresh — succeeds
  await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: originalRefreshToken }),
  });

  // Second refresh with OLD token — should fail
  const replayRes = await testRequest('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: originalRefreshToken }),
  });

  assertEquals(replayRes.status, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && deno test --allow-all tests/routes/auth-security_test.ts`
Expected: FAIL — response does not include `refreshToken`, old token still works

- [ ] **Step 3: Implement token rotation in auth.ts**

In `backend/src/routes/auth.ts`, update the import on line 7-11 to include `revokeRefreshToken`:

```typescript
import {
  createRefreshToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from '../services/refresh-token.ts';
```

Replace the `/auth/refresh` handler body (lines 106-137):

```typescript
// POST /auth/refresh - Get new access token using refresh token
authRoutes.post('/refresh', refreshRateLimit(), zValidator('json', refreshSchema), async (c) => {
  const { refreshToken } = c.req.valid('json');

  try {
    // Verify refresh token
    const userId = await verifyRefreshToken(refreshToken);

    if (!userId) {
      return c.json({ error: 'Invalid or expired refresh token' }, 401);
    }

    // Revoke the used refresh token (soft-delete)
    await revokeRefreshToken(refreshToken);

    // Get user details
    const user = await userRepository.findById(userId);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Generate new access token
    const newAccessToken = await generateToken(user.id, user.email, user.role);

    // Generate new refresh token (rotation)
    const newRefreshToken = await createRefreshToken(user.id);

    return c.json({
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
      message: 'Token refreshed successfully',
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && deno test --allow-all tests/routes/auth-security_test.ts`
Expected: Both rotation tests PASS

- [ ] **Step 5: Fix cleanup query retention window**

In `backend/src/services/refresh-token.ts`, replace lines 135-141:

```typescript
export function cleanupExpiredTokens(): void {
  getDb().query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < datetime('now')
     OR (revoked_at IS NOT NULL AND revoked_at < datetime('now'))`
  );
}
```

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/services/refresh-token.ts backend/tests/routes/auth-security_test.ts
git commit -m "security: implement refresh token rotation and fix cleanup query"
```

---

## Task 4: Frontend Token Rotation Support

**Files:**
- Modify: `frontend/src/services/auth.ts:10-12,75-89`

- [ ] **Step 1: Update RefreshResponse type**

In `frontend/src/services/auth.ts`, update the `RefreshResponse` interface (lines 10-12):

```typescript
interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}
```

- [ ] **Step 2: Update refreshAccessToken to store new refresh token**

Replace the `refreshAccessToken` method (lines 75-89):

```typescript
  async refreshAccessToken(signal?: AbortSignal): Promise<string> {
    const refreshToken = this.getRefreshToken();

    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await api.post<ApiResponse<RefreshResponse>>('/auth/refresh', { refreshToken }, { signal });
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;

    // Store both new tokens (rotation)
    this.setTokens(accessToken, newRefreshToken);

    return accessToken;
  },
```

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/auth.ts
git commit -m "security: update frontend to handle refresh token rotation"
```

---

## Task 5: Input Validation on PUT /auth/me + Password Minimum

**Files:**
- Modify: `backend/src/routes/auth.ts:164-216`
- Modify: `backend/src/routes/users.ts:14`
- Test: `backend/tests/routes/auth-security_test.ts` (append)

- [ ] **Step 1: Write failing tests for profile validation**

Append to `backend/tests/routes/auth-security_test.ts`:

```typescript
Deno.test('PUT /auth/me - rejects password change without current_password', async () => {
  clearDatabase();

  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({
    email: 'profile@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Login to get access token
  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  // Try to change password without current_password
  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ password: 'newpassword12!' }),
  });

  assertEquals(updateRes.status, 400);
});

Deno.test('PUT /auth/me - rejects password change with wrong current_password', async () => {
  clearDatabase();

  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({
    email: 'profile2@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile2@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ password: 'newpassword12!', current_password: 'wrongpassword' }),
  });

  assertEquals(updateRes.status, 401);
});

Deno.test('PUT /auth/me - accepts password change with correct current_password', async () => {
  clearDatabase();

  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({
    email: 'profile3@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile3@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ password: 'newpassword12!', current_password: 'oldpassword12!' }),
  });

  assertEquals(updateRes.status, 200);
});

Deno.test('PUT /auth/me - rejects short password', async () => {
  clearDatabase();

  const passwordHash = hashPassword('oldpassword12!');
  await userRepository.create({
    email: 'profile4@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  const loginRes = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'profile4@example.com', password: 'oldpassword12!' }),
  });
  const loginData = await parseJSON(loginRes);
  const token = loginData.data.accessToken;

  const updateRes = await testRequest('/api/auth/me', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ password: 'short', current_password: 'oldpassword12!' }),
  });

  assertEquals(updateRes.status, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && deno test --allow-all tests/routes/auth-security_test.ts --filter "PUT /auth/me"`
Expected: FAIL — no validation, no current_password check

- [ ] **Step 3: Implement updateProfileSchema and validation in auth.ts**

In `backend/src/routes/auth.ts`, after the `refreshSchema` (line 104), add:

```typescript
const updateProfileSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(12).optional(),
  current_password: z.string().min(1).optional(),
}).refine(
  (data) => !data.password || data.current_password,
  { message: 'current_password is required when changing password', path: ['current_password'] }
);
```

Replace the `PUT /auth/me` handler (lines 164-216):

```typescript
// PUT /auth/me - Update current user profile
authRoutes.put('/me', authMiddleware, zValidator('json', updateProfileSchema), async (c) => {
  const userId = c.get('userId');
  const body = c.req.valid('json');

  try {
    const updateData: { full_name?: string; email?: string; password_hash?: string } = {};

    if (body.full_name !== undefined) {
      updateData.full_name = body.full_name;
    }

    if (body.email) {
      const existingUser = await userRepository.findByEmail(body.email);
      if (existingUser && existingUser.id !== userId) {
        return c.json({ error: 'Email already in use' }, 400);
      }
      updateData.email = body.email;
    }

    if (body.password) {
      // Verify current password
      const user = await userRepository.findByEmail(c.get('userEmail'));
      if (!user) {
        return c.json({ error: 'User not found' }, 404);
      }
      const isValid = comparePassword(body.current_password!, user.password_hash);
      if (!isValid) {
        return c.json({ error: 'Current password is incorrect' }, 401);
      }
      const { hashPassword } = await import('../services/password.ts');
      updateData.password_hash = hashPassword(body.password);
    }

    if (Object.keys(updateData).length === 0) {
      return c.json({ error: 'No fields to update' }, 400);
    }

    const updatedUser = await userRepository.update(userId, updateData);

    if (!updatedUser) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        full_name: updatedUser.full_name,
        role: updatedUser.role,
        created_at: updatedUser.created_at,
      },
      message: 'Profile updated successfully',
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});
```

- [ ] **Step 4: Raise password minimum in createUserSchema**

In `backend/src/routes/users.ts`, line 14, change:

```typescript
  password: z.string().min(12),
```

**Important:** Do NOT modify `loginSchema` in `backend/src/routes/auth.ts` line 20. It must stay at `.min(6)` (or lower) so existing users with short passwords can still log in. The login schema validates input format, not password strength — bcrypt handles the actual comparison.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && deno test --allow-all tests/routes/auth-security_test.ts --filter "PUT /auth/me"`
Expected: All 4 profile tests PASS

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS. Note: existing tests that create users with passwords shorter than 12 chars via the `POST /users` route will fail — update those test passwords to meet the new minimum.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/auth.ts backend/src/routes/users.ts backend/tests/routes/auth-security_test.ts
git commit -m "security: add profile validation, current_password check, raise password minimum to 12"
```

---

## Task 6: Schedule Token Cleanup

**Files:**
- Modify: `backend/src/main.ts:246-251`

- [ ] **Step 1: Add cleanup scheduling to main.ts**

In `backend/src/main.ts`, add import at top (with the other imports):

```typescript
import { cleanupExpiredTokens } from './services/refresh-token.ts';
```

After the seed admin block (line 251) and before the "Start server" comment (line 253), add:

```typescript
  // Schedule periodic cleanup of expired refresh tokens
  cleanupExpiredTokens();
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000); // Every hour
  console.log('🧹 Token cleanup scheduled (hourly)');
```

- [ ] **Step 2: Add shared-workspace documentation comment**

In `backend/src/main.ts`, before the route mounting section (before line 78 `const api = new Hono();`), add:

```typescript
// NOTE: All authenticated users share a single workspace by design.
// There are no per-user ownership checks on projects, floorplans,
// or placements. This is intentional for single-business deployments.
```

- [ ] **Step 3: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/main.ts
git commit -m "security: schedule token cleanup and document shared-workspace design"
```

---

## Task 7: Rate Limiting IP Detection Fix

**Files:**
- Modify: `backend/src/main.ts:257-266` (Deno.serve call)
- Modify: `backend/src/middleware/rate-limit.ts:38-46`
- Modify: `backend/src/config/env.ts:45-52,92-99`

- [ ] **Step 1: Add TRUSTED_PROXY to env.ts**

In `backend/src/config/env.ts`, add to the `Env` interface (after line 51):

```typescript
  TRUSTED_PROXY: boolean;
```

Add to the `env` export object (after line 98):

```typescript
  TRUSTED_PROXY: getEnvVar('TRUSTED_PROXY', 'false') === 'true',
```

- [ ] **Step 2: Update Deno.serve to pass ConnInfo**

In `backend/src/main.ts`, replace lines 257-266:

```typescript
  Deno.serve({
    port,
    hostname: '0.0.0.0',
    onListen: ({ hostname, port }) => {
      console.log(`✅ Server running at http://${hostname}:${port}`);
      console.log(`📊 Health check: http://${hostname}:${port}/health`);
      console.log(`🔒 API routes: http://${hostname}:${port}/api`);
      console.log(`🌐 Accessible from Windows at: http://localhost:${port}`);
    },
  }, (req, info) => {
    return app.fetch(req, { remoteAddr: info.remoteAddr });
  });
```

- [ ] **Step 3: Update getClientIdentifier in rate-limit.ts**

In `backend/src/middleware/rate-limit.ts`, add import at top:

```typescript
import { env } from '../config/env.ts';
```

Replace the `getClientIdentifier` function (lines 38-46):

```typescript
function getClientIdentifier(c: Context, key?: string): string {
  if (key) {
    return key;
  }

  // Primary: use transport-level IP (not spoofable)
  const remoteAddr = c.env?.remoteAddr?.hostname;

  // If TRUSTED_PROXY is enabled, prefer X-Forwarded-For
  if (env.TRUSTED_PROXY) {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded) {
      // Use rightmost non-private IP (last proxy in chain)
      const ips = forwarded.split(',').map(ip => ip.trim());
      for (let i = ips.length - 1; i >= 0; i--) {
        const ip = ips[i];
        if (!isPrivateIp(ip)) {
          return ip;
        }
      }
      // All IPs are private — use the last one
      return ips[ips.length - 1];
    }
  }

  return remoteAddr || 'no-ip';
}

function isPrivateIp(ip: string): boolean {
  return ip.startsWith('10.') ||
         ip.startsWith('172.16.') || ip.startsWith('172.17.') || ip.startsWith('172.18.') ||
         ip.startsWith('172.19.') || ip.startsWith('172.2') || ip.startsWith('172.3') ||
         ip.startsWith('192.168.') ||
         ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}
```

- [ ] **Step 4: Write test for IP spoofing protection**

Append to `backend/tests/routes/security_test.ts`:

```typescript
import { getClientIdentifier } from '../../src/middleware/rate-limit.ts';

Deno.test('Security - X-Forwarded-For header is ignored when TRUSTED_PROXY is false', async () => {
  // Default TRUSTED_PROXY is false
  // Make two login requests with spoofed X-Forwarded-For but same actual connection
  // Both should hit the same rate limit bucket (no bypass)
  clearDatabase();

  const passwordHash = hashPassword('testpassword123');
  await userRepository.create({
    email: 'ratelimit@example.com',
    password_hash: passwordHash,
    role: 'user',
  });

  // Make requests with different X-Forwarded-For headers
  // They should all count against the same bucket since TRUSTED_PROXY=false
  for (let i = 0; i < 11; i++) {
    await testRequest('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `1.2.3.${i}`,
      },
      body: JSON.stringify({ email: 'ratelimit@example.com', password: 'wrong' }),
    });
  }

  // 11th request should be rate limited (all share same bucket despite spoofed IPs)
  const response = await testRequest('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '9.9.9.9',
    },
    body: JSON.stringify({ email: 'ratelimit@example.com', password: 'wrong' }),
  });

  assertEquals(response.status, 429);
});
```

Note: Add `import { clearDatabase } from '../test-utils.ts';` and `import { hashPassword } from '../../src/services/password.ts';` to the imports at the top of `security_test.ts` if not already present.

- [ ] **Step 5: Run tests**

Run: `cd backend && deno test --allow-all tests/routes/security_test.ts`
Expected: All tests PASS. Tests use `testRequest` which calls `app.fetch` directly without `ConnInfo`, so `remoteAddr` will be `undefined` and the fallback `'no-ip'` will be used — this means all requests share the same bucket, which is exactly what we're testing.

- [ ] **Step 6: Commit**

```bash
git add backend/src/config/env.ts backend/src/main.ts backend/src/middleware/rate-limit.ts backend/tests/routes/security_test.ts
git commit -m "security: fix rate limit IP detection, use transport-level IP by default"
```

---

## Task 8: CORS Production Cleanup

**Files:**
- Modify: `backend/src/main.ts:23-58`

- [ ] **Step 1: Replace the CORS origin function**

In `backend/src/main.ts`, replace lines 23-58:

```typescript
app.use(cors({
  origin: (origin) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return '*';

    if (env.NODE_ENV === 'production') {
      // Only allow the configured origin
      if (origin === env.CORS_ORIGIN) {
        return origin;
      }

      // If CORS_ORIGIN is '*', allow all
      if (env.CORS_ORIGIN === '*') {
        return '*';
      }

      return env.CORS_ORIGIN;
    }

    // In development, allow all origins including localhost and LAN
    return origin || '*';
  },
  credentials: true,
}));
```

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS (tests run without NODE_ENV=production)

- [ ] **Step 3: Commit**

```bash
git add backend/src/main.ts
git commit -m "security: remove localhost/LAN CORS allowance from production"
```

---

## Task 9: Excel Import Validation + include_inactive Auth Gate + Error Leak Fix

**Files:**
- Modify: `backend/src/routes/items.ts:773-791,29-53`
- Modify: `backend/src/routes/placements.ts:111`

- [ ] **Step 1: Add Zod schema for import preview payload**

In `backend/src/routes/items.ts`, after the existing imports (line 12), add:

```typescript
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
```

Before the `POST /items/import` handler (before line 773), add:

```typescript
const importPreviewItemSchema = z.object({
  baseModelNumber: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
  dimensions: z.string(),
  variants: z.array(z.object({
    style: z.string(),
    price: z.number(),
    imageFilename: z.string().optional(),
  })),
  addons: z.array(z.object({
    slot: z.number(),
    modelNumber: z.string(),
    isRequired: z.boolean(),
    found: z.boolean(),
  })),
  existingItemId: z.number().optional(),
  action: z.enum(['create', 'update']),
});

const importPreviewSchema = z.object({
  preview: z.object({
    items: z.array(importPreviewItemSchema),
    errors: z.array(z.object({
      row: z.number(),
      field: z.string(),
      message: z.string(),
      value: z.string(),
    })),
    warnings: z.array(z.string()),
    summary: z.object({
      totalRows: z.number(),
      itemsToCreate: z.number(),
      itemsToUpdate: z.number(),
    }),
  }),
});
```

- [ ] **Step 2: Apply validation to import endpoint**

Replace the `POST /items/import` handler (lines 773-791):

```typescript
itemRoutes.post('/import', authMiddleware, adminMiddleware, zValidator('json', importPreviewSchema), async (c) => {
  try {
    const { preview } = c.req.valid('json');
    const result = await excelImportService.executeImport(preview);

    return c.json({
      data: result,
    });
  } catch (error) {
    console.error('Import execution error:', error);
    return c.json({ error: 'Failed to execute import' }, 500);
  }
});
```

- [ ] **Step 3: Gate `include_inactive` behind auth**

In the `GET /items` handler (around line 35), change:

```typescript
    const includeInactive = c.req.query('include_inactive') === 'true';
```

To:

```typescript
    // Only allow include_inactive for authenticated users
    const includeInactive = c.req.query('include_inactive') === 'true' && !!c.get('userId');
```

Note: This handler has no `authMiddleware`, so `c.get('userId')` will be `undefined` for unauthenticated requests. The `!!` coercion makes this safe.

Apply the same fix to `GET /items/:id/variants` (around line 397). Find the `includeInactive` assignment and change it to:

```typescript
    const includeInactive = c.req.query('include_inactive') === 'true' && !!c.get('userId');
```

- [ ] **Step 4: Write test for include_inactive auth gate**

Append to `backend/tests/routes/security_test.ts`:

```typescript
Deno.test('Security - unauthenticated include_inactive returns only active items', async () => {
  clearDatabase();

  // Create a category and items (one active, one inactive)
  const { categoryRepository } = await import('../../src/repositories/category.ts');
  const { itemRepository } = await import('../../src/repositories/item.ts');

  const category = await categoryRepository.create({ name: 'Test Category' });
  await itemRepository.create({ name: 'Active Item', category_id: category.id });
  const inactiveItem = await itemRepository.create({ name: 'Inactive Item', category_id: category.id });
  // Deactivate the second item
  await itemRepository.deactivate(inactiveItem.id);

  // Unauthenticated request with include_inactive=true should NOT return inactive items
  const response = await testRequest('/api/items?include_inactive=true');
  const data = await parseJSON(response);

  assertEquals(response.status, 200);
  assertEquals(data.data.length, 1);
  assertEquals(data.data[0].name, 'Active Item');
});
```

- [ ] **Step 5: Remove error details leak from placements**

In `backend/src/routes/placements.ts`, line 111, change:

```typescript
    return c.json({ error: 'Internal server error', details: errorMessage }, 500);
```

To:

```typescript
    return c.json({ error: 'Internal server error' }, 500);
```

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/items.ts backend/src/routes/placements.ts
git commit -m "security: validate import payload, gate include_inactive, remove error leak"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 2: Run backend linter**

Run: `cd backend && deno lint`
Expected: No errors

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 4: Run frontend linter**

Run: `cd frontend && npm run lint`
Expected: No errors

- [ ] **Step 5: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds with no type errors

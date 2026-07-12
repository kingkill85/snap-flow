# Show Inactive Catalog Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing “Show inactive” control return inactive products and styles for administrators without removing public active-only catalog access.

**Architecture:** Add optional JWT identity parsing that populates Hono context only when a valid bearer token is supplied. Apply it to the two public list routes and gate `include_inactive=true` on `userRole === 'admin'`.

**Tech Stack:** Deno 2.8, Hono, TypeScript, JWT, SQLite, Deno.test

## Global Constraints

- Public unauthenticated catalog reads remain available and active-only.
- Only administrators may retrieve inactive products or styles.
- API response formats, frontend controls, schema, and migrations remain unchanged.
- Use test-first development and preserve all existing tests.

---

### Task 1: Honor Show Inactive for Administrators

**Files:**
- Modify: `backend/tests/routes/items_test.ts`
- Modify: `backend/src/middleware/auth.ts`
- Modify: `backend/src/routes/items.ts`
- Modify: `backend/src/repositories/item.ts`

**Interfaces:**
- Produces: `optionalAuthMiddleware(c: Context, next: Next): Promise<Response | void>`.
- Produces: inactive-aware preview selection in `ItemRepository.findAll`.
- Preserves: public `GET /api/items` and `GET /api/items/:id/variants` behavior.

- [ ] **Step 1: Add failing route regression tests**

Add two tests to `backend/tests/routes/items_test.ts`. Each calls `getAdminToken()` first, creates one active and one inactive record, proves the public request omits the inactive record, then proves an administrator request with `include_inactive=true` includes both.

```typescript
Deno.test('GET /items - admin include_inactive returns inactive items', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  await itemRepository.create({
    category_id: category.id,
    name: 'Active Product',
    base_model_number: 'ACTIVE-1',
    type_id: 1,
  });
  const inactiveItem = await itemRepository.create({
    category_id: category.id,
    name: 'Inactive Product',
    base_model_number: 'INACTIVE-1',
    type_id: 1,
  });
  await itemVariantRepository.create({
    item_id: inactiveItem.id,
    style_name: 'Inactive Style',
    price: 20,
    image_path: 'items/inactive-preview.png',
  });
  await itemRepository.deactivate(inactiveItem.id);

  const publicResponse = await testRequest('/api/items?include_inactive=true');
  const publicData = await parseJSON(publicResponse);
  assertEquals(publicResponse.status, 200);
  assertEquals(publicData.data.map((item: { name: string }) => item.name), ['Active Product']);

  const adminResponse = await testRequest('/api/items?include_inactive=true', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const adminData = await parseJSON(adminResponse);
  assertEquals(adminResponse.status, 200);
  assertEquals(adminData.data.length, 2);
  assertEquals(adminData.data.some((item: { id: number }) => item.id === inactiveItem.id), true);
  const returnedInactiveItem = adminData.data.find((item: { id: number }) => item.id === inactiveItem.id);
  assertEquals(returnedInactiveItem.preview_image, 'items/inactive-preview.png');
});

Deno.test('GET /items/:id/variants - admin include_inactive returns inactive variants', async () => {
  const token = await getAdminToken();
  const category = await categoryRepository.create({ name: 'Lighting' });
  const item = await itemRepository.create({
    category_id: category.id,
    name: 'Product',
    base_model_number: 'PRODUCT-1',
    type_id: 1,
  });
  await itemVariantRepository.create({ item_id: item.id, style_name: 'Active Style', price: 10 });
  const inactiveVariant = await itemVariantRepository.create({
    item_id: item.id,
    style_name: 'Inactive Style',
    price: 20,
  });
  await itemVariantRepository.deactivate(inactiveVariant.id);

  const publicResponse = await testRequest(`/api/items/${item.id}/variants?include_inactive=true`);
  const publicData = await parseJSON(publicResponse);
  assertEquals(publicResponse.status, 200);
  assertEquals(publicData.data.map((variant: { style_name: string }) => variant.style_name), ['Active Style']);

  const adminResponse = await testRequest(`/api/items/${item.id}/variants?include_inactive=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const adminData = await parseJSON(adminResponse);
  assertEquals(adminResponse.status, 200);
  assertEquals(adminData.data.length, 2);
  assertEquals(adminData.data.some((variant: { id: number }) => variant.id === inactiveVariant.id), true);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
cd backend && deno test --allow-all tests/routes/items_test.ts --filter "admin include_inactive"
```

Expected: both tests fail because authenticated requests still omit inactive records.

- [ ] **Step 3: Add optional authentication**

Add to `backend/src/middleware/auth.ts`:

```typescript
export async function optionalAuthMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (authHeader?.startsWith('Bearer ')) {
    try {
      const payload = await verifyToken(authHeader.substring(7));
      c.set('userId', parseInt(payload.sub));
      c.set('userEmail', payload.email);
      c.set('userRole', payload.role);
      c.set('tenantId', payload.tenantId);
    } catch {
      // Optional authentication keeps public catalog reads available.
    }
  }

  await next();
}
```

- [ ] **Step 4: Apply optional authentication and admin gating**

Import `optionalAuthMiddleware` in `backend/src/routes/items.ts`. Add it before the handlers for `GET /` and `GET /:id/variants`, then replace both identity checks with:

```typescript
const includeInactive = c.req.query('include_inactive') === 'true' && c.get('userRole') === 'admin';
```

- [ ] **Step 5: Verify GREEN and route regressions**

Before verifying GREEN, update `ItemRepository.findAll` in `backend/src/repositories/item.ts` so its preview subquery filters active styles only for active-only requests:

```typescript
    const previewVariantFilter = filter?.include_inactive ? '' : 'AND iv.is_active = true';
```

Use `${previewVariantFilter}` after `WHERE iv.item_id = i.id` in the preview-image subquery. This retains inactive preview paths only for the administrator’s inactive-inclusive request.

Run:

```bash
cd backend && deno test --allow-all tests/routes/items_test.ts --filter "admin include_inactive"
cd backend && deno test --allow-all tests/routes/items_test.ts
```

Expected: focused tests pass, followed by all item-route tests passing.

- [ ] **Step 6: Verify the backend**

Run:

```bash
cd backend && deno lint
cd backend && deno task test
```

Expected: lint has no diagnostics and all backend tests pass.

- [ ] **Step 7: Review and commit**

```bash
git diff --check
git diff -- backend/src/middleware/auth.ts backend/src/routes/items.ts backend/tests/routes/items_test.ts
git add backend/src/middleware/auth.ts backend/src/routes/items.ts backend/tests/routes/items_test.ts
git commit -m "fix: show inactive catalog records to admins"
```

# Frontend Resilience — Design Spec

## Context

SnapFlow code review identified 7 frontend issues causing hangs, race conditions, stale state, and data loss. Plus 3 cherry-picked items (error boundary, password_hash leak, useCallback missing).

## Scope

10 fixes in 3 batches plus 3 cherry-picks.

---

## Batch 1 — API/Auth Layer

### 1.1 Token Refresh Subscribers Hang on Network Error

**File:** `frontend/src/services/api.ts` (lines 10, 80-131)

**Problem:** When `isRefreshing` is true and a second 401 arrives, the interceptor pushes a callback into `refreshSubscribers`. If the refresh call fails with a network error (no `response` property), the catch block (line 115-131) sets `isRefreshing = false` and clears `refreshSubscribers = []` without calling those callbacks. Every queued request hangs permanently.

**Fix:**
- Change subscriber type from `Array<(token: string) => void>` to `Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }>>`
- Update `onTokenRefreshed` (line 16) to call `resolve` on each subscriber
- Add `onRefreshFailed` function that calls `reject` on each subscriber
- In the catch block (line 115-131), call `onRefreshFailed(error)` before clearing the array
- Update the queuing code (line 92-100) to return a `new Promise` that pushes `{ resolve, reject }`

**Acceptance criteria:**
- Queued requests reject with an error when token refresh fails
- Queued requests still resolve correctly when token refresh succeeds
- No requests hang permanently

### 1.2 Replace `window.location.href` with Custom Event

**Files:** `frontend/src/services/api.ts` (lines 87, 127), `frontend/src/context/AuthContext.tsx`

**Problem:** `window.location.href = '/login'` causes a full page reload, destroying all component state, unsaved placements, and in-flight operations. It also bypasses React Router's `replace` flag, so the back button returns to the page that triggered the 401.

**Fix:**
- In `api.ts`, replace both `window.location.href = '/login'` with:
  ```typescript
  authService.clearTokens();
  window.dispatchEvent(new Event('auth:logout'));
  ```
- In `AuthContext.tsx`, add a `useEffect` that listens for the `auth:logout` event:
  ```typescript
  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      navigate('/login', { replace: true });
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, [navigate]);
  ```
- `AuthContext` needs `useNavigate` from React Router (add import if not present)

**Acceptance criteria:**
- 401 redirects to /login without full page reload
- Back button does not return to the auth-failed page
- Component state is preserved during the navigation transition

---

## Batch 2 — Drag/Drop Layer

### 2.1 Fix Fire-and-Forget Duplicate in handleDragStart

**File:** `frontend/src/hooks/useDragHandlers.ts` (lines 77-120, specifically line 104)

**Problem:** `handleDragStart` calls `placementService.duplicate()` as a floating Promise. If the user drops before it resolves, `handleDragEnd` applies the position update to the wrong record (the original instead of the duplicate).

**Fix:** Store the duplicate promise in a ref and await it in `handleDragEnd` before applying the position update:

1. Add a ref: `const duplicatePromiseRef = useRef<Promise<Placement> | null>(null)`
2. In `handleDragStart`, store the promise: `duplicatePromiseRef.current = placementService.duplicate(...)`
3. In `handleDragEnd`, await it: `const duplicatedPlacement = await duplicatePromiseRef.current` before applying position
4. Clear the ref after use

**Acceptance criteria:**
- Drag-duplicate always applies the position to the correct (new) record
- Fast drop before duplicate resolves still works correctly
- Failed duplicate shows an error instead of silently corrupting state

### 2.2 Fix Stale Placements Closure in handlePlacementUpdate

**File:** `frontend/src/hooks/usePlacements.ts` (lines 110-162)

**Problem:** `handlePlacementUpdate` captures `placements` in its `useCallback` dependency array (line 162). Inside the callback, `placements.find(p => p.id === id)` (line 147) reads a stale snapshot during fast resize, so `itemSizeMemory` gets persisted with wrong values.

**Fix:** Use a ref to always have the latest placements:

1. Add `const placementsRef = useRef(placements)` and keep it synced: `useEffect(() => { placementsRef.current = placements }, [placements])`
2. In `handlePlacementUpdate`, read `placementsRef.current.find(...)` instead of `placements.find(...)`
3. Remove `placements` from the `useCallback` dependency array (it's no longer a closure dependency)

**Acceptance criteria:**
- `itemSizeMemory` always reflects the latest placement dimensions during rapid resize
- No stale closure bugs during fast drag operations

---

## Batch 3 — Component Layer

### 3.1 Replace getCategoryCounts with useMemo

**File:** `frontend/src/pages/projects/ProjectDashboard.tsx` (lines 189-200)

**Problem:** `getCategoryCounts` is defined with `useCallback` but called inline on every render (line 200), running the O(n*m) loop every time even when inputs haven't changed.

**Fix:** Replace with `useMemo`:
```typescript
const categoryCounts = useMemo(() => {
  const counts = new Map<number, number>();
  placements.forEach(placement => {
    // ... existing logic
  });
  return counts;
}, [placements, items]);
```
Remove the `getCategoryCounts` `useCallback` entirely.

**Acceptance criteria:**
- Category counts only recompute when `placements` or `items` change
- No functional change to the output

### 3.2 Fix ProjectFormModal Dropping Cleared Fields

**File:** `frontend/src/components/projects/ProjectFormModal.tsx` (lines 77-85)

**Problem:** Truthy checks (`if (formData.customer_email)`) mean a user who clears a field can never save that change — the empty string is falsy, so the field is omitted from the update payload.

**Fix:** Always include optional fields in the update payload:
```typescript
const updateData: Record<string, string> = {
  name: formData.name,
  status: formData.status,
  customer_name: formData.customer_name,
  customer_email: formData.customer_email,
  customer_phone: formData.customer_phone,
  customer_address: formData.customer_address,
};
```

**Acceptance criteria:**
- Clearing `customer_email` and saving actually clears it on the server
- Required fields (`name`, `customer_name`) still validated before submit

### 3.3 Add Error Handling to Delete Handlers

**File:** `frontend/src/pages/catalog/ItemManagement.tsx` (lines 183-199, 219-226)

**Problem:** `handleDeleteItem` and `handleDeleteVariant` have no try/catch. If the API call fails, the error propagates unhandled and the modal stays stuck.

**Fix:** Wrap both in try/catch, set the page-level `error` state, and close the modal:
```typescript
const handleDeleteItem = async () => {
  if (!itemToDelete) return;
  try {
    await itemService.delete(itemToDelete.id);
    // ... refresh items list
  } catch (err) {
    setError(extractErrorMessage(err));
  } finally {
    setItemToDelete(null);
  }
};
```
Same pattern for `handleDeleteVariant`.

**Acceptance criteria:**
- Failed delete shows an error message to the user
- Modal closes on both success and failure
- Successful delete still refreshes the list

---

## Cherry-Picks

### CP.1 Add Error Boundary for ProjectDashboard

**File:** Create `frontend/src/components/common/ErrorBoundary.tsx`
**Modify:** `frontend/src/App.tsx`

**Problem:** No error boundary anywhere. A JS error in `ConfiguratorCanvas` crashes the entire app with a blank screen.

**Fix:** Create a class-based `ErrorBoundary` component with a recovery UI ("Something went wrong. Click to reload."). Wrap the `ProjectDashboard` route in it in `App.tsx`.

### CP.2 Fix findByEmail Password Hash Leak

**File:** `backend/src/repositories/user.ts` (lines 27-32)

**Problem:** `findByEmail` uses `SELECT *`, which includes `password_hash`. If the result is forwarded carelessly, it leaks hashed credentials.

**Fix:** Use explicit column list: `SELECT id, email, full_name, role, password_hash, created_at FROM users WHERE email = ?`. This is the same columns but explicit — and add a separate `findByEmailPublic` that omits `password_hash` for non-auth contexts. Actually, simpler: the auth route already needs `password_hash` for comparison. Keep `findByEmail` with all columns (it's only used in auth paths), but verify no route ever returns `password_hash` to the client. If all routes already strip it, this is a documentation-only fix — add a comment.

### CP.3 Wrap useItemMemory Functions in useCallback

**File:** `frontend/src/hooks/useItemMemory.ts` (lines 49-64)

**Problem:** `persistSizeMemory` and `persistVariantMemory` are plain function declarations, recreated every render. They're passed as deps to `usePlacements`'s `useCallback`, causing `handlePlacementCreate` and `handlePlacementUpdate` to be recreated every render.

**Fix:** Wrap both in `useCallback` with stable dependencies (they read from refs, so deps can be empty `[]`).

---

## Out of Scope

- `scaleY` fallback of `2` instead of `1` — edge case for zero-height images, extremely unlikely
- `ProtectedRoute` dual source of truth — works in practice, defer
- `console.log` in API calls — dev convenience, defer to a cleanup pass

## Testing Strategy

- **Token refresh:** Mock the API interceptor to simulate network errors and verify queued requests reject
- **Auth logout:** Test that the custom event triggers navigation
- **Drag/drop:** Hard to unit test (DOM-dependent), rely on manual testing
- **getCategoryCounts:** Verify useMemo only recomputes when deps change (snapshot test)
- **ProjectFormModal:** Test that empty strings are included in the update payload
- **Delete handlers:** Test that errors are caught and displayed
- **Error boundary:** Test that a thrown error renders the fallback UI

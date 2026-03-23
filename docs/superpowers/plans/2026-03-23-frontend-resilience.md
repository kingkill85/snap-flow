# Frontend Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 10 frontend issues: token refresh hangs, auth redirects, drag/drop race conditions, stale closures, component bugs, error boundary, and performance.

**Architecture:** Fixes are independent — each task modifies 1-2 files. No shared state changes between tasks. Frontend tests use Vitest with mocked auth service.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Axios, React Router 6

**Spec:** `docs/superpowers/specs/2026-03-23-frontend-resilience-design.md`

---

## File Structure

### Files to modify
- `frontend/src/services/api.ts` — fix subscriber model, replace window.location.href
- `frontend/src/context/AuthContext.tsx` — listen for auth:logout event
- `frontend/src/hooks/useDragHandlers.ts` — fix duplicate race condition
- `frontend/src/hooks/usePlacements.ts` — fix stale closure with ref
- `frontend/src/hooks/useItemMemory.ts` — wrap persist functions in useCallback
- `frontend/src/pages/projects/ProjectDashboard.tsx` — replace useCallback with useMemo
- `frontend/src/components/projects/ProjectFormModal.tsx` — fix truthy checks
- `frontend/src/pages/catalog/ItemManagement.tsx` — add error handling to deletes
- `backend/src/repositories/user.ts` — add comment to findByEmail

### Files to create
- `frontend/src/components/common/ErrorBoundary.tsx` — error boundary component

---

## Task 1: Fix Token Refresh Subscriber Hang

**Files:**
- Modify: `frontend/src/services/api.ts:10-19,92-99,115-118`

- [ ] **Step 1: Change subscriber type to resolve/reject pairs**

In `frontend/src/services/api.ts`, replace lines 10-19:

```typescript
let refreshSubscribers: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function subscribeTokenRefresh(cb: { resolve: (token: string) => void; reject: (err: unknown) => void }) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach(({ resolve }) => resolve(token));
  refreshSubscribers = [];
}

function onRefreshFailed(err: unknown) {
  refreshSubscribers.forEach(({ reject }) => reject(err));
  refreshSubscribers = [];
}
```

- [ ] **Step 2: Update the queuing code to use resolve/reject**

Replace lines 92-99 (the `if (isRefreshing)` block):

```typescript
      if (isRefreshing) {
        console.log('[Auth] Token refresh already in progress, waiting...');
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }
```

- [ ] **Step 3: Call onRefreshFailed in the catch block**

Replace lines 115-118 (inside the catch block, before the `if (refreshError...)` check):

```typescript
      } catch (refreshError) {
        console.error('[Auth] Token refresh failed:', refreshError);
        isRefreshing = false;
        onRefreshFailed(refreshError);
```

Remove the separate `refreshSubscribers = [];` line (line 118) — `onRefreshFailed` already clears it.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/api.ts
git commit -m "fix: reject queued requests when token refresh fails instead of hanging"
```

---

## Task 2: Replace window.location.href with Auth Event

**Files:**
- Modify: `frontend/src/services/api.ts:86-88,124-128`
- Modify: `frontend/src/context/AuthContext.tsx`

- [ ] **Step 1: Replace both window.location.href in api.ts**

In `frontend/src/services/api.ts`:

Replace lines 85-88 (no refresh token path):
```typescript
        console.log('[Auth] No refresh token available, clearing auth');
        authService.clearTokens();
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(error);
```

Replace lines 124-128 (refresh 401 path):
```typescript
          if (errorWithResponse.response?.status === 401) {
            console.log('[Auth] Refresh token invalid, clearing auth');
            authService.clearTokens();
            window.dispatchEvent(new Event('auth:logout'));
          }
```

- [ ] **Step 2: Add auth:logout event listener in AuthContext**

In `frontend/src/context/AuthContext.tsx`, add a new `useEffect` after the existing `checkAuth` effect (after line 75):

```typescript
  // Listen for auth:logout events from the API interceptor
  useEffect(() => {
    const handleLogout = () => {
      setUser(null);
      setIsLoading(false);
    };
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);
```

This sets `user` to `null`, which causes `ProtectedRoute` to render `<Navigate to="/login" replace />` — no `useNavigate` needed since `AuthProvider` is outside `BrowserRouter`.

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/context/AuthContext.tsx
git commit -m "fix: replace window.location.href with auth:logout event for clean React Router redirect"
```

---

## Task 3: Fix Drag/Drop Duplicate Race Condition

**Files:**
- Modify: `frontend/src/hooks/useDragHandlers.ts:77-120`

- [ ] **Step 1: Add a ref to store the duplicate promise**

At the top of the hook (near other refs), add:

```typescript
const duplicatePromiseRef = useRef<Promise<unknown> | null>(null);
```

Add `useRef` to the React import if not already present.

- [ ] **Step 2: Store the promise in handleDragStart**

In `handleDragStart` (line 104), replace the fire-and-forget call:

```typescript
        if (isCtrlPressed && activeFloorplan) {
          setActiveDragPlacement(placement);
          setIsDuplicating(true);

          duplicatePromiseRef.current = placementService.duplicate(placementId, placement.x, placement.y)
            .then((newPlacement) => {
              setActiveDragPlacement(newPlacement);
              return newPlacement;
            })
            .catch((err) => {
              console.error('Failed to duplicate placement:', err);
              setIsDuplicating(false);
              duplicatePromiseRef.current = null;
            });
```

- [ ] **Step 3: Await the promise in handleDragEnd**

In `handleDragEnd`, at the point where it processes placement drops (where it reads `activeDragPlacement` to apply position), add an await for the duplicate promise before applying the position update:

```typescript
    // Wait for duplicate to resolve if in progress
    if (duplicatePromiseRef.current) {
      await duplicatePromiseRef.current;
      duplicatePromiseRef.current = null;
    }
```

This should go early in the placement handling path of `handleDragEnd`, before the position update is applied.

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useDragHandlers.ts
git commit -m "fix: await duplicate promise in handleDragEnd to prevent race condition"
```

---

## Task 4: Fix Stale Placements Closure

**Files:**
- Modify: `frontend/src/hooks/usePlacements.ts:110-162`

- [ ] **Step 1: Add a ref to track latest placements**

Near the top of the hook, add:

```typescript
const placementsRef = useRef(placements);
useEffect(() => { placementsRef.current = placements; }, [placements]);
```

- [ ] **Step 2: Use the ref in handlePlacementUpdate**

In `handlePlacementUpdate` (line 147), replace:

```typescript
      const updatedPlacement = placements.find(p => p.id === id);
```

With:

```typescript
      const updatedPlacement = placementsRef.current.find(p => p.id === id);
```

- [ ] **Step 3: Remove `placements` from the dependency array**

On line 162, remove `placements` from the `useCallback` dependency array. It should become:

```typescript
  }, [itemSizeMemory, itemVariantMemory, persistSizeMemory, persistVariantMemory, setPlacementsVersion]);
```

- [ ] **Step 4: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/usePlacements.ts
git commit -m "fix: use ref for placements in handlePlacementUpdate to prevent stale closure"
```

---

## Task 5: Replace getCategoryCounts with useMemo

**Files:**
- Modify: `frontend/src/pages/projects/ProjectDashboard.tsx:189-200`

- [ ] **Step 1: Replace useCallback + inline call with useMemo**

Replace lines 189-200:

```typescript
  // Calculate item counts per category for current floorplan
  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    placements.forEach(placement => {
      const item = items.find(i => i.id === placement.item_id);
      if (item) {
        counts.set(item.category_id, (counts.get(item.category_id) || 0) + 1);
      }
    });
    return counts;
  }, [placements, items]);
```

Add `useMemo` to the React import at the top of the file if not already present.

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/projects/ProjectDashboard.tsx
git commit -m "fix: replace getCategoryCounts useCallback with useMemo to prevent recomputation"
```

---

## Task 6: Fix ProjectFormModal Dropping Cleared Fields

**Files:**
- Modify: `frontend/src/components/projects/ProjectFormModal.tsx:77-84`

- [ ] **Step 1: Always include all fields in update payload**

Replace lines 77-85:

```typescript
      if (isEdit) {
        const updateData: UpdateProjectDTO = {
          name: formData.name,
          status: formData.status,
          customer_name: formData.customer_name,
          customer_email: formData.customer_email,
          customer_phone: formData.customer_phone,
          customer_address: formData.customer_address,
        };
        await onSubmit(updateData);
```

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/projects/ProjectFormModal.tsx
git commit -m "fix: always include all fields in project update to allow clearing optional fields"
```

---

## Task 7: Add Error Handling to Delete Handlers

**Files:**
- Modify: `frontend/src/pages/catalog/ItemManagement.tsx:183-199,219-226`

- [ ] **Step 1: Wrap handleDeleteItem in try/catch**

Replace lines 183-199:

```typescript
  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    try {
      await itemService.delete(itemToDelete.id);

      // Refresh items
      const filter: { category_id?: number | null; search?: string; include_inactive?: boolean } = {};
      if (selectedCategory !== 'all') filter.category_id = selectedCategory === 'null' ? null : parseInt(selectedCategory);
      if (debouncedSearchQuery) filter.search = debouncedSearchQuery;
      if (showInactive) filter.include_inactive = true;

      const result = await itemService.getAll(
        filter,
        { page: currentPage, limit: itemsPerPage }
      );
      setItems(result.items);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  };
```

Make sure `extractErrorMessage` is imported from `@/utils/errors`. Check if it's already imported — if not, add the import.

- [ ] **Step 2: Wrap handleDeleteVariant in try/catch**

Replace lines 219-226:

```typescript
  const handleDeleteVariant = async () => {
    if (!itemIdForVariantDelete || !variantToDelete) return;
    try {
      await itemService.deleteVariant(itemIdForVariantDelete, variantToDelete.id);
      const variants = await itemService.getVariants(itemIdForVariantDelete, showInactive);
      setItemVariants(prev => ({ ...prev, [itemIdForVariantDelete]: variants }));
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      closeDeleteVariantModal();
    }
  };
```

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/catalog/ItemManagement.tsx
git commit -m "fix: add error handling to item and variant delete handlers"
```

---

## Task 8: Add Error Boundary

**Files:**
- Create: `frontend/src/components/common/ErrorBoundary.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Create ErrorBoundary component**

Create `frontend/src/components/common/ErrorBoundary.tsx`:

```typescript
import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
          <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground mb-4">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

- [ ] **Step 2: Wrap ProjectDashboard route in ErrorBoundary**

In `frontend/src/App.tsx`, add import:

```typescript
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
```

Find the `ProjectDashboard` route (the `<Route path=":id" ...>` inside the projects routes) and wrap its element:

```tsx
<Route path=":id" element={
  <ErrorBoundary>
    <ProjectDashboard />
  </ErrorBoundary>
} />
```

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/common/ErrorBoundary.tsx frontend/src/App.tsx
git commit -m "feat: add ErrorBoundary component, wrap ProjectDashboard route"
```

---

## Task 9: Wrap useItemMemory Functions in useCallback

**Files:**
- Modify: `frontend/src/hooks/useItemMemory.ts:48-64`

- [ ] **Step 1: Add useCallback import and wrap persist functions**

Add `useCallback` to the React import (line 1):

```typescript
import { useRef, useEffect, useCallback } from 'react';
```

Replace lines 48-64:

```typescript
  // Persist size memory to localStorage
  const persistSizeMemory = useCallback(() => {
    try {
      localStorage.setItem(getSizeMemoryKey(projectId), JSON.stringify(Array.from(itemSizeMemory.current.entries())));
    } catch (err) {
      console.error('Failed to persist size memory:', err);
    }
  }, [projectId]);

  // Persist variant memory to localStorage
  const persistVariantMemory = useCallback(() => {
    try {
      localStorage.setItem(getVariantMemoryKey(projectId), JSON.stringify(Array.from(itemVariantMemory.current.entries())));
    } catch (err) {
      console.error('Failed to persist variant memory:', err);
    }
  }, [projectId]);
```

The `[projectId]` dependency ensures the callbacks update when navigating to a different project.

- [ ] **Step 2: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useItemMemory.ts
git commit -m "fix: wrap useItemMemory persist functions in useCallback to prevent dep invalidation"
```

---

## Task 10: Document findByEmail + Final Verification

**Files:**
- Modify: `backend/src/repositories/user.ts:27-32`

- [ ] **Step 1: Add documentation comment to findByEmail**

In `backend/src/repositories/user.ts`, before the `findByEmail` method (line 27), add:

```typescript
  /**
   * Find user by email. Returns full user record including password_hash.
   * Used for auth verification only — callers must NOT return password_hash to client.
   */
```

- [ ] **Step 2: Run full backend test suite**

Run: `cd backend && deno test --allow-all`
Expected: All tests PASS

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npm run test:run`
Expected: All tests PASS

- [ ] **Step 4: Run frontend lint**

Run: `cd frontend && npm run lint`
Expected: No new errors

- [ ] **Step 5: Run frontend build**

Run: `cd frontend && npm run build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add backend/src/repositories/user.ts
git commit -m "docs: document findByEmail returns password_hash intentionally for auth"
```

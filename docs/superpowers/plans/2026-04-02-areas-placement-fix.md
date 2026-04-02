# Areas Placement Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix area z-index stacking so selected/newest areas render on top, and add boundary clamping so neither areas nor item placements can be dragged outside the floorplan.

**Architecture:** Pure frontend changes. Z-index fix is a sort comparator change in SVG render order. Boundary clamping adds `Math.max/min` guards in area move handlers (ProjectDashboard) and placement drag handlers (useDragHandlers). The floorplan's natural dimensions (`imageNaturalSize`) flow from ConfiguratorCanvas to ProjectDashboard via a new callback.

**Tech Stack:** React 18, TypeScript, SVG

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/components/configurator/ConfiguratorCanvas.tsx` | Modify | Area sort logic; expose `imageNaturalSize` to parent via callback; pass bounds to AreaPolygon |
| `frontend/src/pages/projects/ProjectDashboard.tsx` | Modify | Store canvas bounds; clamp `handleAreaMove` and `handleAreaVertexMove`; clamp `handleAreaVerticesReplace` |
| `frontend/src/hooks/useDragHandlers.ts` | Modify | Clamp placement drag and item drop positions |

---

### Task 1: Fix area z-index stacking order

**Files:**
- Modify: `frontend/src/components/configurator/ConfiguratorCanvas.tsx:1509`

- [ ] **Step 1: Change the area sort comparator**

In `ConfiguratorCanvas.tsx` at line 1509, replace the size-based sort:

```typescript
{[...areas].filter(a => !hiddenAreaIds?.has(a.id)).sort((a, b) => (b.width * b.height) - (a.width * a.height)).map(area => (
```

with a sort that puts unselected areas in id order (newest last = on top) and the selected area always last:

```typescript
{[...areas].filter(a => !hiddenAreaIds?.has(a.id)).sort((a, b) => {
  const aSelected = a.id === selectedAreaId ? 1 : 0;
  const bSelected = b.id === selectedAreaId ? 1 : 0;
  if (aSelected !== bSelected) return aSelected - bSelected;
  return a.id - b.id;
}).map(area => (
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev:frontend`

Open a project with multiple overlapping areas. Click different areas and verify:
- The selected area always renders on top (resize handles are accessible)
- Newer areas render above older ones when neither is selected

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/configurator/ConfiguratorCanvas.tsx
git commit -m "fix: render selected and newest areas on top in SVG (issue #62)"
```

---

### Task 2: Expose canvas bounds to ProjectDashboard

**Files:**
- Modify: `frontend/src/components/configurator/ConfiguratorCanvas.tsx:36-62` (CanvasProps interface), `~1271` (imageNaturalSize state)
- Modify: `frontend/src/pages/projects/ProjectDashboard.tsx:567-597` (ConfiguratorCanvas usage)

- [ ] **Step 1: Add `onCanvasBoundsChange` callback to `CanvasProps`**

In `ConfiguratorCanvas.tsx`, add to the `CanvasProps` interface:

```typescript
  onCanvasBoundsChange?: (bounds: { width: number; height: number }) => void;
```

- [ ] **Step 2: Fire the callback when `imageNaturalSize` changes**

In `ConfiguratorCanvas.tsx`, add a `useEffect` after the `imageNaturalSize` state (~line 1271):

```typescript
useEffect(() => {
  if (imageNaturalSize.width > 0 && imageNaturalSize.height > 0) {
    onCanvasBoundsChange?.(imageNaturalSize);
  }
}, [imageNaturalSize.width, imageNaturalSize.height, onCanvasBoundsChange]);
```

- [ ] **Step 3: Store canvas bounds in ProjectDashboard**

In `ProjectDashboard.tsx`, add state and a callback:

```typescript
const [canvasBounds, setCanvasBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
```

Pass it to ConfiguratorCanvas:

```typescript
<ConfiguratorCanvas
  ...
  onCanvasBoundsChange={setCanvasBounds}
/>
```

- [ ] **Step 4: Verify it compiles**

Run: `npm run dev:frontend`
Confirm no TypeScript or runtime errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/configurator/ConfiguratorCanvas.tsx frontend/src/pages/projects/ProjectDashboard.tsx
git commit -m "feat: expose canvas bounds to ProjectDashboard"
```

---

### Task 3: Clamp area drag (whole polygon move) in ProjectDashboard

**Files:**
- Modify: `frontend/src/pages/projects/ProjectDashboard.tsx:203-217` (`handleAreaMove`)

- [ ] **Step 1: Add clamping to `handleAreaMove`**

Replace the current `handleAreaMove` callback:

```typescript
const handleAreaMove = useCallback((id: number, dx: number, dy: number) => {
  setLocalAreas(prev => {
    const next = prev.map(a => {
      if (a.id !== id) return a;

      // Compute proposed new vertices
      let proposedVertices = a.vertices.map(v => ({ ...v, x: v.x + dx, y: v.y + dy }));

      // Clamp: if any vertex goes out of bounds, adjust dx/dy
      if (canvasBounds.width > 0 && canvasBounds.height > 0) {
        const minX = Math.min(...proposedVertices.map(v => v.x));
        const maxX = Math.max(...proposedVertices.map(v => v.x));
        const minY = Math.min(...proposedVertices.map(v => v.y));
        const maxY = Math.max(...proposedVertices.map(v => v.y));

        let clampDx = 0;
        let clampDy = 0;
        if (minX < 0) clampDx = -minX;
        else if (maxX > canvasBounds.width) clampDx = canvasBounds.width - maxX;
        if (minY < 0) clampDy = -minY;
        else if (maxY > canvasBounds.height) clampDy = canvasBounds.height - maxY;

        proposedVertices = proposedVertices.map(v => ({ ...v, x: v.x + clampDx, y: v.y + clampDy }));
      }

      return {
        ...a,
        x: proposedVertices[0]?.x ?? a.x + dx,
        y: proposedVertices[0]?.y ?? a.y + dy,
        vertices: proposedVertices,
      };
    });
    localAreasRef.current = next;
    return next;
  });
}, [canvasBounds]);
```

- [ ] **Step 2: Verify visually**

Run: `npm run dev:frontend`

Drag an area toward the floorplan edge. It should stop at the boundary and not go outside.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/projects/ProjectDashboard.tsx
git commit -m "fix: clamp area drag to stay within floorplan bounds"
```

---

### Task 4: Clamp area vertex moves in ProjectDashboard

**Files:**
- Modify: `frontend/src/pages/projects/ProjectDashboard.tsx:219-231` (`handleAreaVertexMove`)
- Modify: `frontend/src/pages/projects/ProjectDashboard.tsx:233-245` (`handleAreaVerticesReplace`)

- [ ] **Step 1: Add clamping to `handleAreaVertexMove`**

Replace the current callback:

```typescript
const handleAreaVertexMove = useCallback((id: number, vertexIndex: number, x: number, y: number) => {
  let clampedX = x;
  let clampedY = y;
  if (canvasBounds.width > 0 && canvasBounds.height > 0) {
    clampedX = Math.max(0, Math.min(x, canvasBounds.width));
    clampedY = Math.max(0, Math.min(y, canvasBounds.height));
  }
  setLocalAreas(prev => {
    const next = prev.map(a => {
      if (a.id !== id) return a;
      return {
        ...a,
        vertices: a.vertices.map((v, i) => i === vertexIndex ? { ...v, x: clampedX, y: clampedY } : v),
      };
    });
    localAreasRef.current = next;
    return next;
  });
}, [canvasBounds]);
```

- [ ] **Step 2: Add clamping to `handleAreaVerticesReplace`**

Replace the current callback:

```typescript
const handleAreaVerticesReplace = useCallback((id: number, updates: { index: number; x: number; y: number }[]) => {
  const clampedUpdates = canvasBounds.width > 0 && canvasBounds.height > 0
    ? updates.map(u => ({
        ...u,
        x: Math.max(0, Math.min(u.x, canvasBounds.width)),
        y: Math.max(0, Math.min(u.y, canvasBounds.height)),
      }))
    : updates;
  setLocalAreas(prev => {
    const next = prev.map(a => {
      if (a.id !== id) return a;
      const newVertices = [...a.vertices];
      for (const u of clampedUpdates) {
        const v = newVertices.find(v => v.vertex_index === u.index);
        if (v) { v.x = u.x; v.y = u.y; }
      }
      return { ...a, vertices: newVertices.map(v => ({ ...v })) };
    });
    localAreasRef.current = next;
    return next;
  });
}, [canvasBounds]);
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev:frontend`

Drag individual area vertices toward the edges. They should stop at the floorplan boundary. Test all modifier key modes:
- Default (proportional scale)
- Ctrl (free vertex move)
- Shift (stretch)
- Ctrl+Shift (snap)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/projects/ProjectDashboard.tsx
git commit -m "fix: clamp area vertex moves to floorplan bounds"
```

---

### Task 5: Clamp item placement drag in useDragHandlers

**Files:**
- Modify: `frontend/src/hooks/useDragHandlers.ts:179-183` (placement drag end)

- [ ] **Step 1: Add clamping to existing placement drag**

In `useDragHandlers.ts`, after computing `newX` and `newY` for placement drag (~line 182-183):

```typescript
const deltaX = event.delta.x / scaleX;
const deltaY = event.delta.y / scaleY;

let newX = placement.x + deltaX;
let newY = placement.y + deltaY;

// Clamp placement within floorplan bounds
const maxW = floorplanImage.naturalWidth;
const maxH = floorplanImage.naturalHeight;
if (maxW > 0 && maxH > 0) {
  newX = Math.max(0, Math.min(newX, maxW - placement.width));
  newY = Math.max(0, Math.min(newY, maxH - placement.height));
}
```

Note: `newX` and `newY` need to change from `const` to `let`.

- [ ] **Step 2: Add clamping to item initial drop**

In `useDragHandlers.ts`, after computing item drop position (~line 395-396), clamp before creating the placement:

```typescript
let placementX = dropX - placementWidth / 2;
let placementY = dropY - placementHeight / 2;

// Clamp within floorplan bounds
const maxW = floorplanImage.naturalWidth;
const maxH = floorplanImage.naturalHeight;
if (maxW > 0 && maxH > 0) {
  placementX = Math.max(0, Math.min(placementX, maxW - placementWidth));
  placementY = Math.max(0, Math.min(placementY, maxH - placementHeight));
}

await handlePlacementCreate({
  x: placementX,
  y: placementY,
  width: placementWidth,
  height: placementHeight,
  ...
});
```

- [ ] **Step 3: Verify visually**

Run: `npm run dev:frontend`

Test:
1. Drag an existing item placement toward the edge — it should stop at the boundary
2. Drop a new item near the edge — it should be placed within bounds
3. Ctrl+drag to duplicate near the edge — the duplicate should also stay within bounds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useDragHandlers.ts
git commit -m "fix: clamp item placement drag and drop to floorplan bounds"
```

---

### Task 6: Lint and final verification

**Files:** All modified files

- [ ] **Step 1: Run frontend lint**

```bash
cd frontend && npm run lint
```

Expected: No errors. Fix any that appear.

- [ ] **Step 2: Run frontend tests**

```bash
cd frontend && npm run test:run
```

Expected: All tests pass.

- [ ] **Step 3: Run backend lint and tests**

```bash
cd backend && deno lint && deno task test
```

Expected: All pass (no backend changes, but verify nothing broke).

- [ ] **Step 4: Full visual smoke test**

Run: `npm run dev`

Test all interactions on the canvas:
- Select area → renders on top
- New area → renders above existing
- Drag area → clamped at edges
- Drag area vertex (all modifier modes) → clamped
- Drag item placement → clamped
- Drop new item near edge → clamped
- Resize placement → still works (existing behavior)
- Ctrl+drag duplicate → clamped

- [ ] **Step 5: Commit any lint fixes**

```bash
git add -A && git commit -m "fix: lint fixes for areas placement changes"
```

Only if there were lint issues to fix. Skip if clean.

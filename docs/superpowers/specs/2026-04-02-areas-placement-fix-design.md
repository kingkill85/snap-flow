# Areas Placement Fix — Design Spec

**Issue:** #62 — BUG: Areas Placement
**Date:** 2026-04-02

## Problem

Two bugs with areas on the configurator canvas:

1. **Z-index stacking:** When the floorplan is nearly full of areas, resize handles on smaller/older areas become unreachable because they render behind other areas. The active (selected) area should always be on top, and newer areas should render above older ones.

2. **Out-of-bounds movement:** Areas and item placements can be dragged partially or fully outside the floorplan image boundaries. All elements should be constrained to stay within the floorplan.

## Approach

Render-order manipulation for z-index (no new state, no DB changes). Vertex/coordinate clamping for boundaries using `Math.max(0, Math.min(value, max))` against `imageNaturalSize`.

## Fix 1: Z-Index / Stacking Order (Areas)

### Current behavior

Areas are rendered in SVG in `ConfiguratorCanvas.tsx` (~line 1499-1525). They are sorted by polygon size (largest first) so smaller areas render on top of larger ones. There is no concept of "selected on top" or "newest on top."

### New behavior

Replace the size-based sort with a two-level sort:

1. Unselected areas sorted by `id` ascending — newer areas (higher id) render later in SVG = on top.
2. The selected area always renders last = topmost.

This is a single sort comparator change in the SVG area rendering section. SVG uses document order for stacking (no CSS z-index), so rendering last = on top.

### Files changed

- `frontend/src/components/configurator/ConfiguratorCanvas.tsx` — area sort logic in the SVG rendering section

## Fix 2: Boundary Clamping (Areas + Item Placements)

### Current behavior

- Item placements are clamped on **resize** only (ConfiguratorCanvas.tsx ~line 368-371).
- Area initial drop position is partially clamped in `useDragHandlers.ts` (~line 251-252).
- No clamping exists for: dragging existing areas, dragging area vertices, dragging existing item placements, or item placement initial drop.

### New behavior

All vertices and coordinates clamped to `[0, imageNaturalWidth]` x `[0, imageNaturalHeight]`. Clamping applied in all interaction modes:

| Element | Interaction | Location | Status |
|---------|------------|----------|--------|
| Area | Drag whole area | `handleAreaMove` in ProjectDashboard.tsx | New |
| Area | Drag individual vertex | `handleAreaVertexMove` in ProjectDashboard.tsx + vertex modes in AreaPolygon.tsx | New |
| Area | Initial drop | `useDragHandlers.ts` | Already partial, verify complete |
| Item placement | Drag existing | `useDragHandlers.ts` drag end handler | New |
| Item placement | Initial drop | `useDragHandlers.ts` drop handler | New |
| Item placement | Resize | ConfiguratorCanvas.tsx | Already done |

### Implementation details

- `imageNaturalSize` (width/height of floorplan) is already available in ConfiguratorCanvas and passed to placement resize logic.
- For area handlers in ProjectDashboard, pass `imageNaturalSize` through callback signatures or compute from available floorplan data.
- For area vertex drag in AreaPolygon.tsx, all modes (snap, free, stretch, proportional) need clamping before emitting the new vertex position.
- For placement drag in useDragHandlers.ts, clamp the final `newX`/`newY` after computing the drop position, accounting for placement width/height so the entire element stays within bounds.

### Clamping formula

```
x = Math.max(0, Math.min(x, maxWidth - elementWidth))
y = Math.max(0, Math.min(y, maxHeight - elementHeight))
```

For individual vertices (areas), there is no element width/height — just clamp the point:

```
x = Math.max(0, Math.min(x, maxWidth))
y = Math.max(0, Math.min(y, maxHeight))
```

## What's NOT changing

- No database schema changes
- No new state fields or props (beyond passing existing `imageNaturalSize` to more handlers)
- Item placement resize clamping (already works)
- Area creation flow (already clamps initial drop position)
- Area or placement visual appearance

## Files changed (summary)

1. `frontend/src/components/configurator/ConfiguratorCanvas.tsx` — area sort logic
2. `frontend/src/pages/projects/ProjectDashboard.tsx` — `handleAreaMove`, `handleAreaVertexMove` clamping
3. `frontend/src/components/configurator/AreaPolygon.tsx` — vertex drag mode clamping
4. `frontend/src/hooks/useDragHandlers.ts` — placement drag + drop clamping

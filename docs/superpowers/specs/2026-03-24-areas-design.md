# Areas (Room Grouping) — Design Spec

## Overview

Add "Areas" to SnapFlow — polygon overlays on floorplans that represent rooms. Areas group item placements for per-room pricing in invoices and a new pivot-table summary page in the DOCX export. Designed to be extensible for BusPro automation zones later.

## Motivation

Customers currently build room-based summary tables by hand (rooms × device categories). Areas automate this by letting users define room boundaries on the floorplan, with automatic containment detection assigning devices to rooms.

## Scope

**In scope:**
- Area placements on the canvas (polygon shapes with name, color, opacity)
- Drag-from-panel interaction (new "Areas" tab in right panel)
- Polygon vertex editing (drag corners, add vertices via Ctrl+click on edge)
- Automatic containment detection (point-in-polygon assigns items to areas)
- Area properties edit popup (name, color, opacity)
- BOM entries reference their containing area
- New "Area Summary" pivot table page in DOCX export
- "Unassigned" group for devices not inside any area

**Out of scope (future):**
- Area type presets/templates (admin-managed room types with default properties)
- BusPro automation zone fields (relay zones, dimming zones, DALI, DMX, fan, IR)
- BusPro module aggregation from zone counts

## Data Model

### Migration: Add area support to placements

The migration requires **table recreation** for `placements` (standard pattern in this project — see migrations 023, 025, 026, 027) to add the new columns atomically and make `bom_id` nullable.

```sql
-- Step 1: Recreate placements table with new columns
CREATE TABLE placements_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER REFERENCES project_bom(id) ON DELETE CASCADE,  -- NOW NULLABLE for areas
  floorplan_id INTEGER NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,  -- direct FK, no longer derived through BOM
  type TEXT NOT NULL DEFAULT 'item',  -- 'item' | 'area'
  area_id INTEGER REFERENCES placements(id) ON DELETE SET NULL,  -- which area contains this item
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL,
  rotation REAL NOT NULL DEFAULT 0.0 CHECK(rotation >= 0 AND rotation < 360),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Backfill floorplan_id from project_bom for existing placements
INSERT INTO placements_new (id, bom_id, floorplan_id, type, x, y, width, height, rotation, created_at)
  SELECT p.id, p.bom_id, b.floorplan_id, 'item', p.x, p.y, p.width, p.height, p.rotation, p.created_at
  FROM placements p JOIN project_bom b ON p.bom_id = b.id;

DROP TABLE placements;
ALTER TABLE placements_new RENAME TO placements;

CREATE INDEX idx_placements_bom ON placements(bom_id);
CREATE INDEX idx_placements_floorplan ON placements(floorplan_id);
CREATE INDEX idx_placements_area ON placements(area_id);
CREATE INDEX idx_placements_type ON placements(type);

-- Step 2: Add area reference to BOM for invoice grouping
ALTER TABLE project_bom ADD COLUMN area_id INTEGER REFERENCES placements(id)
  ON DELETE SET NULL;

-- Step 3: Area properties (one-to-one with area placements)
CREATE TABLE area_properties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placement_id INTEGER NOT NULL UNIQUE REFERENCES placements(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'New Area',
  color TEXT NOT NULL DEFAULT '#3b82f6',
  opacity REAL NOT NULL DEFAULT 0.1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_area_properties_placement ON area_properties(placement_id);

-- Step 4: Area polygon vertices
CREATE TABLE area_vertices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  placement_id INTEGER NOT NULL REFERENCES placements(id) ON DELETE CASCADE,
  vertex_index INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL,
  UNIQUE(placement_id, vertex_index)
);

CREATE INDEX idx_area_vertices_placement ON area_vertices(placement_id);
```

### How areas use the placement columns

For area placements (`type = 'area'`):
- `bom_id` = NULL (areas have no BOM entry)
- `floorplan_id` = direct FK to the floorplan this area belongs to
- `x, y` = top-left corner of the polygon's bounding box
- `width, height` = bounding box dimensions (recomputed when vertices change)
- `rotation` = 0 (not used for areas, polygon shape handles orientation)
- `area_id` = NULL (areas don't belong to other areas)

For item placements (`type = 'item'`):
- `bom_id` = reference to BOM entry (required, unchanged from current behavior)
- `floorplan_id` = direct FK (backfilled from `project_bom.floorplan_id` during migration)
- `x, y, width, height, rotation` = unchanged
- `area_id` = reference to the containing area placement, or NULL if unassigned

Adding `floorplan_id` directly to `placements` also simplifies existing item placement queries — no longer need to JOIN through `project_bom` just to filter by floorplan.

### Area_id: source of truth

`placements.area_id` is the **single source of truth** for containment. The `project_bom.area_id` column is derived — it is updated whenever `placements.area_id` changes, for efficient invoice queries. If they ever disagree, `placements.area_id` wins.

### Relationships

- `placements.type = 'area'` → has `area_properties` row + `area_vertices` rows, `bom_id` is NULL
- `placements.type = 'item'` → has `bom_id`, optionally `area_id` pointing to an area placement
- `project_bom.area_id` → derived cache of `placements.area_id` for invoice grouping

### Deletion behavior

- Deleting an area → `ON DELETE CASCADE` removes `area_properties` and `area_vertices`
- Deleting an area → `ON DELETE SET NULL` nullifies `area_id` on item placements and BOM entries (devices stay, just become "Unassigned")
- No orphaned references remain in the database

### Required code changes for bom_id nullability

All existing placement repository queries use `INNER JOIN project_bom b ON p.bom_id = b.id`, which would silently exclude area placements. These must be updated:
- Queries that should return **only items**: add `WHERE p.type = 'item'` (keeps INNER JOIN)
- Queries that should return **all placements**: change to `LEFT JOIN project_bom`
- The `Placement` TypeScript interface: `bom_id` changes from `number` to `number | null`
- The `cleanupEmptyBomEntry()` helper in placement routes: guard with `if (bomEntryId)` check
- Area deletion must go through `/api/areas/:id`, not `/api/placements/:id`

## UI Design

### Areas Tab (new, 4th tab in right panel)

Position: alongside Products, BOM, Summary tabs. Abbreviate "Bill of Materials" to "BOM" in the tab label to fit 4 tabs in the 400px panel.

**Contents:**
- **Top section:** One draggable "Area" block. Drag onto canvas to create a new area.
- **Bottom section:** List of placed areas on the current floorplan. Each entry shows:
  - Color swatch
  - Area name
  - Device count (number of item placements contained)
  - Click to select on canvas

### Canvas Rendering

**Layer order (bottom to top):**
1. Floorplan image
2. Area polygons — rendered as an **SVG overlay** on top of the floorplan image, below item placements. SVG is the right choice because it integrates with the existing DOM-based layout and supports polygon rendering, vertex handles, and click/hover events natively.
3. Item placements (devices) — existing DOM-based rendering, unchanged

**Visual style:**
- Semi-transparent colored fill (user-configured opacity, default 10%)
- Solid colored border (2px)
- Name label inside the polygon, top-left area

### Canvas Interaction

**Placing an area:**
1. Drag "Area" from Areas tab onto canvas
2. Drops as a rectangle (4 vertices) at a default size of 200×150 canvas pixels
3. Edit popup opens immediately to set name, color, opacity

**Selecting an area:**
- Click area polygon to select
- Shows vertex handles at each corner
- Shows pencil (edit) and trash (delete) action icons

**Moving an area:**
- Drag the polygon body (not a vertex) to move the entire area
- This translates all vertices by the drag delta
- Recalculates bounding box (`x, y, width, height` on placement)
- Triggers containment recheck for all items on the floorplan

**Reshaping:**
- Drag any vertex handle to move that corner
- Ctrl+click on an edge to insert a new vertex at that point
- This allows creating L-shapes, T-shapes, or any polygon from the initial rectangle
- Vertex dragging uses custom mouse handlers (not dnd-kit), similar to existing resize handle implementation in DraggablePlacement

**Edit popup** (opens via pencil icon, similar to addons popup):
- Room Name — text input
- Shape Color — color picker
- Shape Transparency — slider (0-100%)
- *(BusPro zone fields added here in future)*

**Deleting:**
- Trash icon on selected area
- Removes area, ungroups all contained devices (area_id → NULL)

**DnD integration:**
- Area drags from the panel use a distinct payload: `{ type: 'area' }` (vs `{ type: 'item', itemId }` for items)
- The `handleDragEnd` in `useDragHandlers` gets a new code path for `type: 'area'`:
  1. Does NOT create a BOM entry
  2. Calls `POST /api/areas` to create the area placement + properties + default vertices
  3. Opens the edit popup immediately

### Containment Detection

**Point-in-polygon algorithm** (ray casting) determines which area an item placement belongs to. Uses the center point of the item placement for the containment check.

**Triggers:**
- Item placement is dropped on canvas
- Item placement is moved
- Area is moved or reshaped (recheck all items on that floorplan)

**Behavior:**
- Updates `placements.area_id` on the item placement
- Syncs `project_bom.area_id` on the corresponding BOM entry (derived from placement)
- If an item is inside multiple overlapping areas, the area with the smallest polygon area wins (computed via Shoelace formula)
- Items outside all areas have `area_id = NULL` ("Unassigned")

**Z-ordering of overlapping areas:** Areas render in order of polygon area (largest first, smallest on top). This ensures smaller areas (e.g., a closet inside a bedroom) are visible and clickable on top of larger ones.

## Invoice / DOCX Export

### New "Area Summary" page

Appended as an additional section in the existing DOCX document (the `docx` library supports multiple sections).

**Format: Pivot table**
- **Rows** = Area names (alphabetical) + "Unassigned" row at bottom
- **Columns** = Item categories (respecting active category view toggles)
- **Cells** = Quantity of that category's devices in that area
- **Header row** = Category names with total count across all areas
- **Title** = "\[Floorplan Name\] — Area Summary"

One summary section per floorplan (matching existing multi-floorplan export behavior).

### Data source

The `generateInvoiceDOCX` function receives additional data:
- List of areas per floorplan (from `GET /api/areas?floorplan_id=X`)
- Each BOM entry already has `area_id` — group by area to build the pivot table
- The `ProjectDashboard` or `SummaryTab` fetches area data and passes it to the export function

### Existing invoice pages

Unchanged. The current itemized BOM with pricing continues to work as-is.

## API Endpoints

### New area-specific endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/areas?floorplan_id=X` | List areas for a floorplan (with properties + vertices) |
| POST | `/api/areas` | Create area placement + properties + default vertices |
| PUT | `/api/areas/:id` | Update area properties (name, color, opacity) |
| PUT | `/api/areas/:id/vertices` | Replace all polygon vertices (full replacement — avoids vertex index renumbering complexity) |
| DELETE | `/api/areas/:id` | Delete area (cascades properties/vertices, nullifies containment) |

### Request/response schemas

**POST /api/areas** request:
```json
{
  "floorplan_id": 1,
  "x": 100,
  "y": 100,
  "width": 200,
  "height": 150,
  "name": "Kitchen",
  "color": "#f59e0b",
  "opacity": 0.1
}
```
The `x, y, width, height` values seed the initial 4 rectangle vertices (corners of this bounding box). Response: area placement + properties + 4 default rectangle vertices.

**Transaction safety:** This endpoint creates a placement row, an `area_properties` row, and 4 `area_vertices` rows atomically. Wrap in a SQLite transaction (`BEGIN`/`COMMIT`) to ensure all-or-nothing creation.

**PUT /api/areas/:id** request:
```json
{
  "name": "Master Bedroom",
  "color": "#3b82f6",
  "opacity": 0.15
}
```

**PUT /api/areas/:id/vertices** request (full replacement):
```json
{
  "vertices": [
    { "x": 100, "y": 100 },
    { "x": 300, "y": 100 },
    { "x": 300, "y": 250 },
    { "x": 100, "y": 250 }
  ]
}
```
Backend recomputes bounding box (`x, y, width, height`) from vertices and triggers containment recheck.

### Modified existing endpoints

- `POST /api/placements` — when creating item placements, run containment check and set `area_id`
- `PUT /api/placements/:id` — when moving item placements, re-run containment check and sync `area_id`
- `GET /api/placements?floorplan_id=X` — include `area_id` in response. Add explicit `type=item` query parameter support (existing callers should pass `type=item` to exclude areas; omitting `type` returns all placements for backwards compatibility)

## Testing Strategy

**Backend:**
- Area CRUD (create, read, update, delete)
- Vertex management (create default rectangle, update to polygon, reorder)
- Point-in-polygon containment detection (rectangle, L-shape, concave polygon)
- Cascade deletion (area deleted → properties/vertices gone, item area_id nullified, BOM area_id nullified)
- Bounding box recomputation from vertices
- Invoice calculation with area grouping
- Existing placement tests still pass (bom_id nullability doesn't break item flows)

**Frontend:**
- Areas tab rendering and drag interaction
- Area polygon SVG rendering on canvas
- Vertex editing (drag corners, Ctrl+click to add vertex)
- Area movement (drag body, all vertices translate)
- Edit popup (name, color, opacity)
- Containment assignment updates when items/areas move
- Area list updates when areas are placed/edited/deleted
- DOCX export includes area summary pivot table

## Future Extensibility

The `area_properties` table is designed to receive additional columns for BusPro:
- `relay_zones INTEGER DEFAULT 0`
- `dimming_zones INTEGER DEFAULT 0`
- `dali_ballasts INTEGER DEFAULT 0`
- `dmx_zones INTEGER DEFAULT 0`
- `fan_zones INTEGER DEFAULT 0`
- `ir_emitter_probes INTEGER DEFAULT 0`

Area type presets (admin-managed templates with default zone values) can be added as a separate `area_types` table with `area_properties.area_type_id` reference when needed.

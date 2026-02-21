# SnapFlow - Implementation Plan (Tracking Edition)

## Master Progress Checklist

- [x] Phase 1: Foundation (backend/frontend setup, DB, core architecture)
- [x] Phase 2: Authentication + User Management
- [x] Phase 3: Catalog Management (categories/items/variants/add-ons)
- [x] Phase 4: Excel Catalog Import + Sync
- [x] Phase 5: Customers + Projects
- [~] Phase 6: Configurator Core (floorplans, canvas, placements)
- [ ] Phase 7: Floorplan BOM (NEW - Updated Architecture)
- [ ] Phase 8: Proposal Generation
- [~] Phase 9: Testing, QA, and Polish
- [x] Phase 10: Deployment (Docker + CI/CD)

> Legend: `[x]` done, `[~]` in progress, `[ ]` not started

---

## Phase 6: Configurator Core (In Progress)

### 6.1 Backend
- [x] Floorplan CRUD endpoints
- [x] Placement CRUD endpoints
- [x] Variant-based placement model (`item_variant_id`, `selected_addons`)
- [ ] Add missing backend tests for floorplans
- [ ] Add missing backend tests for placements

### 6.2 Frontend
- [x] Floorplan tabs in project dashboard
- [x] Item palette grouped by category
- [x] Drag from palette to canvas
- [x] Move/resize/delete placements on canvas
- [ ] Keyboard support (delete selected, escape to deselect)
- [ ] UX hardening (empty/error/loading edge states)
- [ ] Stabilize DnD coordinate edge cases

### 6.3 Configurator UI Redesign (COMPLETE)
- [x] Create `ProductPanel` component (replaces ItemPalette)
- [x] Update `ProjectDashboard` layout
- [x] Prepare for BOM view toggle

---

## Phase 7: Floorplan BOM (Per-Floorplan Bill of Materials)

### Goal
Each floorplan has its own Bill of Materials. Placements reference BOM entries. BOM entries contain variant + addons + picture snapshots, with references to catalog for updates.

### Architecture Overview

**Key Concepts:**
- BOM entries are **per-floorplan** (not project-level)
- Placements reference `bom_entry_id` (not variant directly)
- BOM entries contain **both references** (to catalog) and **snapshots** (frozen display data)
- References used ONLY for "Update from Catalog" feature
- Snapshots used for ALL display and pricing (independent of catalog changes)
- Addons are child BOM entries with `parent_bom_entry_id`

### Database Schema

```sql
-- BOM entries: main items and their addons as children
floorplan_bom_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  floorplan_id INTEGER NOT NULL REFERENCES floorplans(id) ON DELETE CASCADE,
  
  -- REFERENCES: For "Update from Catalog" feature only
  item_id INTEGER NOT NULL REFERENCES items(id),
  variant_id INTEGER NOT NULL REFERENCES item_variants(id),
  parent_bom_entry_id INTEGER REFERENCES floorplan_bom_entries(id) ON DELETE CASCADE,
  
  -- SNAPSHOTS: Frozen display/pricing data (independent of catalog)
  name_snapshot TEXT NOT NULL,
  model_number_snapshot TEXT,
  price_snapshot REAL NOT NULL,
  picture_path TEXT,
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Placements reference main BOM entries (not addons)
placements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_entry_id INTEGER NOT NULL REFERENCES floorplan_bom_entries(id) ON DELETE CASCADE,
  x REAL NOT NULL,
  y REAL NOT NULL,
  width REAL NOT NULL,
  height REAL NOT NULL
);

-- Indexes
CREATE INDEX idx_bom_floorplan ON floorplan_bom_entries(floorplan_id);
CREATE INDEX idx_bom_parent ON floorplan_bom_entries(parent_bom_entry_id);
CREATE INDEX idx_bom_item ON floorplan_bom_entries(item_id);
CREATE INDEX idx_bom_variant ON floorplan_bom_entries(variant_id);
CREATE UNIQUE INDEX idx_bom_main_unique ON floorplan_bom_entries(floorplan_id, variant_id) 
  WHERE parent_bom_entry_id IS NULL;
```

### 7.1 Database + Backend Foundations

- [ ] Migration: create `floorplan_bom_entries` table
- [ ] Migration: update `placements` table
  - Add `bom_entry_id` column (references BOM entry)
  - Remove `item_variant_id`, `item_id`, `selected_addons` (moved to BOM)
  - Add cascade delete: `ON DELETE CASCADE`
- [ ] Migration: backfill existing placements
  - Create BOM entries from existing placements
  - Assign required addons as children
  - Update placement references
- [ ] Add BOM repository
  - `create(data)` - create main entry + required addon children
  - `findByFloorplan(floorplanId)` - get all entries for floorplan
  - `findByVariantAddons(floorplanId, variantId, addons)` - check if exists
  - `findByItem(floorplanId, itemId)` - get entries for item (for variant switching)
  - `updateVariant(id, newVariantId)` - switch variant, update snapshots
  - `delete(id)` - cascade delete children + placements
  - `getChildren(parentId)` - get addon entries
- [ ] Add BOM service
  - `createBomEntry(floorplanId, variantId)` - create main + required addons
  - `switchVariant(bomEntryId, newVariantId)` - change variant, refresh addons
  - `updateSnapshotsFromCatalog(bomEntryId)` - refresh from catalog
  - `getBomForFloorplan(floorplanId)` - get hierarchical BOM with totals
- [ ] Add API endpoints
  - `GET /floorplans/:id/bom` - get hierarchical BOM
  - `POST /floorplans/:id/bom-entries` - create new BOM entry
  - `PUT /floorplans/:id/bom-entries/:id/variant` - switch variant
  - `POST /floorplans/:id/bom-entries/:id/picture` - upload custom picture
  - `DELETE /floorplans/:id/bom-entries/:id` - delete BOM + placements
  - `POST /floorplans/:id/bom/update-from-catalog` - refresh all snapshots

### 7.2 Auto-Sync: Placement Creation → BOM Entry

**Flow when user drags item to canvas:**
1. Check if BOM entry exists for (floorplan_id + variant_id) where parent is NULL
2. If NOT exists:
   - Create main BOM entry with variant snapshots
   - Create child BOM entries for required addons
3. Create placement referencing main BOM entry_id

**Flow when user changes variant (same item):**
1. Update main BOM entry: new variant_id, refresh snapshots
2. Delete all existing child BOM entries (old addons)
3. Create new child BOM entries for new variant's required addons
4. Placement stays same (same bom_entry_id reference)

**Flow when user deletes BOM entry:**
1. Cascade delete all child addon BOM entries
2. Cascade delete all placements referencing this BOM entry

### 7.3 BOM Display Structure

```
Floorplan: "Ground Floor" - Total: $2,847.00

┌────────────────────────────────────────────────────────┐
│ Main Item (qty from placements)                         │
│ ├─ Addon 1 (same qty)                                   │
│ └─ Addon 2 (same qty)                                   │
│                                                         │
│ Main Item (qty from placements)                         │
│ ├─ Addon 1 (same qty)                                   │
└────────────────────────────────────────────────────────┘

Example:
┌────────────────────────────────────────────────────────┐
│ Touch Panel (x3)                              $897.00 │
│ ├─ Wall Mount (x3)                             $87.00 │
│ └─ Back Box (x3)                               $45.00 │
│ Group Total:                                  $1,029.00│
│                                                         │
│ Light Switch (x5)                             $645.00 │
│ └─ Dimmer Module (x5)                         $310.00 │
│ Group Total:                                    $955.00│
│                                                         │
│ Floorplan Total:                             $2,847.00│
└────────────────────────────────────────────────────────┘
```

### 7.4 Update BOM from Catalog

**API:** `POST /floorplans/:id/bom/update-from-catalog`

**Process:**
1. For each BOM entry in floorplan:
   - Use `item_id` + `variant_id` references to fetch current catalog data
   - Compare with current snapshots
   - Update snapshots if changed
   - Log changes to change report
2. If variant/addon no longer exists or inactive:
   - Mark as "Invalid reference" in report
   - Don't delete, just flag
3. Return change report with:
   - Price changes (old → new)
   - Invalid/inactive references
   - Total before/after
   - Timestamp

### 7.5 Frontend BOM Panel

- [ ] BOM table showing hierarchical structure
- [ ] Columns: Picture, Name, Model #, Qty, Unit Price, Line Total
- [ ] Expandable/collapsible addon rows under parent
- [ ] Variant switcher dropdown (only variants of same item)
- [ ] "Add Optional Addon" button (for non-required addons)
- [ ] Custom picture upload per BOM entry
- [ ] "Update from Catalog" button with change report modal
- [ ] Delete BOM entry button (with confirmation)
- [ ] Floorplan total display

### 7.6 Placement-Level Controls

- [ ] Click placement → show variant/addon selector popup
- [ ] Variant dropdown (filtered to same item variants)
- [ ] Addon checkboxes (required vs optional)
- [ ] Changes update BOM entry (triggering snapshot refresh)

### 7.7 Migration Strategy

**Backfill existing data:**
1. For each placement with old structure:
   - Extract variant_id from placement
   - Check if BOM entry exists for (floorplan_id, variant_id)
   - If not, create BOM entry with snapshots from catalog
   - Create required addon children
   - Update placement.bom_entry_id
2. Remove old columns from placements

### 7.8 Tests

- [ ] Backend: Create placement → BOM entry + required addons created
- [ ] Backend: Switch variant → snapshots updated, addons swapped
- [ ] Backend: Delete BOM entry → children + placements deleted
- [ ] Backend: Update from catalog → snapshots refreshed, change report returned
- [ ] Frontend: BOM panel shows hierarchical structure
- [ ] Frontend: Variant switcher updates BOM and placements
- [ ] Frontend: Update from catalog displays change report

---

## Phase 8: Proposal Generation

### 8.1 Backend
- [ ] Build proposal generator from BOM (not direct catalog joins)
- [ ] Add endpoint: `POST /projects/:id/proposal`
- [ ] Dynamic floor columns + totals
- [ ] Validation for empty BOM/project states

### 8.2 Frontend
- [ ] Add export action in project dashboard
- [ ] Download file with proper naming
- [ ] Loading + error states
- [ ] Success feedback

### 8.3 Tests
- [ ] API tests for proposal generation
- [ ] Export flow tests in frontend
- [ ] Golden-file style checks for totals/layout

---

## Phase 9: Testing, QA, and Polish

### 9.1 Quality Gates
- [ ] Backend test suite green
- [ ] Frontend test suite green
- [ ] Critical path coverage maintained/improved

### 9.2 End-to-End Smoke
- [ ] Import catalog
- [ ] Create customer + project
- [ ] Upload floorplans
- [ ] Place items (creates BOM entries)
- [ ] Change variant/add-ons (updates BOM)
- [ ] Delete BOM entry (removes placements)
- [ ] Update BOM from catalog
- [ ] Export proposal

### 9.3 UX/Operational
- [ ] Consistent loading/empty/error states
- [ ] Clear failure messages for invalid/inactive references
- [ ] README + usage notes updated

---

## Weekly Execution Checklist (2-4 Weeks)

### Week 1
- [ ] BOM table schema + migrations
- [ ] Placement table update + backfill migration
- [ ] BOM repository + service
- [ ] Placement creation auto-creates BOM entry

### Week 2
- [ ] Variant switching (same item)
- [ ] Addon management (add/remove)
- [ ] BOM panel in dashboard
- [ ] Cascade delete

### Week 3
- [ ] Update from catalog endpoint
- [ ] Change report UX
- [ ] Custom picture upload
- [ ] Integration tests

### Week 4 (buffer/polish)
- [ ] Regression fixes
- [ ] E2E smoke pass
- [ ] Proposal export alignment with BOM

---

Last Updated: 2026-02-21

# SnapFlow - Implementation Plan (Tracking Edition)

## Master Progress Checklist

- [x] Phase 1: Foundation (backend/frontend setup, DB, core architecture)
- [x] Phase 2: Authentication + User Management
- [x] Phase 3: Catalog Management (categories/items/variants/add-ons)
- [x] Phase 4: Excel Catalog Import + Sync
- [x] Phase 5: Customers + Projects
- [~] Phase 6: Configurator Core (floorplans, canvas, placements)
- [ ] Phase 7: Project BOM (NEW)
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

### 6.3 Configurator UI Redesign (NEW - Based on Stakeholder Mockup)

**Goal:** Redesign the configurator layout based on stakeholder mockup for improved UX.

**Layout Structure:**
```
┌─────────────────────────────────────────────────────────────────┐
│  [Top Navigation Menu from Layout]                              │
├─────────────────────────────────────────────────────────────────┤
│  [Compact Project Header]                                       │
│  Project # | Name | Customer | Status                           │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────┐  ┌──────────────────┐ │
│  │  [Floorplan Tabs]                   │  │ PRODUCTS         │ │
│  │                                     │  │                  │ │
│  │  ┌─────────────────────────────┐    │  │ TOUCHPANELS      │ │
│  │  │                             │    │  │ [img] [img]      │ │
│  │  │      CANVAS AREA            │    │  │ [img] [img]      │ │
│  │  │   (Floorplan + Placements)  │    │  │                  │ │
│  │  │                             │    │  │ CLIMOS           │ │
│  │  │                             │    │  │ [img] [img]      │ │
│  │  │                             │    │  │                  │ │
│  │  └─────────────────────────────┘    │  │ SENSORS          │ │
│  │                                     │  │ [img]            │ │
│  └─────────────────────────────────────┘  │                  │ │
│                                           │ ──────────────── │ │
│                                           │ TOTAL: $X,XXX.XX │ │
│                                           │ [Generate PDF]   │ │
│                                           │ [Create Invoice] │ │
│                                           └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

**Tasks:**
- [ ] Create `ProductPanel` component (replaces ItemPalette)
  - [ ] Right-side position (350px fixed width)
  - [ ] Light theme (current white/gray)
  - [ ] Categories in ALL CAPS headers
  - [ ] 2-column grid for product cards
  - [ ] Each card: image, name, price
  - [ ] Scrollable product area
  - [ ] Fixed totals section at bottom
  - [ ] Simple total calculation (sum of item prices × quantity)
  - [ ] "Generate Presentation (PDF)" button (placeholder)
  - [ ] "Create Invoice (PDF)" button (placeholder)
- [ ] Update `ProjectDashboard` layout
  - [ ] Compact project header (single row)
  - [ ] Remove large project info header
  - [ ] Two-column layout: Canvas (flex) | ProductPanel (350px)
  - [ ] Floorplan tabs at top of canvas area
  - [ ] Full-width/height configurator (minus top menu)
- [ ] Prepare for BOM view toggle (future Phase 7)
  - [ ] Structure panel to allow view switcher
  - [ ] Configurator view (canvas + products)
  - [ ] BOM view (list of placed items with details)

---

## Phase 7: Project BOM (NEW - Priority)

## Goal
Auto-maintained, project-level Bill of Materials based on floorplan placements.

## Locked Decisions
- [x] BOM is automatically synced from placements
- [x] First variant is auto-selected when item is added
- [x] Required add-ons are auto-selected
- [x] User can change variant/add-ons later from floorplan
- [x] BOM updates immediately after those changes
- [x] Pricing is frozen snapshot by default
- [x] Manual "Update BOM" refreshes pricing and removes invalid/inactive/deleted refs
- [x] User receives a change report after update
- [x] BOM storage model: aggregated rows with quantity (`qty`)

### 7.1 Database + Backend Foundations
- [ ] Migration: create `project_bom_items` table
- [ ] Add indexes + unique grouping key (`project_id + floorplan_id + variant + addons_key`)
- [ ] Add BOM repository
- [ ] Add BOM service (`rebuildProjectBom(projectId)`, `getProjectBom(projectId)`)
- [ ] Add API: `GET /projects/:id/bom`

### 7.2 Auto-Sync from Placements
- [ ] On placement create: enforce default variant + required add-ons
- [ ] On placement create/update/delete: trigger BOM rebuild for project
- [ ] Canonicalize add-on sets for deterministic grouping
- [ ] Aggregate identical rows into `qty`
- [ ] Ensure BOM totals derive from snapshot fields

### 7.3 BOM Update From Catalog (Manual Action)
- [ ] API: `POST /projects/:id/bom/update-from-catalog`
- [ ] Refresh snapshot prices from current catalog
- [ ] Remove rows referencing deleted/inactive item/variant/add-ons
- [ ] Return structured change report:
  - [ ] updated prices
  - [ ] removed invalid/inactive rows
  - [ ] totals before/after
- [ ] Log update timestamp/user

### 7.4 Frontend BOM UX (Project Dashboard)
- [ ] Add BOM panel/table (variant, add-ons, qty, unit, line total)
- [ ] Add "Update BOM from Catalog" button
- [ ] Show change report to user after update
- [ ] Add placement-level variant/add-on selector UI
- [ ] Ensure selector changes persist and sync into BOM

### 7.5 BOM Tests
- [ ] Backend: create placement -> BOM row appears with defaults
- [ ] Backend: update placement variant/add-ons -> BOM regroup/recalc
- [ ] Backend: delete placement -> BOM qty decreases/removes row
- [ ] Backend: update-from-catalog returns correct diff
- [ ] Frontend: selector changes update BOM view
- [ ] Frontend: update action displays change report

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
- [ ] Place items
- [ ] Change variant/add-ons
- [ ] Validate BOM
- [ ] Update BOM from catalog
- [ ] Export proposal

### 9.3 UX/Operational
- [ ] Consistent loading/empty/error states
- [ ] Clear failure messages for invalid/inactive references
- [ ] README + usage notes updated

---

## Weekly Execution Checklist (2-4 Weeks)

### Week 1
- [ ] BOM table + repository/service + read API
- [ ] Hook placement create/update/delete to BOM rebuild
- [ ] Backend unit tests for core sync

### Week 2
- [ ] Placement defaulting (first variant + required add-ons)
- [ ] Placement variant/add-on edit UI
- [ ] BOM panel in dashboard

### Week 3
- [ ] Manual update-from-catalog endpoint
- [ ] Change report UX
- [ ] Integration tests for BOM refresh scenarios

### Week 4 (buffer/polish)
- [ ] Regression fixes
- [ ] E2E smoke pass
- [ ] Proposal export alignment with BOM

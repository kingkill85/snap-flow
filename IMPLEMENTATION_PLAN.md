# SnapFlow - Implementation Plan

## Overview
A web-based smart home configurator for automation companies to create proposals.

## Current Progress

### **COMPLETED PHASES ✅**

**Phase 1: Project Foundation - COMPLETED ✅**
- Backend server running with Hono framework
- Database with all 7 tables created and migrations working
- Project structure established
- Frontend React app with Vite, TypeScript, Flowbite React, and Tailwind CSS
- **Tests:** Server, database, repositories, and frontend components fully tested

**Phase 2: Authentication System - COMPLETED ✅**
- Backend: JWT token generation, password hashing (bcrypt), auth middleware
- Backend: Login/logout endpoints, user management (admin only)
- Frontend: AuthContext with login/logout functionality
- Frontend: Login page, ProtectedRoute component
- Frontend: Header with user dropdown and logout
- Default admin user created via seed script
- **Tests:** Auth endpoints, user management, frontend context, and protected routes fully tested

**Phase 3: Item Management (Admin) - COMPLETED ✅**

**3.1 Backend - Categories - COMPLETED ✅**
- CategoryRepository with full CRUD operations
- REST endpoints: POST /categories, GET /categories, GET /categories/:id, PUT /categories/:id, DELETE /categories/:id, PATCH /categories/reorder
- Full test coverage for category endpoints
- Support for category reordering with drag-and-drop

**3.2 Backend - Items - COMPLETED ✅**
- ItemVariantRepository with CRUD operations ✅
- ItemAddonRepository with CRUD operations ✅
- REST endpoints for items, variants, and add-ons ✅
- File upload middleware for variant image uploads ✅
- Database migrations 009-014 ✅
- Updated models (Item, ItemVariant, ItemAddon) ✅

**3.3 Frontend - Category Management - COMPLETED ✅**
- Category service with API integration
- Category management page with list view
- Create, edit, and delete category functionality
- Drag-and-drop reordering with up/down arrows
- Modal dialogs for CRUD operations
- Navigation reorganized: Projects ▼, Catalog ▼, Admin ▼

**3.4 Frontend - Item Management - COMPLETED ✅**
- Unified ItemFormModal for create/edit base items
- Unified VariantFormModal for create/edit variants with add-ons
- Expandable variant subtables in item list
- Two-step variant creation (create variant → add add-ons)
- Add-on management with Optional/Required flags
- Delete variant confirmation
- Image upload/delete for variants
- Add-on labels: "Model - Variant ($price)"
- Proper image sizing and "No Image" placeholders

**3.5 Excel Import with Variants & Add-Ons - COMPLETED ✅**
- Excel parsing service with category/item/variant/addon extraction
- Image extraction from Excel files (twoCellAnchor and oneCellAnchor support)
- 4-step import wizard with drag-drop file upload
- Import progress tracking and result display
- 50MB file upload limit
- Full backend sync (creates new, updates existing, deactivates missing)
- **Tests:** Backend tests for Excel sync (7 tests, all passing)
- **Tests:** Frontend ImportModal tests (8 tests, all passing)

---

### **IN PROGRESS PHASES 🚧**

**Phase 4: Customer & Project Management - COMPLETED ✅**
- CustomerRepository, ProjectRepository with full CRUD
- REST endpoints: /customers/*, /projects/* (with tests)
- Frontend: Customer list, Customer detail, Project list, Project dashboard
- All 124 backend tests passing ✅

**Phase 5: Configurator Core - IN PROGRESS 🚧**
- Backend: FloorplanRepository, PlacementRepository ✅
- Backend: /floorplans/*, /placements/* endpoints ✅
- Frontend: Services created ✅
- Frontend: Floorplan tabs, Canvas, Item palette - NOT STARTED ❌
- Frontend: Drag & drop, Placement management - NOT STARTED ❌

**Phase 6: Proposal Generation - NOT STARTED ❌**

**Phase 7: Testing & Polish - PARTIALLY COMPLETED ✅**
- Backend tests: 124/124 passing ✅
- Frontend tests: 100/100 passing ✅
- UI Polish: Remove default admin credentials from login page ✅

**Phase 8: Deployment - COMPLETED ✅**
- Docker containerization with multi-stage build
- GitHub Container Registry integration (ghcr.io/kingkill85/snap-flow:latest)
- docker-compose.yml with persistent volumes
- Auto-generated JWT_SECRET
- Auto-seed admin user on first run
- Comprehensive README with Docker instructions
- **Image:** `ghcr.io/kingkill85/snap-flow:latest`

---

## Phase 3.5 Reworked - Variant & Add-On Migration

### **Phase A: Integration Fix (CRITICAL - Fix the breakage)**
**Goal:** Make existing ItemManagement work with new backend structure

**A1. Update Frontend Types**
- [x] Update `Item` interface in `frontend/src/services/item.ts`
  - Remove: price, image_path, model_number
  - Add: base_model_number, variants[], addons[]
- [x] Add `ItemVariant` interface (id, item_id, style_name, model_number, price, image_path)
- [x] Add `ItemAddon` interface (id, parent_item_id, addon_item_id, slot_number, is_required)
- [x] Update hooks that use Item type (useItems.ts) ✅

**A2. Update ItemService Methods**
- [x] Modify create() to NOT send price/image (create base item only) ✅
- [x] Add getVariants(itemId): Promise<ItemVariant[]> ✅
- [x] Add createVariant(itemId, data): Promise<ItemVariant> ✅
- [x] Add updateVariant(itemId, variantId, data): Promise<ItemVariant> ✅
- [x] Add deleteVariant(itemId, variantId): Promise<void> ✅
- [x] Add getAddons(itemId): Promise<ItemAddon[]> ✅
- [x] Add addAddon(itemId, addonData): Promise<ItemAddon> ✅
- [x] Add removeAddon(itemId, addonId): Promise<void> ✅

**A3. Update ItemManagement (Minimal Fix)**
- [x] List view: Show first variant's image/price (temporary solution) ✅
- [x] Create form: Create base item + first variant together ✅
- [x] Edit form: Edit base item only (remove price/image fields) ✅
- [ ] Add "Manage Variants" button (opens placeholder modal)

**TESTS FOR PHASE A: ✅**
- ✅ Frontend types compile without TypeScript errors
- ✅ ItemService.create() works with new structure
- ✅ ItemManagement displays items correctly (using first variant)
- ✅ Can create new item with first variant
- ✅ Can edit base item details
- ✅ All existing item-related tests pass
- ✅ No console errors when viewing items

---

### **Phase B: Variant Management**
**Goal:** Full variant and add-on management UI

**B1. Variant Subtable in ItemManagement ✅**
- [x] Expandable row showing all variants
- [x] Variant details: image, style, model number, price
- [x] Add "Add Variant" button (placeholder)
- [x] Edit/Delete buttons per variant
- [x] Loading state
- [x] Empty state

**B2. Variant CRUD Modals ✅**
- ✅ Unified VariantFormModal (handles both create and edit)
- ✅ DeleteVariantModal for confirmation
- ✅ Full add/edit/delete functionality

**B3. AddonManager (Integrated into VariantFormModal) ✅**
- ✅ Add-on list with remove functionality
- ✅ Add new add-on with variant selector
- ✅ Optional/Required checkbox
- ✅ Add-on display: "Model - Variant ($price)"

**TESTS FOR PHASE B: ✅**
- ✅ Can add variant to existing item
- ✅ Can edit variant price and style
- ✅ Can upload variant image
- ✅ Can delete variant with confirmation
- ✅ Can add add-ons to variants
- ✅ Can remove add-ons from variants
- ✅ UI updates immediately after add/remove operations
- ✅ Comprehensive unit tests for all components

---

### **Phase C: Excel Import**
**Goal:** Complete Excel import with error logging

**C1. Create ImportModal Component**
- [ ] File upload with drag-drop or file picker
- [ ] Show parsing progress spinner
- [ ] Preview table columns:
  - Base Model Number
  - Item Name
  - Category
  - Variants (count)
  - Action (create/update)
- [ ] Preview shows grouped data (variants under base items)

**C2. Error Display**
- [ ] Error table showing:
  - Row number from Excel
  - Field with error
  - Error message
  - Value that caused error
- [ ] Warning section for missing add-ons
- [ ] Color-coded errors (red) vs warnings (yellow)

**C3. Import Execution**
- [ ] "Preview Import" button (parses without saving)
- [ ] "Confirm Import" button (executes import)
- [ ] Progress indicator during import
- [ ] Success summary showing:
  - Items created
  - Items updated
  - Variants created
  - Add-ons linked
- [ ] Error summary if import fails

**TESTS FOR PHASE C:**
- [ ] Can upload valid Excel file
- [ ] Preview shows correct item/variant structure
- [ ] Errors display with correct row numbers
- [ ] Import creates new items correctly
- [ ] Import updates existing items correctly
- [ ] Import creates variants with correct prices
- [ ] Import creates add-on relationships
- [ ] Shows success summary after import
- [ ] Handles Excel with missing images gracefully
- [ ] Validates add-on references exist

---

### **Phase D: Testing & Validation**
**Goal:** Full end-to-end testing

**D1. Integration Tests**
- [ ] Create item → Add variants → Add add-ons → Verify in list
- [ ] Update item → Verify changes persist
- [ ] Delete variant → Verify removed from item
- [ ] Import Excel → Verify all items created with variants

**D2. Error Handling Tests**
- [ ] Invalid Excel format shows clear error
- [ ] Missing required fields in Excel shows row error
- [ ] Duplicate model numbers handled correctly
- [ ] Network errors during import show user-friendly message

**D3. Edge Cases**
- [ ] Item with no variants (should not be possible, verify)
- [ ] Item with 10+ variants
- [ ] Excel with 221 rows imports successfully
- [ ] Import cancelled mid-way doesn't corrupt data

## Tech Stack
- **Frontend**: React + TypeScript + Vite + Flowbite React + Tailwind CSS
- **Backend**: Deno + Hono
- **Database**: SQLite (with abstraction layer)
- **Drag & Drop**: @dnd-kit
- **Excel**: xlsx (server-side generation)

---

## Project Structure

```
snap-flow/
├── backend/
│   ├── src/
│   │   ├── config/           # Database, env config
│   │   ├── middleware/       # Auth, error handling, upload
│   │   ├── models/           # TypeScript interfaces
│   │   ├── repositories/     # Database access layer
│   │   ├── services/         # Business logic
│   │   ├── routes/           # API endpoints
│   │   └── main.ts           # Entry point
│   ├── tests/                # Unit tests
│   ├── migrations/           # SQL migrations
│   └── deno.json
├── frontend/
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API clients
│   │   ├── context/          # React contexts
│   │   └── types/            # TypeScript types
│   ├── tests/                # Unit tests
│   └── package.json
└── README.md
```

---

## Phase 1: Project Foundation

### 1.1 Repository Setup
- [x] Create root directory structure
- [x] Initialize Git repository
- [x] Create .gitignore (Node, Deno, uploads)
- [x] Create README.md with setup instructions

### 1.2 Backend Setup
- [x] Initialize Deno project (deno.json)
- [x] Install dependencies: Hono, djwt, bcrypt, sqlite, xlsx
- [x] Create basic Hono server
- [x] Setup environment configuration
- [x] Create error handling middleware
- [x] Create CORS middleware
- [x] Create logging middleware
- [x] Add health check endpoint (GET /health)
- [x] Write tests for basic server setup

### 1.3 Database Foundation
- [x] Create database abstraction layer (Repository pattern)
- [x] Setup SQLite connection
- [x] Create migration runner
- [x] Write migration: create users table
- [x] Write migration: create categories table
- [x] Write migration: create items table
- [x] Write migration: create customers table
- [x] Write migration: create projects table
- [x] Write migration: create floorplans table
- [x] Write migration: create placements table
- [x] Create database models/interfaces
- [x] Write tests for database operations
- [x] Write tests for migrations

### 1.4 Frontend Setup
- [x] Initialize Vite + React + TypeScript project
- [x] Install dependencies: Flowbite React, Tailwind CSS, React Router, @dnd-kit, axios
- [x] Configure Tailwind CSS
- [x] Setup folder structure (components, pages, hooks, services, context, types)
- [x] Create API client service (axios wrapper)
- [x] Setup React Router with basic routes
- [x] Create basic layout components (Header, Sidebar, Footer)
- [x] Create 404 page
- [x] Write tests for basic components (Layout, Header)
- [x] Write tests for routing

---

## Phase 2: Authentication System

### 2.1 Backend Authentication
- [x] Create password hashing service (bcrypt)
- [x] Create JWT service (djwt) - generate and verify tokens
- [x] Create auth middleware (verify JWT from headers)
- [x] Create role-based access middleware (admin vs user)
- [x] POST /auth/login - authenticate user, return JWT
- [x] POST /auth/logout - invalidate token (optional for MVP)
- [x] POST /auth/refresh - refresh JWT (optional for MVP)
- [x] Write tests for auth endpoints

### 2.2 Frontend Authentication
- [x] Create AuthContext with provider
- [x] Create useAuth hook
- [x] Create login page with form
- [x] Create auth service (login, logout, get current user)
- [x] Create ProtectedRoute component
- [x] Create PublicRoute component (redirect if logged in)
- [x] Store JWT in memory (context) or localStorage
- [x] Add auth header to API requests
- [x] Write tests for auth context and hooks

### 2.3 User Management (Admin)
- [x] POST /users - create new user (admin only)
- [x] GET /users - list all users (admin only)
- [x] DELETE /users/:id - delete user (admin only)
- [x] GET /users/me - get current user info
- [x] Create admin dashboard layout
- [x] Create user list page (admin)
- [x] Create user creation form (admin)
- [x] Create user delete confirmation
- [x] Write tests for user management

---

## Phase 3: Item Management (Admin)

### 3.1 Backend - Categories
- [ ] Create CategoryRepository
- [ ] POST /categories - create category
- [ ] GET /categories - list all categories
- [ ] PUT /categories/:id - update category
- [ ] DELETE /categories/:id - delete category
- [ ] PATCH /categories/reorder - update sort order
- [ ] Add validation middleware
- [ ] Write tests for category endpoints

### 3.2 Backend - Items
- [ ] Create ItemRepository
- [ ] Setup file upload middleware (multipart/form-data)
- [ ] POST /items - create item with image upload
- [ ] GET /items - list items (with pagination, search, filter by category)
- [ ] GET /items/:id - get single item
- [ ] PUT /items/:id - update item
- [ ] DELETE /items/:id - delete item (and image file)
- [ ] Create file storage service (save to /uploads/items/)
- [ ] Write tests for item endpoints

### 3.3 Frontend - Category Management
- [ ] Create category service
- [ ] Create category list page
- [ ] Create category form component (add/edit)
- [ ] Create category card component
- [ ] Implement drag-to-reorder categories
- [ ] Add delete confirmation
- [ ] Write tests for category components

### 3.4 Frontend - Item Management
- [ ] Create item service
- [ ] Create item list page with:
  - [ ] Search functionality
  - [ ] Category filter
  - [ ] Pagination
- [ ] Create item card component (show image, name, price)
- [ ] Create item form component (add/edit) with:
  - [ ] Text inputs (name, model number, dimensions)
  - [ ] Textarea (description)
  - [ ] Number input (price)
  - [ ] Category select dropdown
  - [ ] Image upload with preview
- [ ] Create item detail view modal
- [ ] Handle image upload with preview
- [ ] Write tests for item components

### 3.5 Excel Import with Variants & Add-Ons (Critical Feature)

**Current Understanding:**
- Excel contains 221 rows (flat list)
- Products have **variants** (same base model, different style/color)
- Each variant has **its own full price** and **its own image**
- Add-Ons reference other products by **model number**
- Add-On 1 & 2 are **required** (customer must pick exactly one each)
- Add-On 3 & 4 are **optional** (customer can pick 0 or more)

**Database Schema Changes:**
- [x] Migration 009: Create `item_variants` table ✅
- [x] Migration 010: Create `item_addons` table ✅
- [x] Migration 011: Add `base_model_number` to items table ✅
- [x] Migration 012: Update placements for variants ✅

**Backend Implementation:**
- [x] Update TypeScript models/interfaces (Item, ItemVariant, ItemAddon, Placement) ✅
- [x] Update ItemRepository to work with new schema ✅
- [x] Create ItemVariantRepository ✅
- [x] Create ItemAddonRepository ✅
- [x] Update Item routes for variants and add-ons ✅
- [x] Update tests for new schema ✅
- [x] Create Excel parsing service ✅
- [x] Create import endpoints (preview + execute) ✅
  - Parse 221 rows from Excel
  - Group by base model number to identify variants
  - Extract Add-On references (model numbers)
  - Match images to variants
- [ ] Create import service (3-pass logic):
  - **Pass 1:** Create all base items and variants
  - **Pass 2:** Create Add-On relationships (link by model number)
  - **Pass 3:** Match and assign images to variants
- [ ] POST /items/import-preview - Parse Excel and return preview
- [ ] POST /items/import - Execute the import with validation
- [ ] Handle validation errors (invalid model numbers, missing add-ons, etc.)
- [x] Write tests for updated repositories ✅
- [x] Write tests for Excel parsing (basic tests updated) ✅
- [ ] Write tests for import service (manual testing for now)

**Image Handling:**
- [x] Extract 74 images from Excel (done: /tmp/excel_images/) ✅
- [ ] Create image matching logic (Phase 2 - after basic import works)
- [x] Store images in /uploads/items/{variant_id}/ ✅ (handled in variant creation)
- [x] Handle missing images gracefully ✅

**Frontend Implementation:**
- [ ] Step 5: Update TypeScript types and services
- [ ] Step 6: Update ItemManagement with variant accordion
- [ ] Step 7: Update configurator with auto-addons
- [ ] Step 8: Create ImportModal with error log
  - Display preview table:
    - Base products
    - Variants with style and price
    - Add-On relationships
    - Missing references (errors)
  - Confirm/Cancel buttons
- [ ] Show import progress (x of 221 items processed)
- [ ] Display import results (success count, error count)
- [ ] Write tests for import UI

**Data Structure After Import:**
```
Item (Base Product)
  ├─ Variant 1: "Ink Black" - $815 - image1.jpg
  ├─ Variant 2: "Pine Green" - $815 - image2.jpg
  └─ Add-Ons:
      ├─ Slot 1 (Required): Mounting Bracket
      ├─ Slot 2 (Required): Face Plate
      └─ Slot 3 (Optional): Extra Cable, Wall Adapter
```

**Import Validation Rules:**
- All rows must have valid model numbers
- Variants must share the same base model number
- Add-On model numbers must exist in the catalog (or be created first)
- Prices must be positive numbers
- Categories are created dynamically if not existing

---

## Phase 4: Customer & Project Management - COMPLETED ✅

### 4.1 Backend - Customers - COMPLETED ✅
- [x] Create CustomerRepository
- [x] POST /customers - create customer
- [x] GET /customers - list customers (with search)
- [x] GET /customers/:id - get customer details
- [x] PUT /customers/:id - update customer
- [x] DELETE /customers/:id - delete customer
- [x] Add validation
- [x] Write tests for customer endpoints (13 tests)

### 4.2 Backend - Projects - COMPLETED ✅
- [x] Create ProjectRepository
- [x] POST /projects - create project for customer
- [x] GET /projects - list all projects
- [x] GET /customers/:id/projects - get projects for customer
- [x] GET /projects/:id - get project details
- [x] PUT /projects/:id - update project
- [x] DELETE /projects/:id - delete project
- [x] Write tests for project endpoints (13 tests)

### 4.3 Frontend - Customer Management - COMPLETED ✅
- [x] Create customer service
- [x] Create customer list page with:
  - [x] Search by name
  - [x] Sort options (by name)
- [x] Create customer card component
- [x] Create customer form (add/edit)
- [x] Create customer detail page showing:
  - [x] Customer info
  - [x] List of projects
  - [x] Button to create new project
- [x] Add delete confirmation
- [x] Write tests for customer components

### 4.4 Frontend - Project Management - COMPLETED ✅
- [x] Create project service
- [x] Create project list component (shown in customer detail)
- [x] Create project list page (/projects with filters)
- [x] Create project card component
- [x] Create project form (add/edit)
- [x] Create project dashboard page with:
  - [x] Project info header
  - [x] Floorplan tabs (placeholder)
  - [x] Summary panel (placeholder)
- [x] Add delete confirmation
- [x] Write tests for project components

---

## Phase 5: Configurator Core - IN PROGRESS 🚧

### 5.1 Backend - Floorplans - COMPLETED ✅
- [x] Create FloorplanRepository
- [x] Setup file upload for floorplan images
- [x] POST /floorplans - upload floorplan image
  - [x] Save to /uploads/floorplans/
- [x] GET /floorplans - list floorplans (with project filter)
- [x] GET /floorplans/:id - get floorplan details
- [x] PUT /floorplans/:id - rename floorplan
- [x] DELETE /floorplans/:id - delete floorplan (and image)
- [x] PATCH /floorplans/reorder - update sort order
- [ ] Write tests for floorplan endpoints

### 5.2 Backend - Placements - COMPLETED ✅
- [x] Create PlacementRepository
- [x] POST /placements - create placement
  - [x] Body: floorplan_id, item_variant_id, x, y, width, height
- [x] GET /placements - get all placements (with floorplan filter)
- [x] PUT /placements/:id - update placement (move/resize)
- [x] DELETE /placements/:id - delete placement
- [x] POST /placements/bulk-update - update all placements of same item type
  - [x] Used when resizing affects all instances
- [ ] Write tests for placement endpoints

### 5.3 Frontend - Floorplan Management - IN PROGRESS 🚧
- [x] Create floorplan service
- [ ] Create FloorplanTabs component
  - [ ] Show tabs with floorplan names
  - [ ] Active tab highlighting
  - [ ] Click to switch floorplans
- [ ] Create "Add Floorplan" button/modal
  - [ ] Input: floorplan name
  - [ ] File upload: floorplan image (JPG/PNG)
- [ ] Create floorplan context menu (rename, delete)
- [ ] Implement tab reordering (drag tabs)
- [ ] Write tests for floorplan tabs

### 5.4 Frontend - Configurator Canvas
- [ ] Install @dnd-kit/core, @dnd-kit/sortable
- [ ] Create Canvas component:
  - [ ] Display floorplan image as background
  - [ ] Responsive sizing
  - [ ] Coordinate system (pixels relative to image)
- [ ] Setup DndContext wrapper
- [ ] Create Droppable canvas area
- [ ] Handle drop events (calculate x, y position)
- [ ] Write tests for canvas component

### 5.5 Frontend - Item Palette
- [ ] Create ItemPalette component (sidebar)
- [ ] Group items by category (accordion/sections)
- [ ] Display item thumbnails
- [ ] Show item name and price
- [ ] Make items draggable using @dnd-kit
- [ ] Add "Favorites" section (recently used items)
- [ ] Add search/filter in palette
- [ ] Write tests for item palette

### 5.6 Frontend - Drag & Drop
- [ ] Create DraggableItem component (for palette)
- [ ] Create DraggablePlacement component (on canvas)
- [ ] Handle drag start (from palette)
- [ ] Handle drag over canvas (show ghost/preview)
- [ ] Handle drop on canvas:
  - [ ] Calculate position (x, y)
  - [ ] Create placement in backend
  - [ ] Render placement on canvas
- [ ] Handle drag within canvas (move existing placement)
- [ ] Write tests for drag & drop logic

### 5.7 Frontend - Placement Management
- [ ] Create Placement component:
  - [ ] Display item image
  - [ ] Position absolutely based on x, y
  - [ ] Size based on width, height
- [ ] Implement selection:
  - [ ] Click to select (highlight border)
  - [ ] Escape to deselect
- [ ] Implement resizing:
  - [ ] Show resize handles on selected item
  - [ ] Drag handles to resize
  - [ ] Sync resize to ALL placements of same item type on current floorplan
  - [ ] Update backend for all affected placements
- [ ] Implement deletion:
  - [ ] Delete key removes selected placement
  - [ ] Or delete button on selected item
  - [ ] Confirm delete (optional for MVP)
- [ ] Write tests for placement interactions

### 5.8 Frontend - Live Summary Panel
- [ ] Create SummaryPanel component (sidebar or overlay)
- [ ] Aggregate placements data:
  - [ ] Group by item_id
  - [ ] Count quantity per floorplan
  - [ ] Calculate total quantity
- [ ] Display table:
  - [ ] Item name
  - [ ] Model number
  - [ ] Quantities per floor (dynamic columns)
  - [ ] Total quantity
  - [ ] Unit price
  - [ ] Total price
- [ ] Calculate grand total
- [ ] Update in real-time (React useEffect/useMemo)
- [ ] Add "Generate Proposal" button
- [ ] Write tests for summary calculations

---

## Phase 6: Proposal Generation

### 6.1 Backend - Excel Generation
- [ ] Install xlsx library for Deno
- [ ] Create Excel service
- [ ] Create proposal generation function:
  - [ ] Aggregate placements by item and floorplan
  - [ ] Create worksheet headers:
    - [ ] # (row number)
    - [ ] Item Description
    - [ ] Model Number
    - [ ] Dynamic floorplan name columns
    - [ ] Qty (total)
    - [ ] Unit Price
    - [ ] Total
  - [ ] Populate rows with data
  - [ ] Add totals row at bottom
  - [ ] Style header row (bold, background)
- [ ] POST /projects/:id/proposal - generate and return Excel
- [ ] Write tests for Excel generation

### 6.2 Frontend - Export
- [ ] Create proposal service
- [ ] Add "Export Proposal" button to summary panel
- [ ] Handle Excel download:
  - [ ] Call API endpoint
  - [ ] Receive blob/file
  - [ ] Trigger browser download
  - [ ] Filename: {project_name}_proposal.xlsx
- [ ] Add loading state during generation
- [ ] Handle errors
- [ ] Write tests for export functionality

---

## Phase 7: Testing & Polish

### 7.1 Unit Tests - Backend
- [ ] Test all repositories (CRUD operations)
- [ ] Test all API endpoints
- [ ] Test auth middleware
- [ ] Test file upload handling
- [ ] Test Excel import parsing
- [ ] Test Excel generation
- [ ] Aim for >80% coverage

### 7.2 Unit Tests - Frontend
- [ ] Test all components (render, interactions)
- [ ] Test all hooks
- [ ] Test all services/API calls
- [ ] Test auth context
- [ ] Test drag & drop logic
- [ ] Test summary calculations
- [ ] Aim for >80% coverage

### 7.3 Integration Testing
- [ ] End-to-end workflow test:
  - [ ] Login as admin
  - [ ] Import items from Excel
  - [ ] Create customer
  - [ ] Create project
  - [ ] Upload floorplan
  - [ ] Drag items to floorplan
  - [ ] Resize items
  - [ ] Generate proposal
  - [ ] Verify Excel output

### 7.4 UI Polish
- [ ] Add loading spinners (Flowbite Spinner)
- [ ] Add error messages/toasts (Flowbite Toast)
- [ ] Add empty states (no items, no customers, etc.)
- [ ] Add confirmation dialogs for destructive actions
- [ ] Add keyboard shortcuts:
  - [ ] Delete key: remove selected placement
  - [ ] Escape: deselect placement
- [ ] Responsive adjustments (mobile-friendly if needed)

### 7.5 Documentation
- [ ] Write setup instructions in README
- [ ] Document API endpoints
- [ ] Create user guide (basic):
  - [ ] How to import items
  - [ ] How to create a project
  - [ ] How to use the configurator
  - [ ] How to generate proposal

---

## Phase 8: Deployment - COMPLETED ✅

### 8.1 Production Configuration - COMPLETED ✅
- [x] Create production environment variables (.env.production)
- [x] Setup production database (SQLite with Docker volumes)
- [x] Configure CORS for production
- [x] Configure file upload limits (50MB for Excel)

### 8.2 Docker Setup - COMPLETED ✅
- [x] Create Dockerfile (multi-stage build)
  - Stage 1: Node.js for frontend build
  - Stage 2: Deno for backend runtime
- [x] Create docker-compose.yml with volumes
- [x] Setup volume for uploads (/app/backend/uploads)
- [x] Setup volume for database (/app/backend/data)
- [x] Add .dockerignore for optimized builds
- [x] Create deploy.sh automation script

### 8.3 GitHub Container Registry - COMPLETED ✅
- [x] Configure GitHub authentication for ghcr.io
- [x] Push image to ghcr.io/kingkill85/snap-flow:latest
- [x] Test pull and run from registry

### 8.4 Build & Deploy Features - COMPLETED ✅
- [x] Build frontend for production (npm run build)
- [x] Serve static frontend from backend
- [x] Auto-generate JWT_SECRET if not provided
- [x] Auto-seed admin user on first run (with random password)
- [x] Display admin credentials in container logs
- [x] Update README with Docker deployment instructions

**Docker Image:** `ghcr.io/kingkill85/snap-flow:latest`

**Quick Deploy:**
```bash
# Using Docker Compose
docker-compose up -d

# Or Docker Run
docker run -d -p 8000:8000 \
  -v snapflow_data:/app/backend/data \
  -v snapflow_uploads:/app/backend/uploads \
  ghcr.io/kingkill85/snap-flow:latest
```

**Access:** http://localhost:8000
**Default Admin:** Check container logs for auto-generated password

---

## Data Models

### User
```typescript
interface User {
  id: number;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
}
```

### Category
```typescript
interface Category {
  id: number;
  name: string;
  sort_order: number;
}
```

### Item (Base Product)
```typescript
interface Item {
  id: number;
  category_id: number;
  name: string;                    // Product name (e.g., "Source 7")
  description: string;
  base_model_number: string;       // Base model (e.g., "MGWSIPD-LK.18")
  dimensions: string;
  created_at: string;
}
```

### Item Variant
```typescript
interface ItemVariant {
  id: number;
  item_id: number;                 // Reference to parent Item
  style_name: string;              // Variant name (e.g., "Ink Black", "Pine Green")
  model_number: string;            // Full model number (e.g., "MGWSIPD-LK.18 Ink Black")
  price: number;                   // Full price (not adjustment)
  image_path: string;              // Path to variant image
  sort_order: number;              // Display order within product
  created_at: string;
}
```

### Item Add-On (Relationship)
```typescript
interface ItemAddon {
  id: number;
  parent_item_id: number;          // The item that has add-ons
  addon_item_id: number;           // The add-on item
  slot_number: number;             // 1-4 (slots 1-2 required, 3-4 optional)
  is_required: boolean;            // true for slots 1-2, false for 3-4
  sort_order: number;              // Display order within slot
  created_at: string;
}
```

### Customer
```typescript
interface Customer {
  id: number;
  name: string;
  email: string;
  phone: string;
  address: string;
  created_by: number;
  created_at: string;
}
```

### Project
```typescript
interface Project {
  id: number;
  customer_id: number;
  name: string;
  status: 'active' | 'completed' | 'cancelled';
  created_at: string;
}
```

### Floorplan
```typescript
interface Floorplan {
  id: number;
  project_id: number;
  name: string;
  image_path: string;
  sort_order: number;
}
```

### Placement
```typescript
interface Placement {
  id: number;
  floorplan_id: number;
  item_variant_id: number;         // Reference to specific variant (e.g., "Ink Black")
  x: number;
  y: number;
  width: number;
  height: number;
  selected_addons: number[];       // IDs of selected add-ons (slots 1-4)
  created_at: string;
}
```

---

## File Storage Structure

```
uploads/
├── items/                          # Product images from import
│   ├── gateway-zb10.jpg
│   ├── panel-2btn.jpg
│   └── ...
└── customers/
    └── {customer-id}/
        └── {project-id}/
            ├── ground-floor.jpg
            ├── first-floor.jpg
            └── basement.jpg
```

---

## API Endpoints Summary

### Auth
- POST /auth/login
- POST /auth/logout

### Users (Admin)
- POST /users
- GET /users
- DELETE /users/:id
- GET /users/me

### Categories
- POST /categories (Admin)
- GET /categories
- PUT /categories/:id (Admin)
- DELETE /categories/:id (Admin)
- PATCH /categories/reorder (Admin)

### Items (Base Products)
- POST /items (Admin)
- GET /items
- GET /items/:id
- PUT /items/:id (Admin)
- DELETE /items/:id (Admin)
- POST /items/import (Admin)
- POST /items/import-preview (Admin)

### Item Variants
- POST /items/:id/variants (Admin)
- GET /items/:id/variants
- PUT /items/:id/variants/:variantId (Admin)
- DELETE /items/:id/variants/:variantId (Admin)
- PATCH /items/:id/variants/reorder (Admin)

### Item Add-Ons
- POST /items/:id/addons (Admin)
- GET /items/:id/addons
- DELETE /items/:id/addons/:addonId (Admin)

### Customers
- POST /customers
- GET /customers
- GET /customers/:id
- PUT /customers/:id
- DELETE /customers/:id

### Projects
- POST /projects
- GET /projects
- GET /projects/:id
- PUT /projects/:id
- DELETE /projects/:id
- GET /customers/:id/projects
- POST /projects/:id/proposal

### Floorplans
- POST /floorplans
- GET /projects/:id/floorplans
- GET /floorplans/:id
- PUT /floorplans/:id
- DELETE /floorplans/:id
- PATCH /floorplans/reorder

### Placements
- POST /placements
- GET /floorplans/:id/placements
- PUT /placements/:id
- DELETE /placements/:id
- POST /placements/bulk-update

---

## MVP Features Checklist

### Must Have
- [x] User authentication (admin/user roles)
- [x] Admin creates users
- [x] Excel import of items with images
- [x] Item categories (dynamic)
- [x] Customer management (list, create, edit, delete, search)
- [x] Project management per customer (list, create, edit, delete, filter)
- [x] Backend: Floorplan upload (JPG/PNG)
- [ ] Frontend: Floorplan upload UI
- [ ] Drag & drop items onto floorplan
- [ ] Resize items (syncs all same-type items)
- [ ] Live summary with quantities
- [ ] Generate Excel proposal

### Nice to Have (Post-MVP)
- [ ] Discount calculation
- [ ] Service costs
- [ ] Multiple currencies
- [ ] PDF export
- [ ] Real-time collaboration
- [ ] Undo/redo in configurator
- [ ] Item search in palette
- [ ] Project templates

---

## Testing Checklist

### Backend Tests - COMPLETED ✅
- [x] Repository layer tests (all repositories)
- [x] API endpoint tests (auth, users, categories, items, variants, addons, customers, projects)
- [x] Auth middleware tests
- [x] File upload tests
- [x] Excel import tests
- [ ] Excel generation tests
- [ ] Floorplan tests
- [ ] Placement tests
- **Status:** 124/124 tests passing ✅

### Frontend Tests - COMPLETED ✅
- [x] Component rendering tests (Header, ImportModal, etc.)
- [x] Hook tests (useCategories, useItems)
- [x] Service/API tests
- [x] Auth context tests
- [ ] Drag & drop tests
- [ ] Calculation tests
- **Status:** 100/100 tests passing ✅

---

## Notes

### Excel Import Format
Expected columns in import Excel:
- Category
- Name
- Description
- Model Number
- Dimensions
- Price
- Image Filename (optional, for matching)

### Proposal Excel Format
Generated Excel includes:
- Item description
- Model number
- Quantity per floor (dynamic columns)
- Total quantity
- Unit price
- Line total
- Grand total

### Currency
Single currency support for MVP. Currency symbol can be configured later.

### Security Considerations
- [ ] JWT token expiration
- [ ] Password hashing
- [ ] Input validation
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention
- [ ] CSRF protection (if using cookies)
- [ ] File upload restrictions (type, size)
- [ ] Path traversal prevention in file storage

### Performance Considerations
- [ ] Lazy load floorplan images
- [ ] Pagination for item lists
- [ ] Debounce search inputs
- [ ] Optimize re-renders in configurator
- [ ] Database indexes on foreign keys

---

## Testing Strategy

### Continuous Testing Approach
**Tests should be written alongside code, not at the end.**

Each phase includes test todos that should be completed as part of that phase:
- **Backend:** Write tests immediately after implementing endpoints or repositories
- **Frontend:** Write tests immediately after creating components or hooks

### Test Coverage Goals
- **Backend:** >80% coverage (critical paths: 100%)
- **Frontend:** >80% coverage (critical paths: 100%)
- **Integration:** Full end-to-end workflow tests

### Test Frameworks
- **Backend:** Deno.test (built-in)
- **Frontend:** Vitest + React Testing Library
- **E2E:** Playwright or Cypress (Phase 7)

### When to Add Tests
1. After implementing each repository method
2. After creating each API endpoint
3. After creating each significant component
4. After implementing complex logic (drag & drop, calculations)
5. Integration tests at the end of each major feature

### Running Tests
```bash
# Backend
cd backend && deno task test

# Frontend
cd frontend && npm test
```

---

## Timeline Estimate

**Total: ~16-20 days**

- Phase 1: 2-3 days (including tests)
- Phase 2: 2-3 days (including tests)
- Phase 3: 3-4 days (including tests)
- Phase 4: 2-3 days (including tests)
- Phase 5: 5-6 days (most complex, including tests)
- Phase 6: 1-2 days (including tests)
- Phase 7: 2-3 days (testing & polish)
- Phase 8: 1-2 days

**Note:** Timeline includes time for writing tests alongside feature development.

---

## Next Steps

1. Review this plan
2. Make any adjustments
3. Start with Phase 1.1
4. Track progress by checking off todos
5. Regular check-ins and adjustments as needed

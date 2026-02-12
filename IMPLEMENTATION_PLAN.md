# SnapFlow - Implementation Plan

## Overview
A web-based smart home configurator for automation companies to create proposals.

## Current Progress

**Phase 1: Project Foundation - COMPLETED ✅**
- Backend server running with Hono framework
- Database with all 7 tables created and migrations working
- Project structure established

**Recent Commits:**
- `6e50f69` - Fix sqlite version and add .gitignore
- `95ec7f3` - Phase 1.3: Database foundation
- `35f451e` - Add deno.lock for dependency locking  
- `7da574f` - Phase 1.2: Backend foundation setup

**Next:** Phase 1.4 - Frontend Setup

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

### 1.4 Frontend Setup
- [ ] Initialize Vite + React + TypeScript project
- [ ] Install dependencies: Flowbite React, Tailwind CSS, React Router, @dnd-kit, axios
- [ ] Configure Tailwind CSS
- [ ] Setup folder structure (components, pages, hooks, services, context, types)
- [ ] Create API client service (axios wrapper)
- [ ] Setup React Router with basic routes
- [ ] Create basic layout components (Header, Sidebar, Footer)
- [ ] Create 404 page

---

## Phase 2: Authentication System

### 2.1 Backend Authentication
- [ ] Create password hashing service (bcrypt)
- [ ] Create JWT service (djwt) - generate and verify tokens
- [ ] Create auth middleware (verify JWT from headers)
- [ ] Create role-based access middleware (admin vs user)
- [ ] POST /auth/login - authenticate user, return JWT
- [ ] POST /auth/logout - invalidate token (optional for MVP)
- [ ] POST /auth/refresh - refresh JWT (optional for MVP)
- [ ] Write tests for auth endpoints

### 2.2 Frontend Authentication
- [ ] Create AuthContext with provider
- [ ] Create useAuth hook
- [ ] Create login page with form
- [ ] Create auth service (login, logout, get current user)
- [ ] Create ProtectedRoute component
- [ ] Create PublicRoute component (redirect if logged in)
- [ ] Store JWT in memory (context) or localStorage
- [ ] Add auth header to API requests
- [ ] Write tests for auth context and hooks

### 2.3 User Management (Admin)
- [ ] POST /users - create new user (admin only)
- [ ] GET /users - list all users (admin only)
- [ ] DELETE /users/:id - delete user (admin only)
- [ ] GET /users/me - get current user info
- [ ] Create admin dashboard layout
- [ ] Create user list page (admin)
- [ ] Create user creation form (admin)
- [ ] Create user delete confirmation
- [ ] Write tests for user management

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

### 3.5 Excel Import (Critical Feature)
- [ ] Research xlsx library for Deno
- [ ] Create Excel parsing service
- [ ] POST /items/import - upload and parse Excel
- [ ] Parse Excel columns:
  - [ ] Category (create if not exists)
  - [ ] Name
  - [ ] Description
  - [ ] Model Number
  - [ ] Dimensions
  - [ ] Price
  - [ ] Image filename (reference)
- [ ] Validate parsed data
- [ ] Handle duplicate items (update or skip)
- [ ] Create categories dynamically from Excel
- [ ] Return preview of items to be imported
- [ ] Confirm import endpoint
- [ ] Create frontend Excel upload component
- [ ] Show upload progress
- [ ] Show import preview table
- [ ] Handle import confirmation
- [ ] Write tests for Excel import

---

## Phase 4: Customer & Project Management

### 4.1 Backend - Customers
- [ ] Create CustomerRepository
- [ ] POST /customers - create customer
- [ ] GET /customers - list customers (with search)
- [ ] GET /customers/:id - get customer details
- [ ] PUT /customers/:id - update customer
- [ ] DELETE /customers/:id - delete customer
- [ ] Add validation
- [ ] Write tests for customer endpoints

### 4.2 Backend - Projects
- [ ] Create ProjectRepository
- [ ] POST /projects - create project for customer
- [ ] GET /projects - list all projects
- [ ] GET /customers/:id/projects - get projects for customer
- [ ] GET /projects/:id - get project details
- [ ] PUT /projects/:id - update project
- [ ] DELETE /projects/:id - delete project
- [ ] Write tests for project endpoints

### 4.3 Frontend - Customer Management
- [ ] Create customer service
- [ ] Create customer list page with:
  - [ ] Search by name
  - [ ] Sort options
- [ ] Create customer card component
- [ ] Create customer form (add/edit)
- [ ] Create customer detail page showing:
  - [ ] Customer info
  - [ ] List of projects
  - [ ] Button to create new project
- [ ] Add delete confirmation
- [ ] Write tests for customer components

### 4.4 Frontend - Project Management
- [ ] Create project service
- [ ] Create project list component (shown in customer detail)
- [ ] Create project card component
- [ ] Create project form (add/edit)
- [ ] Create project dashboard page with:
  - [ ] Project info header
  - [ ] Floorplan tabs/configurator
  - [ ] Summary panel
- [ ] Add delete confirmation
- [ ] Write tests for project components

---

## Phase 5: Configurator Core

### 5.1 Backend - Floorplans
- [ ] Create FloorplanRepository
- [ ] Setup file upload for floorplan images
- [ ] POST /floorplans - upload floorplan image
  - [ ] Save to /uploads/customers/{customer_id}/{project_id}/
- [ ] GET /projects/:id/floorplans - list floorplans for project
- [ ] GET /floorplans/:id - get floorplan details
- [ ] PUT /floorplans/:id - rename floorplan
- [ ] DELETE /floorplans/:id - delete floorplan (and image)
- [ ] PATCH /floorplans/reorder - update sort order
- [ ] Write tests for floorplan endpoints

### 5.2 Backend - Placements
- [ ] Create PlacementRepository
- [ ] POST /placements - create placement
  - [ ] Body: floorplan_id, item_id, x, y, width, height
- [ ] GET /floorplans/:id/placements - get all placements
- [ ] PUT /placements/:id - update placement (move/resize)
- [ ] DELETE /placements/:id - delete placement
- [ ] POST /placements/bulk-update - update all placements of same item type
  - [ ] Used when resizing affects all instances
- [ ] Write tests for placement endpoints

### 5.3 Frontend - Floorplan Management
- [ ] Create floorplan service
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

## Phase 8: Deployment

### 8.1 Production Configuration
- [ ] Create production environment variables
- [ ] Setup production database (SQLite file location)
- [ ] Configure CORS for production domain
- [ ] Configure file upload limits

### 8.2 Docker Setup
- [ ] Create Dockerfile for backend
- [ ] Create Dockerfile for frontend
- [ ] Create docker-compose.yml
- [ ] Setup volume for uploads
- [ ] Setup volume for database

### 8.3 Build & Deploy
- [ ] Build frontend for production
- [ ] Configure backend to serve frontend (optional)
- [ ] Deploy to server
- [ ] Setup reverse proxy (nginx)
- [ ] Setup SSL certificate (Let's Encrypt)
- [ ] Test deployment
- [ ] Monitor logs

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

### Item
```typescript
interface Item {
  id: number;
  category_id: number;
  name: string;
  description: string;
  model_number: string;
  dimensions: string;
  price: number;
  image_path: string;
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
  item_id: number;
  x: number;
  y: number;
  width: number;
  height: number;
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

### Items
- POST /items (Admin)
- GET /items
- GET /items/:id
- PUT /items/:id (Admin)
- DELETE /items/:id (Admin)
- POST /items/import (Admin)

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
- [ ] User authentication (admin/user roles)
- [ ] Admin creates users
- [ ] Excel import of items with images
- [ ] Item categories (dynamic)
- [ ] Customer management
- [ ] Project management per customer
- [ ] Floorplan upload (JPG/PNG)
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

### Backend Tests
- [ ] Repository layer tests
- [ ] API endpoint tests
- [ ] Auth middleware tests
- [ ] File upload tests
- [ ] Excel import tests
- [ ] Excel generation tests

### Frontend Tests
- [ ] Component rendering tests
- [ ] Hook tests
- [ ] Service/API tests
- [ ] Context tests
- [ ] Drag & drop tests
- [ ] Calculation tests

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

## Timeline Estimate

**Total: ~14-16 days**

- Phase 1: 2 days
- Phase 2: 1-2 days
- Phase 3: 2-3 days
- Phase 4: 2 days
- Phase 5: 4-5 days (most complex)
- Phase 6: 1 day
- Phase 7: 2 days
- Phase 8: 1-2 days

---

## Next Steps

1. Review this plan
2. Make any adjustments
3. Start with Phase 1.1
4. Track progress by checking off todos
5. Regular check-ins and adjustments as needed

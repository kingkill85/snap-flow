# AGENTS.md - Project Context for AI Assistants

## Project Overview

**SnapFlow** - A web application for smart home automation companies to create project proposals.

**Purpose:** Upload floorplans, drag-and-drop smart home devices onto them, and generate Excel proposals.

**Status:** MVP in development

**Location:** `/home/michael/dev/snap-flow/`

---

## Tech Stack

### Backend
- **Runtime:** Deno (v1.40+)
- **Framework:** Hono
- **Database:** SQLite with Repository pattern
- **Auth:** JWT (djwt library)
- **Excel:** xlsx library (server-side)
- **Testing:** Deno.test

### Frontend
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **UI Library:** Flowbite React + Tailwind CSS
- **Routing:** React Router
- **Drag & Drop:** @dnd-kit
- **HTTP Client:** Axios
- **Testing:** Vitest + React Testing Library

---

## Architecture Patterns

### Backend
1. **Repository Pattern** - Database access through Repository classes
2. **Service Layer** - Business logic separated from controllers
3. **Middleware Chain** - Auth, error handling, validation
4. **RESTful API** - Standard HTTP methods

### Frontend
1. **Component-Based** - Reusable UI components
2. **Custom Hooks** - Logic in reusable hooks
3. **Context API** - Global state
4. **Service Layer** - API calls in services/

---

## Project Structure

```
snap-flow/
├── backend/
│   ├── src/
│   │   ├── config/          # Database, env
│   │   ├── middleware/      # Express-style middleware
│   │   ├── models/          # TypeScript interfaces
│   │   ├── repositories/    # Database access
│   │   ├── services/        # Business logic
│   │   ├── routes/          # API routes
│   │   └── main.ts
│   ├── tests/
│   ├── migrations/
│   └── deno.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── context/
│   │   └── types/
│   ├── tests/
│   └── package.json
├── IMPLEMENTATION_PLAN.md
└── AGENTS.md (this file)
```

---

## Code Conventions

### TypeScript
- **Strict mode** enabled
- Interface names: `PascalCase`
- Variables: `camelCase`
- Constants: `UPPER_SNAKE_CASE`

### Backend Example
```typescript
class ItemRepository {
  async findAll(): Promise<Item[]> { }
  async create(data: CreateItemDTO): Promise<Item> { }
}

app.get('/items', async (c) => {
  const items = await itemRepository.findAll();
  return c.json(items);
});
```

### Frontend Example
```typescript
// Component
const ItemCard: React.FC<ItemCardProps> = ({ item }) => { }

// Service
export const itemService = {
  getAll: () => api.get('/items'),
}

// Hook
export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  // ... fetch logic with AbortController
  return { categories, isLoading, error, refetch };
}
```

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` with `use` prefix
- Services: `camelCase.ts`
- Repositories: `PascalCase.ts` (e.g., `CategoryRepository.ts`)
- Routes: `camelCase.ts` in routes/ folder

---

## Backend Services

### File Storage Service
Located at `src/services/file-storage.ts`

```typescript
import { fileStorageService } from '../services/file-storage.ts';

// Save uploaded file
const filePath = await fileStorageService.saveFile(
  buffer,           // Uint8Array
  originalFilename, // string
  'items'          // subdirectory
);

// Delete file
await fileStorageService.deleteFile(filePath);

// Check if file exists
const exists = await fileStorageService.fileExists(filePath);
```

**Features:**
- Automatic directory creation
- Filename sanitization (removes path traversal attempts)
- Unique filename generation with timestamp + random suffix
- Supports: JPEG, PNG, WebP

### Upload Middleware
Located at `src/middleware/upload.ts`

```typescript
import { uploadMiddleware } from '../middleware/upload.ts';

// In route definition
itemRoutes.post(
  '/',
  authMiddleware,
  adminMiddleware,
  uploadMiddleware('items'),  // subdirectory name
  async (c) => {
    const uploadResult = c.get('uploadResult');
    // uploadResult.success: boolean
    // uploadResult.filePath: string (if success)
    // uploadResult.error: string (if !success)
  }
);
```

**Features:**
- Validates MIME types (image/jpeg, image/png, image/webp)
- Max file size: 5MB
- Returns result via context variables
- Handles cleanup on validation errors

---

## API Endpoints

### Categories
All category endpoints (except reorder) are public:

```
GET    /api/categories              # List all (sorted by sort_order)
GET    /api/categories/:id          # Get single category
POST   /api/categories              # Create (admin only)
PUT    /api/categories/:id          # Update (admin only)
DELETE /api/categories/:id          # Delete (admin only)
PATCH  /api/categories/reorder      # Update sort order (admin only)
                                     # Body: { category_ids: [3, 1, 2] }
```

### Items
Item list is public, other operations require admin:

```
GET    /api/items                   # List with pagination/filter
                                     # Query: ?category_id=1&search=bulb&page=1&limit=20
GET    /api/items/:id               # Get single item
POST   /api/items                   # Create with image (admin only)
                                     # Content-Type: multipart/form-data
                                     # Fields: category_id, name, description, model_number, dimensions, price, image
PUT    /api/items/:id               # Update with optional image (admin only)
DELETE /api/items/:id               # Delete item + image (admin only)
```

### Static Files
Uploaded images are served at `/uploads/*`:
- Item images: `/uploads/items/{filename}`
- Example: `http://localhost:8000/uploads/items/1234567890-abc123.jpg`

---

## Repository Pattern Examples

### Category Repository
```typescript
import { categoryRepository } from '../repositories/category.ts';

// Get all (sorted by sort_order)
const categories = await categoryRepository.findAll();

// Get by ID
const category = await categoryRepository.findById(1);

// Create
const newCategory = await categoryRepository.create({
  name: 'Lighting',
  sort_order: 1  // optional, auto-incremented if not provided
});

// Update
const updated = await categoryRepository.update(1, { name: 'Smart Lighting' });

// Delete
await categoryRepository.delete(1);

// Reorder (updates sort_order for multiple categories)
await categoryRepository.reorder([3, 1, 2]);  // Sets order: 3=1, 1=2, 2=3
```

### Item Repository
```typescript
import { itemRepository } from '../repositories/item.ts';

// Get all with pagination and filtering
const result = await itemRepository.findAll(
  { category_id: 1, search: 'smart' },  // filter (optional)
  { page: 1, limit: 20 }                 // pagination (optional)
);
// Returns: { items: Item[], total: number, page: number, totalPages: number }

// Get by ID
const item = await itemRepository.findById(1);

// Get by category
const items = await itemRepository.findByCategory(1);

// Create
const newItem = await itemRepository.create({
  category_id: 1,
  name: 'Smart Bulb',
  description: 'A smart light bulb',
  model_number: 'SB-100',
  dimensions: '120x80mm',
  price: 29.99,
  image_path: 'items/1234567890-abc123.jpg'  // optional
});

// Update (partial updates supported)
const updated = await itemRepository.update(1, {
  name: 'Smart Bulb Pro',
  price: 39.99
});

// Delete
await itemRepository.delete(1);

// Bulk create (for Excel import)
const items = await itemRepository.bulkCreate([item1, item2, item3]);
```

---

## Database Schema

### Tables
1. **users** - Auth & roles
2. **categories** - Item categories (dynamic)
3. **items** - Products with images
4. **customers** - Client info
5. **projects** - Customer projects
6. **floorplans** - Floorplan images
7. **placements** - Items on floorplans

### Relationships
- Customer → Projects (1:N)
- Project → Floorplans (1:N)
- Floorplan → Placements (1:N)
- Item → Placements (1:N)
- Category → Items (1:N)

---

## File Storage

```
uploads/
├── items/                          # Product images
│   └── item-name.jpg
└── customers/
    └── {customer-id}/
        └── {project-id}/
            └── floorplan-name.jpg
```

**Never hardcode paths** - Use file storage service.

---

## Environment Variables

### Backend (.env)
```
PORT=8000
DATABASE_URL=./data/database.sqlite
JWT_SECRET=your-secret-key
UPLOAD_DIR=./uploads
```

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

---

## API Response Format

```typescript
// Success
{
  "data": { ... },
  "message": "Optional"
}

// Error
{
  "error": "Message",
  "details": { ... }
}
```

### Status Codes
- 200: OK
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

---

## Testing

### Backend
```typescript
Deno.test("ItemRepository.findAll returns items", async () => {
  // Setup, Execute, Assert
});
```

### Frontend
```typescript
describe('ItemCard', () => {
  it('renders item', () => {
    render(<ItemCard item={mockItem} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });
});
```

### Running Tests

**Backend Tests (Deno):**
```bash
cd backend

# Run all tests
deno task test

# Run specific test file
deno test --allow-all tests/routes/categories_test.ts

# Run with coverage (Deno built-in)
deno test --allow-all --coverage=coverage
deno coverage coverage
```

**Frontend Tests (Vitest):**
```bash
cd frontend

# Run all tests
npm test

# Run in watch mode (development)
npm run test:watch

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- tests/Header.test.tsx
```

**Test File Locations:**
- Backend: `backend/tests/**/*.test.ts`
- Frontend: `frontend/tests/**/*.test.tsx`

**Important:** Backend tests require the server to be running on port 8000. Start the backend first:
```bash
cd backend && deno task dev
# Then in another terminal:
cd backend && deno task test
```

### Coverage Goals
- Backend: >80%
- Frontend: >80%
- Critical paths: 100%

---

## UI Consistency Patterns

### Action Buttons in Tables
When displaying Edit/Delete buttons in table rows, use this consistent pattern:

```tsx
<Table.Cell>
  <div className="flex gap-2">
    <Button
      color="light"
      size="xs"
      onClick={() => openEditModal(item)}
    >
      <HiPencil className="mr-1 h-4 w-4" />
      Edit
    </Button>
    <Button
      color="failure"
      size="xs"
      onClick={() => openDeleteModal(item)}
    >
      <HiTrash className="mr-1 h-4 w-4" />
      Delete
    </Button>
  </div>
</Table.Cell>
```

**Rules:**
1. Always include both icon AND text label for accessibility
2. Use `color="light"` for Edit, `color="failure"` for Delete
3. Use `size="xs"` for table action buttons
4. Add `mr-1` class to icons for consistent spacing
5. Wrap buttons in a `flex gap-2` container
6. Edit button comes before Delete button

**Applies to:** UserManagement, CategoryManagement, ItemManagement, and any future admin tables

---

## Common Commands

```bash
# Backend
cd backend
deno task dev          # Run dev server
deno task test         # Run tests
deno task migrate      # Run migrations

# Frontend
cd frontend
npm run dev            # Run dev server
npm test               # Run tests
npm run build          # Build for production
```

---

## Key Features

### 1. Excel Import (Admin)
- Upload Excel with item data
- Dynamic category creation
- Image filename matching

### 2. Configurator
- Upload floorplans (JPG/PNG)
- Drag & drop items
- Resize items (syncs same-type items)
- Live summary panel

### 3. Proposal Generation
- Aggregate placements
- Excel export
- Dynamic floor columns
- Grand total

---

## Security Checklist

- [ ] Input validation on all endpoints
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Auth on protected routes
- [ ] Authorization checks
- [ ] File upload restrictions
- [ ] Path traversal prevention
- [ ] JWT expiration

---

## Performance

- Database indexes on foreign keys
- Lazy load images
- Debounce search inputs
- Paginate large lists
- Optimize React re-renders

---

## Workflow

1. Start with backend (API first)
2. Write tests for endpoints
3. Build frontend
4. Test integration
5. Refactor & polish

---

## Troubleshooting

**Deno permissions:**
```bash
deno run --allow-all main.ts
```

**SQLite locked:**
- Close database browser
- Check hanging connections

**CORS errors:**
- Verify backend CORS middleware
- Check frontend API URL

---

## Resources

- **Hono:** https://hono.dev
- **Deno:** https://docs.deno.com
- **Flowbite React:** https://flowbite-react.com
- **@dnd-kit:** https://dndkit.com

---

Last Updated: 2026-02-12

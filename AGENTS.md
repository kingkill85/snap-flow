# AGENTS.md - SnapFlow Coding Guidelines

## Quick Start - How to Run Both Servers

**Backend (Terminal 1):**
```bash
cd /home/michael/Projects/kingkill85/snap-flow/backend
deno run --allow-all src/main.ts
```
- Runs on: http://localhost:8000
- API root: http://localhost:8000/api
- Health check: http://localhost:8000/health
- Runs migrations automatically on startup.

**Frontend (Terminal 2):**
```bash
cd /home/michael/Projects/kingkill85/snap-flow/frontend
npm run dev
```
- Runs on: http://localhost:5173
- Hot reload enabled via Vite.

**Both at once (Terminal 1, using root `package.json`):**
```bash
cd /home/michael/Projects/kingkill85/snap-flow
npm run dev
```

**Background mode (if terminal is not available):**
```bash
# Backend
cd /home/michael/Projects/kingkill85/snap-flow/backend
nohup deno run --allow-all src/main.ts > /tmp/backend.log 2>&1 &

# Frontend
cd /home/michael/Projects/kingkill85/snap-flow/frontend
nohup npm run dev > /tmp/frontend.log 2>&1 &
```

## 🛑 CRITICAL: Never Commit to Main

**BEFORE ANY WORK:**
1. Run `git branch` to check current branch
2. If on `main`, create a feature branch:
   ```bash
   git checkout -b feature/description
   ```

**NO EXCEPTIONS:**
- ❌ Not for "small changes"
- ❌ Not for "quick fixes"
- ❌ Not for "just documentation"

**Branch naming:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

## 🧹 CRITICAL: Run Lint Before Pushing

**BEFORE PUSHING:**
1. Run lint on both frontend and backend:
   ```bash
   # Backend
   cd backend && deno lint
   
   # Frontend
   cd frontend && npm run lint
   ```

2. Fix ALL lint errors before pushing

3. Ensure tests pass:
   ```bash
   # Backend
   cd backend && deno task test
   
   # Frontend
   cd frontend && npm run test:run
   ```

**NO EXCEPTIONS:**
- ❌ Do not push with lint errors
- ❌ Do not push with failing tests

## Project Overview

**SnapFlow** - A web application for smart home automation companies to create project proposals.

**Purpose:** Upload floorplans, drag-and-drop smart home devices onto them, and generate Excel proposals.

**Key Features:**
1. **Excel Import** - Upload Excel with item data, dynamic category creation
2. **Configurator** - Upload floorplans, drag & drop items, resize items
3. **Proposal Generation** - Aggregate placements, Excel export with totals

## Build/Test/Lint Commands

### Backend (Deno)
```bash
cd backend

deno task dev              # Run dev server with hot reload
deno task start            # Run production server
deno task test             # Run all tests
deno test --allow-all tests/routes/categories_test.ts  # Single test file
deno test --allow-all --filter "should login"           # Single test by name
deno task migrate          # Run database migrations
```

### Frontend (Vite + Vitest)
```bash
cd frontend

npm run dev                # Run dev server
npm run build              # Build for production
npm run lint               # Run ESLint
npm test                   # Run tests in watch mode
npm run test:run           # Run tests once
npm test -- tests/Header.test.tsx  # Single test file
npm run test:ui            # Run tests with UI
```

### Root (Both)
```bash
npm run dev                # Run both backend and frontend
npm run dev:backend          # Backend only
npm run dev:frontend         # Frontend only
```

## Code Style Guidelines

### TypeScript Configuration
- **Strict mode**: Enabled in both frontend and backend
- **Target**: ES2022 (frontend), Deno latest (backend)
- **Module**: ESNext with bundler resolution

### Naming Conventions
- **Classes**: PascalCase (e.g., `FileStorageService`, `UserRepository`)
- **Interfaces/Types**: PascalCase (e.g., `User`, `CreateUserDTO`)
- **Functions/Variables**: camelCase (e.g., `getUserById`, `isLoading`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `ACCESS_TOKEN_KEY`)
- **Files**: Components `PascalCase.tsx`, others `camelCase.ts`

### Imports
```typescript
// Group imports: external → internal → types
import React from 'react';
import api from './api';
import type { User } from '@/types';

// Use path aliases
import { Button } from '@/components/ui/button';
import { authService } from '@/services/auth';
```

### Error Handling
```typescript
// Backend - use Deno error types
try {
  await Deno.stat(path);
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    return false;
  }
  throw error;
}

// Frontend - handle Zod validation errors
const errorData = err.response?.data?.error;
if (typeof errorData === 'object' && errorData.issues) {
  return errorData.issues.map((i: any) => i.message).join(', ');
}
```

## Testing Guidelines

### Backend Tests (Deno)

Uses in-memory SQLite database (`:memory:`) - no running server required.

```typescript
import { setupTestDatabase, clearDatabase } from '../tests/test-utils.ts';
import { testRequest, parseJSON } from '../tests/test-client.ts';

Deno.test("should create category", async () => {
  // Setup
  await setupTestDatabase();
  
  // Execute
  const response = await testRequest('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Lighting' }),
  });
  
  // Assert
  assertEquals(response.status, 201);
  const data = await parseJSON(response);
  assertEquals(data.data.name, 'Lighting');
  
  // Cleanup
  clearDatabase();
});
```

### Frontend Tests (Vitest)

**Required:** Mock authService in all tests to prevent API calls.

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Header } from './Header';

// Mock auth service
vi.mock('../src/services/auth', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    getAccessToken: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

describe('Header', () => {
  it('renders logo', () => {
    render(<Header />);
    expect(screen.getByText('SnapFlow')).toBeInTheDocument();
  });
});
```

## Repository Pattern

### Category Repository
```typescript
import { categoryRepository } from '../repositories/category.ts';

const categories = await categoryRepository.findAll();  // Sorted by sort_order
const category = await categoryRepository.findById(1);
const newCategory = await categoryRepository.create({ name: 'Lighting' });
const updated = await categoryRepository.update(1, { name: 'Smart Lighting' });
await categoryRepository.delete(1);
await categoryRepository.reorder([3, 1, 2]);  // Sets order: 3=1, 1=2, 2=3
```

### Item Repository
```typescript
import { itemRepository } from '../repositories/item.ts';

const result = await itemRepository.findAll(
  { category_id: 1, search: 'smart' },  // filter (optional)
  { page: 1, limit: 20 }                 // pagination (optional)
);
// Returns: { items: Item[], total: number, page: number, totalPages: number }

const item = await itemRepository.findById(1);
const newItem = await itemRepository.create({
  category_id: 1,
  name: 'Smart Bulb',
  price: 29.99,
  image_path: 'items/1234567890-abc123.jpg'  // optional
});
await itemRepository.update(1, { name: 'Smart Bulb Pro' });
await itemRepository.delete(1);
```

## Hono Route Ordering

**CRITICAL:** Routes are matched in order of definition. More specific routes MUST come before general ones.

**Example - CORRECT:**
```typescript
// Specific routes first
itemRoutes.get('/:id/variants/:variantId/addons', ...);
itemRoutes.post('/:id/variants/:variantId/addons', ...);

// General route last
itemRoutes.get('/:id', ...);  // Catches everything else
```

**Wrong order causes 404s** because `/:id` catches `/items/16/variants/9/addons` as `id=16`.

## File Storage Service

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
- Filename sanitization
- Unique filename generation
- Supports: JPEG, PNG, WebP

### Upload Middleware
```typescript
import { uploadMiddleware } from '../middleware/upload.ts';

itemRoutes.post(
  '/',
  authMiddleware,
  adminMiddleware,
  uploadMiddleware('items'),  // subdirectory name
  async (c) => {
    const uploadResult = c.get('uploadResult');
    // uploadResult.success: boolean
    // uploadResult.filePath: string (if success)
  }
);
```

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

**Status Codes:**
- 200: OK
- 201: Created
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error

## UI Components Patterns

### Modal Components

**NEVER** create inline modals directly in page components. All modals should be extracted into reusable components.

```typescript
// components/common/ConfirmDeleteModal.tsx
<ConfirmDeleteModal
  title="Delete Item"
  itemName={itemToDelete?.name || ''}
  isOpen={showDeleteModal}
  onClose={() => setShowDeleteModal(false)}
  onConfirm={handleDeleteItem}
/>

// components/users/UserFormModal.tsx (unified Create/Edit)
interface UserFormModalProps {
  user: User | null;  // null = create, object = edit
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserDTO | UpdateUserDTO) => Promise<void>;
}
```

### Action Buttons in Tables

Use this consistent pattern for Edit/Delete buttons:

```tsx
<Table.Cell>
  <div className="flex gap-2">
    <Button color="light" size="xs" onClick={() => openEditModal(item)}>
      <HiPencil className="mr-1 h-4 w-4" />
      Edit
    </Button>
    <Button color="failure" size="xs" onClick={() => openDeleteModal(item)}>
      <HiTrash className="mr-1 h-4 w-4" />
      Delete
    </Button>
  </div>
</Table.Cell>
```

**Rules:**
1. Always include both icon AND text label
2. Use `color="light"` for Edit, `color="failure"` for Delete
3. Use `size="xs"` for table action buttons
4. Add `mr-1` class to icons for spacing
5. Wrap in `flex gap-2` container
6. Edit button comes before Delete button

### UI Terminology Mapping

The frontend uses user-friendly terms that map to backend/code terminology:

| UI Term | Code/Backend Term |
|---------|------------------|
| **Products** | `items` (Item, ItemVariant) |
| **Styles** | `variants` (ItemVariant) |
| **Catalog** | `items` (with variants) |

**Example:** When users see "Product Management", the code uses `itemService`, `Item` type, and `/items` API endpoints. When users see "Styles", the code uses `ItemVariant` type and variant-related functions.

### Modal Button Consistency

All modal action buttons must follow this pattern for consistency:

**Button Labels:**
- Create mode: "Create"
- Edit mode: "Update"
- Cancel: "Cancel"
- Delete: "Delete"

**Icons (mr-2 h-4 w-4):**
- Create: `Plus` or `FolderPlus` icon
- Update: `Save` icon  
- Cancel: `X` icon
- Delete: `Trash2` icon

**Example:**
```tsx
<DialogFooter>
  <Button type="button" variant="outline" onClick={onClose}>
    <X className="mr-2 h-4 w-4" />
    Cancel
  </Button>
  <Button type="submit" disabled={isLoading}>
    {isLoading ? (
      'Saving...'
    ) : isEdit ? (
      <>
        <Save className="mr-2 h-4 w-4" />
        Update
      </>
    ) : (
      <>
        <Plus className="mr-2 h-4 w-4" />
        Create
      </>
    )}
  </Button>
</DialogFooter>
```

**Modal Titles:**
- Create: "Create {Entity}"
- Edit: "Edit {Entity}"
- Examples: "Create Product", "Edit Style", "Create User"

## Project Structure

```
snap-flow/
├── backend/
│   ├── src/
│   │   ├── config/       # Environment, database
│   │   ├── middleware/   # Auth, validation
│   │   ├── models/       # TypeScript interfaces
│   │   ├── repositories/ # Database access
│   │   ├── routes/       # API routes
│   │   └── services/     # Business logic
│   └── tests/
└── frontend/
    └── src/
        ├── components/   # UI components
        ├── hooks/        # Custom React hooks
        ├── pages/        # Route components
        ├── services/     # API calls
        └── types/        # TypeScript types
```

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

## Environment Variables

Backend `.env`:
```
JWT_SECRET=your-secret-key-minimum-32-characters  # REQUIRED
PORT=8000
DATABASE_URL=./data/database.sqlite
CORS_ORIGIN=http://localhost:5173
```

Frontend `.env`:
```
VITE_API_URL=http://localhost:8000
```

## Key Technologies

- **Backend**: Deno, Hono, SQLite, JWT
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- **Testing**: Deno.test (backend), Vitest + React Testing Library (frontend)
- **Drag & Drop**: @dnd-kit

Last Updated: 2026-02-26

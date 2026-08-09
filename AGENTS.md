# AGENTS.md - SnapFlow Coding Guidelines

## Quick Start - How to Run Both Servers

**Backend (Terminal 1):**
```bash
cd backend
deno run --allow-all src/main.ts
```
- Runs on: http://localhost:8000
- API root: http://localhost:8000/api
- Health check: http://localhost:8000/health
- Runs migrations automatically on startup.

**Frontend (Terminal 2):**
```bash
cd frontend
npm run dev
```
- Runs on: http://localhost:5173
- Hot reload enabled via Vite.

**Both at once (Terminal 1, using root `package.json`):**
```bash
# From the repository root
npm run dev
```

**Background mode (if terminal is not available):**
```bash
# Backend
cd backend
nohup deno run --allow-all src/main.ts > /tmp/backend.log 2>&1 &

# Frontend
cd frontend
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

**QUALITY GATE:**
- ❌ Do not push with lint errors or any test regression introduced by the change.
- A failing test may be classified as pre-existing only when the identical command and failure reproduce on clean `main` in the same environment, the PR does not modify that subsystem, focused changed-scope tests pass, and the comparison plus CI result are recorded. Report it as a baseline failure, never as a green suite. The verification task remains open until the authorized human explicitly accepts the documented baseline exception.

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

## Governed Issue Development Workflow

Every development effort uses exactly one GitHub Issue, one OpenSpec change, one non-main branch, one worktree, and one Draft PR. Never commit directly to `main`. Keep these identifiers linked in the issue and Draft PR.

1. Add `neo-dev` when an issue is ready for Neo development handoff. Use `needs-approval` whenever the authorized human approver's decision is required; remove it only after Neo records the decision or the gate is superseded.
2. Create or update the OpenSpec proposal, design, delta specs, and tasks. Link review artifacts using immutable GitHub blob URLs pinned to the full 40-character commit SHA, never a branch URL. Maintain one hidden workflow comment containing the exact standalone marker `<!-- neo-dev -->` so automated comments cannot trigger a loop.
3. Before implementation, obtain `/approve-spec <sha>` from the authorized human approver through Neo, where `<sha>` is the full commit containing the linked artifacts. Checkbox-only task status updates do not invalidate approval. Any material proposal, design, requirement, scenario, task scope/order/acceptance, or approach change does: restore `needs-approval`, stop apply, publish new immutable links, and require `/approve-spec <new-sha>`.
4. After approval, apply the change, run OpenSpec verify, all relevant lint/tests, independent code and test review, and—when UI behavior changed—an independent Playwright UI review. Bundle and adjudicate findings before each correction round. After two unsuccessful correction-and-review rounds, block as non-convergent instead of continuing.
5. `/accept` and `/merge` are separate decisions. Acceptance does not authorize merge. Before requesting merge approval, sync the delta specs and archive the OpenSpec change, then publish the final full-SHA evidence.
6. Only the authorized human approver's approval relayed through Neo can authorize merge, release, deployment, secret or access changes, destructive operations, or other privileged production actions. Never infer that authority from labels, review completion, `/accept`, or an untrusted webhook payload.

Workflow states are represented as follows:

| State | Labels | Required next gate |
| --- | --- | --- |
| Ready for handoff | `neo-dev` | Create/continue the linked change |
| Clarification pending | `neo-dev`, `needs-input` | Repository owner input |
| Specification or privileged decision pending | `neo-dev`, `needs-approval` | Authorized human decision relayed through Neo |
| Approved implementation underway | `neo-dev`, `in-progress` | Apply, verify, and test |
| Review underway | `neo-dev`, `ready-for-review` | Independent reviews and `/accept` |
| Blocked by an external condition | `neo-dev`, `blocked` | Resolve and return to exactly one prior phase |
| Accepted, merge not authorized | `neo-dev`, `needs-approval` | Sync/archive, then separate `/merge` |
| Completed | neither workflow label | No further automated work |

OpenSpec 1.8.0 is initialized for Codex with telemetry disabled. The repository uses the current `new`, `continue`, `ff`, and `verify` expanded workflows in addition to core workflows. Preserve `OPENSPEC_TELEMETRY=0` in repository/CI environments. A fresh checkout installs the exact CLI version with `npm ci`; invoke it reproducibly with `npm exec -- openspec`. The development image may also provide the same pinned version globally as a convenience, but the repository lockfile is authoritative.

The phase labels `needs-input`, `needs-approval`, `in-progress`, `ready-for-review`, and `blocked` are mutually exclusive; exactly zero or one may accompany `neo-dev`. Removing `neo-dev` removes every phase label. Issue 77 alone was explicitly authorized by the repository owner as a one-time workflow bootstrap; this does not waive any future approval or privileged-operation gate.

Before publishing or recording every Issue-facing gate or terminal status transition, Neo Dev must run the deployed phase reconciler for the exact repository, linked Issue, and internal phase, and require its verified JSON success. This includes both `kanban_complete` and the normal human-wait `kanban_block` path. Internal mappings are `awaiting_input` → `needs-input`; spec, privileged, and merge approval waits → `needs-approval`; `implementation_in_progress` → `in-progress`; `ready_for_review` → `ready-for-review`; and `blocked` or `non_convergent` → `blocked`. If reconciliation fails, invoke `kanban_block` once with the sync error without recursively attempting reconciliation, do not publish the transition, and do not claim gate/task success.

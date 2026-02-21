# AGENTS.md - Project Context for AI Assistants

## 🛑 STOP - FEATURE BRANCH CHECK REQUIRED 🛑

### BEFORE ANY EDIT OR COMMAND:

**STEP 1:** Run `git branch`  
**STEP 2:** If you see `* main` → **STOP AND CREATE BRANCH FIRST**  
```bash
git checkout -b feature/description
```
**STEP 3:** Only then start working

### ⚠️ THIS IS THE #1 RULE - NEVER COMMIT TO MAIN ⚠️

**NO EXCEPTIONS:**
- ❌ Not for "small changes"
- ❌ Not for "quick fixes"  
- ❌ Not for "just documentation"
- ❌ NEVER EVER

**Branch naming:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Refactoring
- `docs/description` - Documentation

---

## 🔴 REMINDER FOR AI: CHECK BRANCH STATUS NOW 🔴

**Current branch must NOT be `main` before proceeding.**

---

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
- **Auth:** JWT with refresh tokens (djwt library)
- **Excel:** xlsx library (server-side)
- **Testing:** Deno.test (with in-memory database)
- **Rate Limiting:** In-memory with configurable limits

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

// Using the centralized API instance
import api from './api';

export const userService = {
  async getAll(signal?: AbortSignal) {
    const response = await api.get('/users', { signal });
    return response.data.data;
  },
  
  async create(data: CreateUserDTO, signal?: AbortSignal) {
    const response = await api.post('/users', data, { signal });
    return response.data.data;
  },
};

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

## Backend Test Infrastructure

### Test Database Setup
Tests use an **in-memory SQLite database** (`:memory:`) that runs independently of the production database.

**Setup (`tests/test-utils.ts`):**
```typescript
import { setupTestDatabase, clearDatabase } from './test-utils.ts';

// Initialize in-memory database with migrations
await setupTestDatabase();

// Clear data between tests
clearDatabase();
```

### Test Client Pattern
Routes are tested using `app.fetch()` directly without running a server:

**Example (`tests/test-client.ts`):**
```typescript
import { testRequest, parseJSON } from './test-client.ts';

const response = await testRequest('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});

const data = await parseJSON(response);
assertEquals(response.status, 200);
```

**Benefits:**
- No running server required for tests
- Faster test execution
- Tests run in isolation with in-memory database
- Proper test isolation with database clearing between tests

**Running Backend Tests:**
```bash
cd backend
# No server needed! Tests run standalone
deno test --allow-all tests/
```

---

## Frontend Test Patterns

### Mocking authService
All tests must mock the `authService` to prevent actual API calls:

```typescript
// Mock the auth service
vi.mock('../src/services/auth', () => ({
  authService: {
    login: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    getCurrentUser: vi.fn(),
    getAccessToken: vi.fn(),
    getRefreshToken: vi.fn(),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
    refreshAccessToken: vi.fn(),
    updateProfile: vi.fn(),
  },
}));
```

### Error Handling for Zod Validation
Backend returns Zod validation errors as objects. Handle them properly:

```typescript
const errorData = err.response?.data?.error;
let errorMessage: string;
if (typeof errorData === 'object' && errorData !== null) {
  if (errorData.issues && Array.isArray(errorData.issues)) {
    errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
  } else {
    errorMessage = JSON.stringify(errorData);
  }
} else {
  errorMessage = errorData || 'Default error message';
}
```

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

## Authentication (JWT with Refresh Tokens)

The application uses JWT with refresh tokens for secure authentication:

- **Access tokens**: Short-lived (15 minutes), automatically refreshed
- **Refresh tokens**: Long-lived (7 days), stored securely in database
- **Rate limiting**: 10 login attempts per 5 minutes, 10 refresh attempts per minute

### Authentication Endpoints
```
POST /auth/login          - Authenticate, returns access + refresh tokens
POST /auth/logout         - Invalidate all refresh tokens for user
POST /auth/logout-all     - Invalidate all tokens across all devices
POST /auth/refresh        - Get new access token using refresh token
GET  /auth/me             - Get current user info
```

### Token Storage (Frontend)
```typescript
// Access token: localStorage key 'accessToken' (15 min expiry)
// Refresh token: localStorage key 'refreshToken' (7 days expiry)
```

### Environment Variables
```bash
# JWT_SECRET is REQUIRED - no default value
# Generate with: openssl rand -base64 32
JWT_SECRET=your-secret-key-minimum-32-characters
```

---

## Rate Limiting

In-memory rate limiting middleware protects auth endpoints:

```typescript
// Login: 10 attempts per 5 minutes
loginRateLimit()

// Refresh: 10 attempts per minute
refreshRateLimit()

// Custom limits
rateLimit(maxRequests, windowMs, key)
```

**Clear rate limits (for tests):**
```typescript
import { clearRateLimitStore } from '../src/middleware/rate-limit.ts';
clearRateLimitStore();
```

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

## Hono Route Ordering

**CRITICAL:** Routes in Hono are matched in order of definition. More specific routes MUST come before general ones.

**Example - CORRECT:**
```typescript
// Specific routes first
itemRoutes.get('/:id/variants/:variantId/addons', ...);
itemRoutes.post('/:id/variants/:variantId/addons', ...);

// General route last
itemRoutes.get('/:id', ...);  // Catches everything else
```

**Wrong order causes 404s** because `/:id` catches `/items/16/variants/9/addons` as `id=16`.

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
- Item → ItemVariants (1:N, CASCADE delete)
- ItemVariant → VariantAddons (1:N, CASCADE delete)

### Cascade Delete Behavior
When you delete an item, all related data is automatically cleaned up:
1. ItemVariants are deleted (CASCADE)
2. VariantAddons are deleted (CASCADE)
3. ItemAddons are deleted (explicit cleanup in repository)
4. The item itself is deleted

This prevents orphaned records in the database.

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

**Required Variables:**
```bash
PORT=8000
DATABASE_URL=./data/database.sqlite
JWT_SECRET=your-secret-key-minimum-32-characters  # REQUIRED - No default!
UPLOAD_DIR=./uploads
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

**JWT_SECRET Setup:**
The `JWT_SECRET` is required and has no default value. The server will fail to start without it.

Generate a secure secret:
```bash
# Using OpenSSL (recommended)
openssl rand -base64 32

# Output example: 7f8a9b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

**Token Configuration (code-level):**
- Access tokens expire in 15 minutes (auto-refreshed by frontend)
- Refresh tokens expire in 7 days (users must re-login after this)
- Refresh tokens are stored as SHA-256 hashes in the database

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

# Run all tests (NO server needed!)
deno test --allow-all tests/

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

**Note:** Backend tests use an in-memory database and test client pattern - no running server required!

### Coverage Goals
- Backend: >80%
- Frontend: >80%
- Critical paths: 100%

---

## Frontend Page Structure

Current route and file organization:

```
frontend/src/pages/
├── Home.tsx                    → /
├── Login.tsx                   → /login
├── Profile.tsx                 → /profile
├── catalog/
│   ├── ItemManagement.tsx      → /catalog/items
│   └── CategoryManagement.tsx  → /catalog/categories
├── settings/
│   └── UserManagement.tsx      → /settings/users
└── NotFound.tsx               → /* (404)
```

**Navigation Groups:**
- **Projects** ▼ → Projects, Customers
- **Catalog** ▼ (admin only) → Items, Categories
- **Settings** ▼ (admin only) → User Management

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

## Modal Components Pattern

**NEVER** create inline modals directly in page components. All modals should be extracted into reusable components.

### Modal Component Structure

```
frontend/src/components/
├── common/
│   └── ConfirmDeleteModal.tsx    # Reusable delete confirmation
├── users/
│   └── UserFormModal.tsx         # Create/Edit user form
├── categories/
│   └── CategoryFormModal.tsx     # Create/Edit category form
└── items/
    ├── ItemFormModal.tsx         # Create/Edit item form
    ├── VariantFormModal.tsx      # Create/Edit variant form
    └── DeleteVariantModal.tsx    # Variant-specific delete
```

### Common Reusable Components

**ConfirmDeleteModal** - Use for ALL delete confirmations:
```typescript
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';

<ConfirmDeleteModal
  title="Delete Item"
  itemName={itemToDelete?.name || ''}
  warningText="Optional warning message"
  isOpen={showDeleteModal}
  onClose={() => {
    setShowDeleteModal(false);
    setItemToDelete(null);
  }}
  onConfirm={handleDeleteItem}
/>
```

### Form Modal Pattern

Create unified Create/Edit modals (single component handles both):

```typescript
interface UserFormModalProps {
  user: User | null;  // null = create mode, object = edit mode
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateUserDTO | UpdateUserDTO) => Promise<void>;
}

export function UserFormModal({ user, isOpen, onClose, onSubmit }: UserFormModalProps) {
  const isEdit = !!user;
  // Component handles both create and edit modes
}
```

### Page Implementation

Pages should import and use modal components, never define them inline:

```typescript
// GOOD: Uses imported modal components
import { UserFormModal } from '../../components/users/UserFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';

const UserManagement = () => {
  const [showFormModal, setShowFormModal] = useState(false);
  const [userToEdit, setUserToEdit] = useState<User | null>(null);
  
  const handleSubmit = async (data: CreateUserDTO | UpdateUserDTO) => {
    if (userToEdit) {
      await userService.update(userToEdit.id, data as UpdateUserDTO);
    } else {
      await userService.create(data as CreateUserDTO);
    }
    fetchUsers();
  };

  return (
    <>
      <UserFormModal
        user={userToEdit}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setUserToEdit(null);
        }}
        onSubmit={handleSubmit}
      />
      <ConfirmDeleteModal ... />
    </>
  );
};

// BAD: Inline modal code in the page component
<Modal show={showCreateModal}>
  <Modal.Header>Create User</Modal.Header>
  {/* ... lots of inline JSX ... */}
</Modal>
```

### Rules
1. **NO inline modals** in page components - always extract to `src/components/`
2. **Single unified modal** for Create/Edit operations (use `item: Item | null` pattern)
3. **Use ConfirmDeleteModal** for all delete confirmations
4. **Place domain-specific modals** in feature folders (e.g., `components/users/`, `components/categories/`)
5. **Place common modals** in `components/common/`
6. **Keep pages lean** - pages should orchestrate, components should implement

---

## Docker Deployment

### GitHub Actions CI/CD (Recommended)

The project includes an automated GitHub Actions workflow that builds and publishes Docker images automatically on every push to main.

**Setup:**
1. Create Personal Access Token at https://github.com/settings/tokens/new
   - Select scopes: `write:packages`, `read:packages`
2. Add to repository secrets: https://github.com/kingkill85/snap-flow/settings/secrets/actions
   - Name: `CR_PAT`
   - Value: your token
3. Enable workflow permissions:
   - Go to Settings → Actions → General → Workflow permissions
   - Select "Read and write permissions"

**Automatic Builds:**
- Triggered on every push to `main` branch
- Triggered on version tags (e.g., `v1.0.0`)
- Generates multiple tags:
  - `ghcr.io/kingkill85/snap-flow:latest` - Always latest stable
  - `ghcr.io/kingkill85/snap-flow:main` - Main branch builds
  - `ghcr.io/kingkill85/snap-flow:v1.0.0` - Semantic version tags
  - `ghcr.io/kingkill85/snap-flow:sha-{hash}` - Specific commit
- View builds: https://github.com/kingkill85/snap-flow/actions

**JWT_SECRET:** Auto-generated during build, baked into image

### Manual Build (Fallback)

If you need to build locally or the automated build fails:

**Build locally:**
```bash
# Build the Docker image
docker build -t ghcr.io/kingkill85/snap-flow:latest .
```

**Build and push to GitHub Container Registry:**
```bash
# 1. Login to GitHub Container Registry (first time only)
docker login ghcr.io -u kingkill85
# Enter your GitHub Personal Access Token when prompted

# 2. Build the image
docker build -t ghcr.io/kingkill85/snap-flow:latest .

# 3. Push to registry
docker push ghcr.io/kingkill85/snap-flow:latest
```

### Automated Build Script

Use the provided `deploy.sh` script to automate the entire process:

```bash
# Make executable
chmod +x deploy.sh

# Run deployment (builds, commits, and pushes)
./deploy.sh
```

This script will:
1. Check prerequisites (Docker, npm, git)
2. Generate JWT_SECRET automatically
3. Build frontend production bundle
4. Build Docker image
5. Push to GitHub Container Registry
6. Commit and push code changes

### Running with Docker

**Using Docker Compose (recommended):**
```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Update to latest image
docker-compose pull && docker-compose up -d
```

**Using Docker Run:**
```bash
docker run -d \
  --name snapflow \
  -p 8000:8000 \
  -v snapflow_data:/app/backend/data \
  -v snapflow_uploads:/app/backend/uploads \
  ghcr.io/kingkill85/snap-flow:latest
```

### Docker Configuration

**Image:** `ghcr.io/kingkill85/snap-flow:latest`

**Ports:**
- `8000` - Main application port (HTTP)

**Volumes:**
- `snapflow_data` - SQLite database persistence
- `snapflow_uploads` - File uploads persistence

**Environment Variables:**
- `JWT_SECRET` - Auto-generated if not provided
- `PORT` - Server port (default: 8000)
- `NODE_ENV` - Environment mode (production)
- `CORS_ORIGIN` - Allowed origins (* for all, or specific URL)

### First Run

On first run, an admin user is automatically created:
- **Email:** `admin@snapflow.com`
- **Password:** Check container logs: `docker-compose logs | grep "Password:"`

**Important:** Change the password immediately after first login!

### Common Docker Issues

**Container restarts continuously:**
- Check logs: `docker-compose logs`
- Usually caused by seed script calling `Deno.exit(0)` - this is now fixed

**CORS errors:**
- Set `CORS_ORIGIN=*` in docker-compose.yml for local network access
- Or set to your specific origin: `CORS_ORIGIN=http://192.168.1.100:8010`

**Can't login:**
- API URL is set to `/api` (relative), works with Docker's single-origin setup
- Check browser console for CORS errors
- Verify `CORS_ORIGIN` includes your frontend URL

### Development vs Production URLs

**Development (Vite):**
- Frontend: `http://localhost:5173`
- API: `http://localhost:8000/api` (via Vite proxy)

**Production (Docker):**
- Everything on: `http://localhost:8000`
- API: `http://localhost:8000/api` (same origin)

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

### Development Process
1. Start with backend (API first)
2. Write tests for endpoints
3. Build frontend
4. Test integration
5. Refactor & polish

### Git Workflow - Feature Branches (MANDATORY)

**ALWAYS work on feature branches - even for small changes!**

Never commit directly to `main`. If you're not on a feature branch, create one first.

**Before starting work:**
```bash
# Check current branch
git branch

# If on main, create feature branch
git checkout -b feature/short-description

# Examples:
git checkout -b feature/configurator-canvas
git checkout -b feature/fix-login-error
git checkout -b feature/add-search-filter
```

**Branch naming:**
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

**Completing work:**
```bash
# Commit changes
git add .
git commit -m "feat: description of changes"

# Merge to main
git checkout main
git merge feature/branch-name
git push origin main

# Cleanup
git branch -d feature/branch-name
git push origin --delete feature/branch-name
```

**Why feature branches:**
- Keeps `main` always deployable
- Easy rollback if issues arise
- Clean, organized commit history
- Can work on multiple things simultaneously
- Better for CI/CD (GitHub Actions runs on push)

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

Last Updated: 2026-02-15

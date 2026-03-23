# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SnapFlow is a smart home automation proposal generator. Users upload floorplan images, drag-and-drop smart home devices onto them, manage product catalogs (with Excel import), and generate proposals with itemized pricing.

**Stack:** Deno + Hono + SQLite (backend) | React 18 + Vite + TypeScript + Tailwind + shadcn/ui (frontend)

## Commands

### Development
```bash
npm run dev                # Run both backend and frontend concurrently
npm run dev:backend        # Backend only (Deno, port 8000)
npm run dev:frontend       # Frontend only (Vite, port 5173)
```

### Backend (from `backend/`)
```bash
deno task dev              # Dev server with hot reload
deno task test             # Run all backend tests
deno test --allow-all tests/routes/categories_test.ts  # Single test file
deno test --allow-all --filter "should login"           # Single test by name
deno lint                  # Lint backend
deno task migrate          # Run database migrations
```

### Frontend (from `frontend/`)
```bash
npm run dev                # Dev server
npm run build              # Production build (tsc + vite)
npm run lint               # ESLint
npm run test:run           # Run all tests once
npm test -- tests/Header.test.tsx  # Single test file
```

### Pre-push checklist
Always run `deno lint` (backend) and `npm run lint` (frontend) plus both test suites before pushing. Never commit directly to main — use feature branches (`feature/*`, `fix/*`, `refactor/*`, `docs/*`).

## Architecture

### Backend (Deno + Hono)
- **Entry:** `backend/src/main.ts` — Hono app setup, middleware chain, route mounting
- **Repository pattern:** `backend/src/repositories/` — each entity has a repository extending a base CRUD class. All use `getDb()` which returns in-memory SQLite for tests or the production DB
- **Middleware chain:** CORS → logger → `authMiddleware` (JWT verify, sets userId/userEmail/userRole in Hono context) → optional `adminMiddleware` → optional `uploadMiddleware`
- **Route ordering matters:** Hono matches routes in definition order. Specific routes (e.g., `/:id/variants/:variantId/addons`) must come before general ones (`/:id`) or you get 404s
- **Tests:** Use in-memory SQLite — no running server needed. Setup with `setupTestDatabase()` / `clearDatabase()` from `tests/test-utils.ts`

### Frontend (React + Vite)
- **Routing:** React Router 6 in `App.tsx`. Admin routes protected by `ProtectedRoute` component
- **State:** React Context API (`AuthContext`, `ThemeContext`, `SyncContext`) — no Redux
- **API layer:** `frontend/src/services/api.ts` — Axios instance with auth interceptor that auto-refreshes expired JWT tokens
- **Path alias:** `@/` maps to `src/` (configured in Vite + tsconfig)
- **UI components:** shadcn/ui + Radix UI in `components/ui/`, app components alongside feature directories
- **Custom hooks:** `useProjectData`, `useBomCalculations`, `usePlacements`, `useDragHandlers` — these compose the configurator page logic

### Key Domain Concepts
- **Items** = products in UI, **Variants** = styles in UI, **Catalog** = items + variants
- **BOM (Bill of Materials):** Entries store frozen snapshots of item data (name, price, image at placement time) plus references back to catalog for "Update from Catalog" feature
- **Placements** reference BOM entries (not variants directly) and store canvas coordinates (0,0 = top-left)
- **Projects** embed customer data directly (no separate customers table)

### API Response Format
```
Success: { "data": { ... }, "message": "Optional" }
Error:   { "error": "Message", "details": { ... } }
```

### Frontend Testing
Always mock `authService` in frontend tests to prevent API calls:
```typescript
vi.mock('../src/services/auth', () => ({
  authService: { getCurrentUser: vi.fn(), getAccessToken: vi.fn(), clearTokens: vi.fn() },
}));
```

## UI Patterns

- Modals must be extracted into separate components (never inline in pages)
- Modal pattern: `user: User | null` prop — null = create mode, object = edit mode
- Button labels: "Create" / "Update" / "Cancel" / "Delete"
- Table action buttons: Edit (`color="light"`) before Delete (`color="failure"`), both `size="xs"` with icon + text label

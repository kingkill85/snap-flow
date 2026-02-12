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
const ItemCard: React.FC<ItemCardProps> = ({ item }) => { }

export const itemService = {
  getAll: () => api.get('/items'),
}
```

### File Naming
- Components: `PascalCase.tsx`
- Hooks: `camelCase.ts` with `use` prefix
- Services: `camelCase.ts`

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

### Coverage Goals
- Backend: >80%
- Frontend: >80%
- Critical paths: 100%

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

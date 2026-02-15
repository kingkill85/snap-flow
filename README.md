# SnapFlow

> Smart Home Automation Configurator & Proposal Generator

A web application for smart home automation companies to create professional project proposals. Upload floorplans, drag-and-drop devices, and generate Excel proposals with itemized lists and pricing.

![Version](https://img.shields.io/badge/version-0.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## Features

- 📊 **Excel Import** - Import product catalogs via Excel with automatic category creation
- 🏠 **Floorplan Configurator** - Upload floorplan images and place devices with drag-and-drop
- 📐 **Smart Sizing** - Resize devices visually, automatically syncing all instances of the same item type
- 📋 **Live Summary** - Real-time quantity tracking and price calculation
- 📄 **Proposal Generation** - Export professional Excel proposals with dynamic floor columns
- 👥 **Customer Management** - Organize projects by customer with full CRUD operations
- 🔐 **Role-Based Access** - Admin and user roles with appropriate permissions

## Tech Stack

### Backend
- **Runtime:** Deno 1.40+
- **Framework:** Hono
- **Database:** SQLite with custom Repository pattern
- **Authentication:** JWT (djwt)
- **Excel Processing:** xlsx

### Frontend
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **UI Library:** Flowbite React + Tailwind CSS
- **Drag & Drop:** @dnd-kit
- **HTTP Client:** Axios
- **Routing:** React Router

## Quick Start

### Prerequisites

- [Deno](https://deno.land/manual/getting_started/installation) 1.40+
- [Node.js](https://nodejs.org/) 18+
- Git
- OpenSSL (for generating JWT_SECRET)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/kingkill85/snap-flow.git
   cd snap-flow
   ```

2. **Install dependencies**
   ```bash
   # Install concurrently (for running both servers)
   npm install
   
   # Install frontend dependencies
   cd frontend && npm install && cd ..
   ```

3. **Set up environment**
   ```bash
   # Backend
   cp backend/.env.example backend/.env
   
   # IMPORTANT: Generate a secure JWT_SECRET (minimum 32 characters)
   # Using OpenSSL:
   openssl rand -base64 32
   
   # Or generate one online at https://jwtsecret.com/generate
   # Then edit backend/.env and set JWT_SECRET to your generated value
   
   # Frontend
   cp frontend/.env.example frontend/.env
   # Edit frontend/.env if your backend runs on a different port
   ```

4. **Database migrations (automatic)**
   
   Migrations run automatically when the server starts. No manual action needed!
   
   To run migrations manually:
   ```bash
   cd backend && deno run --allow-all src/scripts/migrate.ts && cd ..
   ```

### Running the Application

**Start both backend and frontend with one command:**

```bash
npm run dev
```

This will start:
- 🔵 **Backend:** http://localhost:8000
- 🟢 **Frontend:** http://localhost:5173

Both servers support hot reload for development.

**Or run individually:**

```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

## Docker Deployment

### Quick Deploy with Script

Deploy everything in one command:

```bash
# Make script executable
chmod +x deploy.sh

# Run deployment (builds frontend, creates Docker image, pushes to GitHub)
./deploy.sh
```

This script will:
1. ✅ Check prerequisites (Docker, npm, git)
2. 🔐 Generate JWT_SECRET automatically
3. 📦 Build frontend production bundle
4. 🐳 Build Docker image
5. ☁️ Push to GitHub Container Registry
6. 📤 Commit and push code changes

### Manual Docker Build

```bash
# Build frontend
cd frontend && npm run build && cd ..

# Generate JWT secret
export JWT_SECRET=$(openssl rand -base64 32)

# Build Docker image
docker build -t ghcr.io/kingkill85/snap-flow:latest .

# Push to registry
docker push ghcr.io/kingkill85/snap-flow:latest
```

### Running with Docker Compose

```bash
# Start the application
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the application
docker-compose down

# Stop and remove volumes (WARNING: deletes all data)
docker-compose down -v
```

### Running Standalone Container

```bash
# Pull and run
docker run -d \
  --name snapflow \
  -p 8000:8000 \
  -v snapflow_data:/app/backend/data \
  -v snapflow_uploads:/app/backend/uploads \
  -e JWT_SECRET=$(openssl rand -base64 32) \
  ghcr.io/kingkill85/snap-flow:latest

# View logs
docker logs -f snapflow
```

### Data Persistence

The Docker setup uses named volumes for data persistence:

- **snapflow_data** - SQLite database (`/app/backend/data`)
- **snapflow_uploads** - Uploaded files (`/app/backend/uploads`)

Data persists even when the container is stopped or removed.

### Accessing the Application

After deployment:
- **Web App:** http://localhost:8000
- **API:** http://localhost:8000/api
- **Health Check:** http://localhost:8000/health

### Default Admin User

On first run, the application automatically creates a default admin user:
- **Email:** `admin@snapflow.com`
- **Password:** Check the Docker logs (`docker-compose logs`) for the auto-generated password

**⚠️ Security Note:** Change the default admin password immediately after first login!

## Project Structure

```
snap-flow/
├── backend/                    # Deno backend
│   ├── src/
│   │   ├── config/            # Database, env config
│   │   ├── middleware/        # Auth, error handling, upload
│   │   ├── models/            # TypeScript interfaces
│   │   ├── repositories/      # Database access layer (Repository pattern)
│   │   ├── routes/            # API endpoints
│   │   ├── scripts/           # Migration runner
│   │   └── main.ts            # Entry point
│   ├── tests/                 # Unit tests
│   ├── migrations/            # SQL schema migrations
│   └── deno.json             # Deno config & dependencies
│
├── frontend/                   # React frontend
│   ├── src/
│   │   ├── components/        # React components
│   │   ├── context/           # React contexts (auth, etc.)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── pages/             # Page components
│   │   ├── services/          # API client functions
│   │   └── types/             # TypeScript types
│   ├── tests/                 # Unit tests
│   └── package.json
│
├── IMPLEMENTATION_PLAN.md     # Detailed roadmap & todos
├── AGENTS.md                  # Development context for AI assistants
└── README.md                  # This file
```

## Frontend Routes

### Page Structure
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

### Navigation Groups
- **Projects** ▼ → Projects, Customers
- **Catalog** ▼ (admin only) → Items, Categories
- **Settings** ▼ (admin only) → User Management

## API Endpoints

### Authentication

The application uses JWT with refresh tokens for secure authentication:

- **Access tokens**: Short-lived (15 minutes), automatically refreshed
- **Refresh tokens**: Long-lived (7 days), stored securely in database
- **Rate limiting**: 10 login attempts per 5 minutes, 10 refresh attempts per minute

**Authentication Endpoints:**
- `POST /auth/login` - Authenticate user, returns access token + refresh token
- `POST /auth/logout` - Invalidate all refresh tokens for user
- `POST /auth/logout-all` - Invalidate all tokens across all devices
- `POST /auth/refresh` - Get new access token using refresh token
- `GET /auth/me` - Get current user info

### Users (Admin)
- `POST /users` - Create new user
- `GET /users` - List all users
- `DELETE /users/:id` - Delete user

### Categories
- `POST /categories` - Create category (Admin)
- `GET /categories` - List all categories
- `PUT /categories/:id` - Update category (Admin)
- `DELETE /categories/:id` - Delete category (Admin)

### Items
- `POST /items` - Create item with image (Admin)
- `GET /items` - List items (with search/filter)
- `GET /items/:id` - Get single item
- `PUT /items/:id` - Update item (Admin)
- `DELETE /items/:id` - Delete item (Admin)
- `POST /items/import` - Import from Excel (Admin)

### Customers
- `POST /customers` - Create customer
- `GET /customers` - List customers
- `GET /customers/:id` - Get customer details
- `PUT /customers/:id` - Update customer
- `DELETE /customers/:id` - Delete customer

### Projects
- `POST /projects` - Create project
- `GET /projects` - List projects
- `GET /projects/:id` - Get project details
- `PUT /projects/:id` - Update project
- `DELETE /projects/:id` - Delete project
- `POST /projects/:id/proposal` - Generate Excel proposal

### Floorplans
- `POST /floorplans` - Upload floorplan image
- `GET /projects/:id/floorplans` - List floorplans
- `PUT /floorplans/:id` - Rename floorplan
- `DELETE /floorplans/:id` - Delete floorplan

### Placements
- `POST /placements` - Place item on floorplan
- `GET /floorplans/:id/placements` - Get all placements
- `PUT /placements/:id` - Update placement (move/resize)
- `DELETE /placements/:id` - Delete placement
- `POST /placements/bulk-update` - Update all same-type items

## Development

### Running Tests

**Backend Tests (Deno):**
```bash
cd backend

# Run all tests (NO server required! Uses in-memory database)
deno test --allow-all tests/

# Run specific test file
deno test --allow-all tests/routes/categories_test.ts

# Run with coverage
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

**VSCode Test Explorer:**
- Install extension: **"Vitest"** by vitest (for frontend tests)
- Install extension: **"Deno"** by denoland (for backend tests)
- Tests will appear in the Testing sidebar (beaker icon)
- Click play buttons to run individual tests or suites
- See test results inline in your code

**Test File Locations:**
- Backend: `backend/tests/**/*.test.ts`
- Frontend: `frontend/tests/**/*.test.tsx`

**Note:** Backend tests use an in-memory database and test client pattern - **no running server required!**

### Database Migrations

**Migrations run automatically when the server starts.** No manual intervention needed!

To run migrations manually (optional):
```bash
cd backend && deno run --allow-all src/scripts/migrate.ts
```

The migration system:
- Runs automatically on every server startup
- Tracks applied migrations in the `migrations` table
- Skips already-applied migrations
- Fails fast if a migration errors (server won't start)

### Code Style

- **Backend:** Strict TypeScript, Repository pattern, RESTful API design
- **Frontend:** Functional React components, custom hooks, Context API for state

## Security Features

- **JWT Authentication**: Short-lived access tokens (15 min) with refresh tokens (7 days)
- **Token Storage**: Refresh tokens stored as SHA-256 hashes (never raw tokens)
- **Rate Limiting**: 
  - Login: 10 attempts per 5 minutes per IP
  - Token refresh: 10 attempts per minute per IP
- **Token Revocation**: Logout invalidates all refresh tokens for the user
- **Automatic Token Refresh**: Frontend silently refreshes expired access tokens
- **Required Secrets**: JWT_SECRET must be set (no default fallback)

## Database Schema

### Core Entities

- **users** - Authentication & roles (admin/user)
- **categories** - Dynamic product categories
- **items** - Smart home products with images
- **customers** - Client information
- **projects** - Customer projects
- **floorplans** - Floorplan images per project
- **placements** - Items positioned on floorplans (x, y, width, height)

## File Storage

```
uploads/
├── items/                    # Product images
│   └── {item-name}.jpg
└── customers/
    └── {customer-id}/
        └── {project-id}/
            └── {floorplan-name}.jpg
```

## Environment Variables

### Backend (.env)

**Required Variables:**
```bash
PORT=8000
DATABASE_URL=./data/database.sqlite
JWT_SECRET=your-secret-key-minimum-32-characters  # REQUIRED - No default!
UPLOAD_DIR=./uploads
CORS_ORIGIN=http://localhost:5173
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
- Compromised tokens can be revoked via logout

### Frontend (.env)
```
VITE_API_URL=http://localhost:8000
```

## Implementation Status

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for detailed roadmap and current progress.

### Completed
- ✅ Phase 1: Project Foundation
  - Backend with Hono
  - Database with migrations
  - Frontend with Vite + React
  - Simultaneous dev server setup

### In Progress
- 🔄 Phase 2: Authentication System

## License

MIT License - see LICENSE file for details

## Support

For questions or issues, please open an issue on GitHub.

---

**Built with ❤️ using Deno, React, and Flowbite React**

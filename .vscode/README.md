# VS Code Configuration for SnapFlow

Full-stack development configuration supporting both **Frontend V2 (Shadcn)** and **Legacy Frontend**.

## Quick Start

### Run Dev Servers (Backend + Frontend V2)

**Keyboard Shortcut:**
- Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)

**Command Palette:**
1. Press `Ctrl+Shift+P`
2. Type "Run Task"
3. Select **"Run Dev (Backend + Frontend V2)"**

**This starts:**
- 🔵 Backend server on http://localhost:8000
- 🟣 Frontend V2 (Shadcn) on http://localhost:5173

## Available Tasks

### Development
| Task | Command | Description |
|------|---------|-------------|
| Run Dev (Backend + Frontend V2) | `Ctrl+Shift+B` | Start both servers |
| Run Backend Only | `Cmd+Shift+P` → Tasks | Backend on :8000 |
| Run Frontend V2 Only | `Cmd+Shift+P` → Tasks | New Shadcn frontend on :5173 |
| Run Frontend Legacy Only | `Cmd+Shift+P` → Tasks | Old Flowbite frontend on :5174 |

### Building
| Task | Description |
|------|-------------|
| Build Frontend V2 | Build the new Shadcn frontend |
| Build Frontend Legacy | Build the old Flowbite frontend |
| Install All Dependencies | Install deps for all projects |

### Testing
| Task | Description |
|------|-------------|
| Test Backend | Run Deno tests |
| Test Frontend V2 | Run Vitest tests |

## Debugging

### Debug Full Stack (Recommended)
1. Press `Ctrl+Shift+D` to open Debug panel
2. Select **"Debug Full Stack (V2 + Backend)"**
3. Press `F5`

This debugs both backend (Deno) and frontend V2 (Chrome) simultaneously.

### Debug Individual Components

**Backend (Deno):**
1. Select **"Debug Backend (Deno)"** in Debug panel
2. Press `F5`

**Frontend V2 (Chrome/Edge):**
1. Select **"Debug Frontend V2 (Chrome)"** or **"Debug Frontend V2 (Edge)"**
2. Press `F5`

**Frontend Legacy (Chrome):**
1. Select **"Debug Frontend Legacy (Chrome)"**
2. Press `F5`

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` | Run default dev task |
| `F5` | Start debugging |
| `Ctrl+Shift+D` | Open debug panel |
| `Ctrl+Shift+P` | Open command palette |
| `Ctrl+Shift+T` | Run task |

## Recommended Extensions

These extensions will be suggested when you open the project:

- **Deno** - Deno language support & debugging
- **Tailwind CSS IntelliSense** - Autocomplete for Tailwind classes
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Auto Rename Tag** - Auto-rename paired HTML/JSX tags
- **Path Intellisense** - Autocomplete file paths
- **Error Lens** - Inline error display
- **Todo Tree** - Show TODO comments in sidebar
- **GitLens** - Enhanced Git integration
- **Vite** - Vite tooling support
- **Pretty TypeScript Errors** - Better TS error messages

## Project Structure

```
snap-flow/
├── .vscode/           # This configuration
├── backend/           # Deno API server
├── frontend-v2/       # New React + Shadcn frontend
├── frontend/          # Legacy React + Flowbite frontend
└── package.json       # Root package.json with scripts
```

## Troubleshooting

**Port already in use:**
- Frontend V2 uses port 5173
- Frontend Legacy uses port 5174
- Backend uses port 8000

**Debugger not attaching:**
1. Make sure the server is running first
2. Check that ports are not blocked
3. Try restarting VS Code

**Deno not found:**
- Install Deno: `curl -fsSL https://deno.land/install.sh | sh`
- Restart VS Code after installation

## Migration Notes

We're migrating from `frontend/` (Flowbite) to `frontend-v2/` (Shadcn):
- Both frontends can run simultaneously on different ports
- Use Frontend V2 for new development
- Frontend Legacy is maintained for reference
- All debugging configs support both versions

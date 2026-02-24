# VS Code Configuration for SnapFlow

Full-stack development configuration for SnapFlow using **React + shadcn/ui** frontend.

## Quick Start

### Run Dev Servers (Backend + Frontend)

**Keyboard Shortcut:**
- Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)

**Command Palette:**
1. Press `Ctrl+Shift+P`
2. Type "Run Task"
3. Select **"Run Dev (Backend + Frontend)"**

**This starts:**
- 🔵 Backend server on http://localhost:8000
- 🟣 Frontend (shadcn/ui) on http://localhost:5173

## Available Tasks

### Development
| Task | Command | Description |
|------|---------|-------------|
| Run Dev (Backend + Frontend) | `Ctrl+Shift+B` | Start both servers |
| Run Backend Only | `Cmd+Shift+P` → Tasks | Backend on :8000 |
| Run Frontend Only | `Cmd+Shift+P` → Tasks | Frontend on :5173 |

### Building
| Task | Description |
|------|-------------|
| Build Frontend | Build the production frontend bundle |
| Install All Dependencies | Install deps for all projects |

### Testing
| Task | Description |
|------|-------------|
| Test Backend | Run Deno tests |
| Test Frontend | Run Vitest tests |

## Debugging

### Debug Full Stack (Recommended)
1. Press `Ctrl+Shift+D` to open Debug panel
2. Select **"Debug Full Stack (Frontend + Backend)"**
3. Press `F5`

This debugs both backend (Deno) and frontend (Chrome) simultaneously.

### Debug Individual Components

**Backend (Deno):**
1. Select **"Debug Backend (Deno)"** in Debug panel
2. Press `F5`

**Frontend (Chrome/Edge):**
1. Select **"Debug Frontend (Chrome)"** or **"Debug Frontend (Edge)"**
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
├── frontend/          # React + shadcn/ui frontend
└── package.json       # Root package.json with scripts
```

## Troubleshooting

**Port already in use:**
- Frontend uses port 5173
- Backend uses port 8000

**Debugger not attaching:**
1. Make sure the server is running first
2. Check that ports are not blocked
3. Try restarting VS Code

**Deno not found:**
- Install Deno: `curl -fsSL https://deno.land/install.sh | sh`
- Restart VS Code after installation

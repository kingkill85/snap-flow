# VS Code Settings

## Quick Start

### Run Dev Servers (Both Backend + Frontend)

**Method 1: Keyboard Shortcut**
- Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac)

**Method 2: Command Palette**
1. Press `Ctrl+Shift+P`
2. Type "Run Task"
3. Select **"Run Dev (Backend + Frontend)"**

**Method 3: Debug Panel**
1. Press `Ctrl+Shift+D` to open Debug panel
2. Select **"Debug Full Stack"** from the dropdown
3. Press `F5` or click the green play button

This will start:
- 🔵 Backend server on http://localhost:8000
- 🟢 Frontend dev server (Vite) on http://localhost:5173

### Individual Servers

**Backend Only:**
- Command Palette → "Run Task" → **"Run Backend Only"**

**Frontend Only (Vite):**
- Command Palette → "Run Task" → **"Run Frontend Only"** or **"Start Frontend Server"**

## Debugging

### Debug Frontend in Chrome/Edge

**Note:** Make sure the frontend server is running first (see above).

1. Press `Ctrl+Shift+D` to open Debug panel
2. Select **"Debug Frontend (Chrome)"** or **"Debug Frontend (Edge)"**
3. Press `F5`

This will:
1. Start the Vite dev server (if not already running)
2. Open Chrome/Edge with debugger attached
3. Allow you to set breakpoints in VS Code

### Debug Backend (Deno)

1. Press `Ctrl+Shift+D` to open Debug panel
2. Select **"Debug Backend (Deno)"**
3. Press `F5`

This starts the Deno backend with the debugger enabled. You can set breakpoints in the backend code.

### Debug Full Stack

1. Press `Ctrl+Shift+D` to open Debug panel
2. Select **"Debug Full Stack"**
3. Press `F5`

This will debug both backend and frontend simultaneously.

## Keyboard Shortcuts

- **Ctrl+Shift+B**: Run default dev task (starts both servers)
- **F5**: Start debugging (based on selected configuration)
- **Ctrl+Shift+D**: Open debug panel
- **Ctrl+Shift+P**: Open command palette
- **Ctrl+C** in terminal: Stop running servers

## Recommended Extensions

Install these extensions for the best experience:

- **Deno** - Deno language support
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Tailwind CSS IntelliSense** - Tailwind autocomplete
- **vscode-icons** - File icons

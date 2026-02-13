# VS Code Settings

## Run Dev Servers

### Option 1: Command Palette (Ctrl+Shift+P)
1. Type "Run Task"
2. Select "Run Dev (Backend + Frontend)" to start both servers
3. Or select individual tasks:
   - "Run Backend Only"
   - "Run Frontend Only"

### Option 2: Debug Panel (Ctrl+Shift+D)
- **Debug Backend (Deno)**: Debug the Deno backend with breakpoints
- **Debug Frontend (Chrome)**: Debug the React frontend in Chrome
- **Debug Frontend (Edge)**: Debug the React frontend in Edge
- **Debug Full Stack**: Debug both backend and frontend simultaneously

### Option 3: Terminal
```bash
npm run dev          # Both servers
npm run dev:backend  # Backend only
npm run dev:frontend # Frontend only
```

## Keyboard Shortcuts

- **Ctrl+Shift+B**: Run default build task (Run Dev)
- **F5**: Start debugging
- **Ctrl+Shift+D**: Open debug panel
- **Ctrl+Shift+P**: Open command palette

## Recommended Extensions

Install these extensions for the best experience:

- **Deno** - Deno language support
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Tailwind CSS IntelliSense** - Tailwind autocomplete
- **vscode-icons** - File icons

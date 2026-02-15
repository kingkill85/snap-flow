# Zed Full-Stack Configuration for SnapFlow

Complete Zed editor configuration for SnapFlow (Deno + React/Vite full-stack project).

## Files

- `tasks.json` - Reusable tasks for common operations
- `settings.json` - Editor settings optimized for TypeScript/React
- `keymap.json` - Custom keyboard shortcuts

## Quick Start

### Running Tasks

Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on Mac) to open the task picker:

**Backend Tasks:**
- `Backend: Dev Server` - Start Deno development server (opens new terminal)
- `Backend: Start` - Start production server
- `Backend: Test` - Run all backend tests
- `Backend: Type Check` - Run TypeScript type checking
- `Backend: Migrate` - Execute database migrations

**Frontend Tasks:**
- `Frontend: Dev Server` - Start Vite development server (opens new terminal)
- `Frontend: Build` - Build for production
- `Frontend: Test` - Run frontend tests
- `Frontend: Type Check` - Run TypeScript type checking

**Full Stack Tasks:**
- `Full Stack: Dev` - Run both backend and frontend concurrently

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+B` | Open task picker |
| `Ctrl+Shift+T` | Toggle terminal panel |
| `Ctrl+Shift+R` | Re-run last task |

## Project Structure

```
snap-flow/
├── backend/          # Deno + Hono API
│   ├── src/         # Source code
│   └── tests/       # Test files
├── frontend/        # React + Vite
│   ├── src/        # Source code
│   └── tests/      # Test files
└── .zed/           # This configuration
    ├── tasks.json
    ├── settings.json
    └── keymap.json
```

## Tech Stack

**Backend:**
- Deno runtime
- Hono framework
- SQLite database
- JWT authentication

**Frontend:**
- React 18
- TypeScript
- Vite build tool
- Tailwind CSS + Flowbite
- Vitest for testing

## Customization

### Adding a New Task

Edit `.zed/tasks.json`:
```json
[
  {
    "label": "My Custom Task",
    "command": "echo Hello World",
    "cwd": "backend"
  }
]
```

### Adding a Keyboard Shortcut

Edit `.zed/keymap.json`:
```json
[
  {
    "context": "Workspace",
    "bindings": {
      "ctrl-shift-m": "task::Spawn"
    }
  }
]
```

## Troubleshooting

### Tasks not appearing

1. Restart Zed
2. Make sure you opened the project from the root directory
3. Check that `.zed/tasks.json` exists and is valid JSON

### Terminal not opening

Some tasks use `use_new_terminal: true` to run in a separate terminal panel.
You can toggle the terminal panel with `Ctrl+Shift+T`.

## Resources

- [Zed Documentation](https://zed.dev/docs)
- [Zed Tasks](https://zed.dev/docs/tasks)
- [Deno](https://deno.land/)
- [Vite](https://vitejs.dev/)

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const backendProxyTarget = (process.env.VITE_API_URL ?? 'http://localhost:8000/api')
  .replace(/\/api\/?$/, '')

const e2eOwnership = () => ({
  name: 'snapflow-e2e-ownership',
  configureServer(server: { middlewares: { use: (path: string, handler: (_req: unknown, res: import('node:http').ServerResponse) => void) => void } }) {
    server.middlewares.use('/__e2e/ownership', (_req, res) => {
      const runId = process.env.VITE_E2E_RUN_ID
      if (!runId) { res.statusCode = 404; res.end(); return }
      res.setHeader('X-SnapFlow-E2E-Run', runId)
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ status: 'ok' }))
    })
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    e2eOwnership(),
    react({
      include: '**/*.{jsx,tsx}',
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: backendProxyTarget,
        changeOrigin: true,
      },
      '/uploads': {
        target: backendProxyTarget,
        changeOrigin: true,
      },
    },
  },
})

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const srcDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBase = (env.VITE_API_BASE_URL ?? '').trim()
  const useDevProxy = apiBase.length === 0

  return {
    resolve: {
      alias: {
        '@': path.join(srcDir, 'src'),
      },
    },
    plugins: [react()],
    server: {
      // Optional: when `VITE_API_BASE_URL` is unset, `/api` is proxied to the local backend.
      // When set (e.g. http://127.0.0.1:3001), the app calls the backend directly — no proxy required.
      proxy: useDevProxy
        ? {
            '/api': {
              target: 'http://127.0.0.1:3001',
              changeOrigin: true,
            },
          }
        : undefined,
    },
  }
})

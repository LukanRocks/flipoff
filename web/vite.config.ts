import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const BACKEND = 'http://localhost:8080'

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url))

export default defineConfig({
  // Relative asset URLs so a build runs from any root the backend serves it at,
  // including the per-board /{slug} pages.
  base: './',
  build: {
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        index: page('index'),
        display: page('display'),
        admin: page('admin'),
      },
    },
  },
  server: {
    port: 5173,
    // The display reads its entire configuration from /api/config, so this dev
    // server does nothing on its own -- run `pnpm dev` from the root to start
    // the backend alongside it. The admin page is /admin.html in dev; the
    // backend's /admin alias is a production-only convenience.
    proxy: {
      '/api': BACKEND,
      '/ws': { target: BACKEND, ws: true },
    },
  },
})

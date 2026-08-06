import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const BACKEND = 'http://localhost:8080'

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url))

export default defineConfig({
  // Relative asset URLs so a build runs from any root: a domain root, a GitHub
  // Pages sub-path (/<repo>/), or served by the backend.
  base: './',
  build: {
    // constants.js resolves '../config.json' against its own module URL, which
    // assumes exactly one directory of nesting. Pinned here so that stays true.
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        index: page('index'),
        display: page('display'),
        control: page('control'),
        admin: page('admin'),
      },
    },
  },
  server: {
    port: 5173,
    // The backend's own routes only. The admin page is /admin.html in dev —
    // the backend's /admin alias is a production-only convenience.
    proxy: {
      '/api': BACKEND,
      '/ws': { target: BACKEND, ws: true },
    },
  },
})

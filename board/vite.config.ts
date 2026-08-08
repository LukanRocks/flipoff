import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const BACKEND = 'http://localhost:8080'
const ADMIN_DEV_SERVER = 'http://localhost:5174'

/**
 * The presentation half of /api/config, read from the same config.json the
 * server reads and inlined at build time.
 *
 * The board has to draw its "connecting to server" screen before it has any
 * server config, so it needs a grid, a charset and flip timings up front. Those
 * are read from backend/config.json rather than hardcoded here so the two can
 * never drift: a first-ever load comes up at whatever size a fresh backend
 * would serve. This is a build-time read only — the packages ship together and
 * there is no runtime coupling. Once /api/config answers, its values win and
 * are cached for the next boot.
 */
function bootPresentation(): unknown {
  const fallback = {
    cols: 22,
    rows: 5,
    charset: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?'/: ()",
    accentColors: ['#00FF7F', '#FF4D00', '#AA00FF', '#00AAFF', '#00FFCC'],
    timing: { flipStepDuration: 130, flipStepFastDuration: 95, flipSettleDuration: 45, staggerDelay: 25, messageInterval: 5000 },
  }

  let config
  try {
    config = JSON.parse(readFileSync(fileURLToPath(new URL('../backend/config.json', import.meta.url)), 'utf8'))
  } catch {
    // Building board/ without the backend package present.
    return fallback
  }

  const timing = { ...config.timing }
  // Rotation durations are per-board and arrive from the server; only the
  // animation timings belong in a presentation payload.
  delete timing.messageDurationSeconds
  delete timing.apiMessageDurationSeconds

  return {
    cols: config.grid?.cols ?? fallback.cols,
    rows: config.grid?.rows ?? fallback.rows,
    charset: config.charset ?? fallback.charset,
    accentColors: config.accentColors ?? fallback.accentColors,
    timing: { ...fallback.timing, ...timing },
  }
}

export default defineConfig({
  // Relative asset URLs so a build runs from any root the backend serves it at,
  // including the per-board /{slug} pages.
  base: './',
  define: {
    __BOOT_PRESENTATION__: JSON.stringify(bootPresentation()),
  },
  build: {
    // One entry now that display.html is gone, which is Vite's default -- no
    // rollupOptions.input needed.
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    // The display reads its entire configuration from /api/config, so this dev
    // server does nothing on its own -- run `pnpm dev` from the root to start
    // the backend alongside it.
    proxy: {
      '/api': BACKEND,
      '/ws': { target: BACKEND, ws: true },
      // The header's Admin link points at /admin, which in production is the
      // admin package served by the backend. Forwarding it to the admin dev
      // server keeps that link working here too, rather than 404ing on a path
      // this server knows nothing about. `ws` carries the admin's HMR socket.
      //
      // The rewrite bridges a difference in convention: the backend serves the
      // admin at /admin and redirects /admin/ to it, while a Vite dev server
      // with base '/admin/' serves only the trailing-slash form and redirects
      // nothing. Without this, the link works in production and 404s here.
      '/admin': {
        target: ADMIN_DEV_SERVER,
        ws: true,
        rewrite: (path) => (path === '/admin' ? '/admin/' : path),
      },
    },
  },
})

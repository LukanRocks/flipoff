import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const BACKEND = 'http://localhost:8080'

const page = (name: string) => fileURLToPath(new URL(`./${name}.html`, import.meta.url))

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
    // Building web/ without the backend package present.
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

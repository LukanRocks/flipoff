// ── Configuration ──────────────────────────────────────────────────
// Every value below comes from the backend's /api/config. There is no local
// fallback and no config.json fetch: the display is a client of the server,
// and rendering a board from stale built-in defaults would hide an outage
// rather than show it.

/**
 * The backend serves boards at /{slug}; anything else (/, /index.html) is the
 * default board. Shared with RemoteMessageSync so both agree on which board
 * this page is showing.
 */
export function resolveBoardSlugFromPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/index.html' || path === '/display.html') return null
  const [, candidate] = path.split('/')
  return candidate || null
}

export const BOARD_SLUG = resolveBoardSlugFromPath()

const RETRY_BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000]

/** Rejects payloads missing anything the board needs, so a bad response retries instead of throwing later. */
function isUsableConfig(config) {
  return (
    config !== null &&
    typeof config === 'object' &&
    Number.isFinite(config.cols) &&
    Number.isFinite(config.rows) &&
    typeof config.charset === 'string' &&
    Array.isArray(config.accentColors) &&
    Array.isArray(config.defaultMessages) &&
    config.timing !== null &&
    typeof config.timing === 'object'
  )
}

/**
 * Blocks the module graph until the backend answers. Retries forever by
 * design: a wall display has to come back on its own after a server restart,
 * and there is nothing useful to render in the meantime. The HTML shells carry
 * a static "connecting" message that main.js clears once the board mounts.
 */
async function loadConfig() {
  const path = BOARD_SLUG ? `/api/config?board=${encodeURIComponent(BOARD_SLUG)}` : '/api/config'

  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(path, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        if (isUsableConfig(payload)) return payload
      }
    } catch {
      // Server down or unreachable — fall through to the retry below.
    }

    const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]
    console.warn(`FlipOff: ${path} unavailable, retrying in ${delay}ms`)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
}

// Top-level await: every consumer below reads these as plain constants, so the
// module graph must not finish evaluating until the real values are in hand.
export const BOARD_CONFIG = await loadConfig()

// ── Grid ───────────────────────────────────────────────────────────
export const GRID_COLS = BOARD_CONFIG.cols
export const GRID_ROWS = BOARD_CONFIG.rows

// ── Timing (split-flap animation) ─────────────────────────────────
export const FLIP_STEP_DURATION = BOARD_CONFIG.timing.flipStepDuration
export const FLIP_STEP_FAST_DURATION = BOARD_CONFIG.timing.flipStepFastDuration
export const FLIP_SETTLE_DURATION = BOARD_CONFIG.timing.flipSettleDuration
export const STAGGER_DELAY = BOARD_CONFIG.timing.staggerDelay
export const MESSAGE_INTERVAL = BOARD_CONFIG.timing.messageInterval
export const MIN_VISIBLE_FLIPS = 3
export const MAX_VISIBLE_FLIPS = 10

// ── Character set & colors ────────────────────────────────────────
export const CHARSET = BOARD_CONFIG.charset
export const ACCENT_COLORS = BOARD_CONFIG.accentColors

// ── Configuration ──────────────────────────────────────────────────
// The board's content and settings come from the backend's /api/config. There
// is no local fallback for content: rendering a board from stale defaults would
// hide an outage rather than show it.
//
// The one exception is *presentation* — a grid, a charset, flip timings. The
// board needs those to draw its own "connecting to server" and error screens
// before it has spoken to the server at all. They are never used to render
// content, only status, and the server's values replace them the moment they
// arrive. See BOOT_PRESENTATION below.

/**
 * The backend serves boards at /{slug}; anything else (/, /index.html) is the
 * default board. Shared with RemoteMessageSync so both agree on which board
 * this page is showing.
 */
export function resolveBoardSlugFromPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/index.html') return null
  const [, candidate] = path.split('/')
  return candidate || null
}

export const BOARD_SLUG = resolveBoardSlugFromPath()

const RETRY_BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000, 30000]

// Boards can differ in size, so a cached grid is only valid for the board it
// came from.
const CACHE_KEY = `flipoff:presentation:${BOARD_SLUG ?? 'default'}`

/** Everything the board needs to lay itself out, minus anything it would display. */
function presentationOf(config) {
  return {
    cols: config.cols,
    rows: config.rows,
    charset: config.charset,
    accentColors: [...config.accentColors],
    timing: { ...config.timing },
  }
}

function isUsablePresentation(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Number.isFinite(value.cols) &&
    value.cols > 0 &&
    Number.isFinite(value.rows) &&
    value.rows > 0 &&
    typeof value.charset === 'string' &&
    value.charset.length > 0 &&
    Array.isArray(value.accentColors) &&
    value.accentColors.length > 0 &&
    value.timing !== null &&
    typeof value.timing === 'object' &&
    Number.isFinite(value.timing.staggerDelay)
  )
}

/** Rejects payloads missing anything the board needs, so a bad response retries instead of throwing later. */
export function isUsableConfig(config) {
  return isUsablePresentation(config) && Array.isArray(config.defaultMessages)
}

export function samePresentation(left, right) {
  return JSON.stringify(presentationOf(left)) === JSON.stringify(presentationOf(right))
}

/**
 * Remembers how the board *looks*, never what it says. An admin who resizes a
 * board in the dashboard has changed something config.json cannot know about,
 * so without this a returning display would boot at the wrong size and visibly
 * rebuild on every connect.
 */
function readCachedPresentation() {
  try {
    const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY))
    return isUsablePresentation(cached) ? cached : null
  } catch {
    // No storage, or someone put something else there.
    return null
  }
}

export function cachePresentation(config) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(presentationOf(config)))
  } catch {
    // Private browsing or a full quota — the boot size is not worth failing over.
  }
}

/**
 * How the board looks before the server has said anything: the last size this
 * display actually ran at, or the grid a fresh backend would serve, inlined
 * from backend/config.json at build time (see vite.config.ts).
 */
export const BOOT_PRESENTATION = readCachedPresentation() ?? __BOOT_PRESENTATION__

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Emits a status once a second so the board can count down to the next attempt. */
async function waitAndReport(delayMs, failure, onStatus) {
  const endsAt = Date.now() + delayMs
  let remaining = delayMs

  while (remaining > 0) {
    onStatus({ ...failure, retryInSeconds: Math.ceil(remaining / 1000) })
    await sleep(Math.min(1000, remaining))
    remaining = endsAt - Date.now()
  }
}

/**
 * Fetches the board config, retrying with capped backoff until the server
 * answers. Retries forever by design: a wall display has to come back on its
 * own after a server restart, and there is nothing honest to render meanwhile.
 *
 * `onStatus` receives every failure and every countdown tick, so the caller can
 * put it on the board instead of only in the console.
 */
export async function fetchConfig(onStatus = () => {}) {
  const path = BOARD_SLUG ? `/api/config?board=${encodeURIComponent(BOARD_SLUG)}` : '/api/config'

  for (let attempt = 0; ; attempt++) {
    let failure

    try {
      const response = await fetch(path, { cache: 'no-store' })
      if (response.ok) {
        const payload = await response.json()
        if (isUsableConfig(payload)) return payload
        failure = { kind: 'bad-payload' }
      } else {
        failure = { kind: 'http', status: response.status }
      }
    } catch (error) {
      failure = { kind: 'unreachable', detail: error instanceof Error ? error.message : String(error) }
    }

    const delay = RETRY_BACKOFF_MS[Math.min(attempt, RETRY_BACKOFF_MS.length - 1)]
    console.warn(`FlipOff: ${path} unavailable (${failure.kind}), retrying in ${delay}ms`)
    await waitAndReport(delay, failure, onStatus)
  }
}

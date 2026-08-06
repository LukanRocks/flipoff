import { readFileSync } from 'node:fs'

import { DEFAULTS_CONFIG_PATH } from './paths'

export const DEFAULT_BOARD_SLUG = 'main'
export const DEFAULT_BOARD_NAME = 'Main Board'

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const RESERVED_BOARD_SLUGS = new Set(['admin', 'api', 'assets', 'ws', 'screenshot.png', 'favicon.ico', 'index.html'])

export const MAX_SESSION_TOKENS = 100

interface FrontendConfig {
  grid?: { cols?: number; rows?: number }
  timing?: { messageDurationSeconds?: number; apiMessageDurationSeconds?: number }
  messages?: unknown[]
}

function loadFrontendConfig(): FrontendConfig {
  try {
    return JSON.parse(readFileSync(DEFAULTS_CONFIG_PATH, 'utf8')) as FrontendConfig
  } catch {
    // Missing or invalid config.json -- fall back to the constants below.
    return {}
  }
}

const frontend = loadFrontendConfig()

export const DEFAULT_COLS = Number(frontend.grid?.cols ?? 22)
export const DEFAULT_ROWS = Number(frontend.grid?.rows ?? 5)
export const DEFAULT_MESSAGE_DURATION_SECONDS = Number(frontend.timing?.messageDurationSeconds ?? 4)
export const DEFAULT_API_MESSAGE_DURATION_SECONDS = Number(frontend.timing?.apiMessageDurationSeconds ?? 30)

const FALLBACK_MESSAGES: string[][] = [
  ['', '\u{1F3DB}\u{FE0F} GOD IS IN', 'THE DETAILS .', '(LUDWIG MIES)', ''],
  ['', '\u{1F34E} STAY HUNGRY', 'STAY FOOLISH', '(STEVE JOBS)', ''],
  ['', '\u{1F3AF} MAKE IT SIMPLE', 'BUT SIGNIFICANT', '(DON DRAPER)', ''],
]

/**
 * Static messages only. config.json also carries dynamic markers such as
 * `{"dynamic": "weather"}`, which the browser resolves client-side -- the
 * server has no way to render them, so it drops them here and main.js re-adds
 * them after fetching the board config.
 */
const configuredMessages = (frontend.messages ?? []).filter((message): message is string[] => Array.isArray(message) && message.every((line) => typeof line === 'string'))

export const DEFAULT_MESSAGES: string[][] = configuredMessages.length > 0 ? configuredMessages : FALLBACK_MESSAGES

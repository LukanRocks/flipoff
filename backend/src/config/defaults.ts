import { readFileSync } from 'node:fs'

import { DEFAULTS_CONFIG_PATH } from './paths'

export const DEFAULT_BOARD_SLUG = 'main'
export const DEFAULT_BOARD_NAME = 'Main Board'

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const RESERVED_BOARD_SLUGS = new Set(['admin', 'api', 'assets', 'ws', 'screenshot.png', 'favicon.ico', 'index.html'])

export const MAX_SESSION_TOKENS = 100

interface FrontendTiming {
  flipStepDuration?: number
  flipStepFastDuration?: number
  flipSettleDuration?: number
  staggerDelay?: number
  messageInterval?: number
  messageDurationSeconds?: number
  apiMessageDurationSeconds?: number
}

interface FrontendConfig {
  grid?: { cols?: number; rows?: number }
  timing?: FrontendTiming
  charset?: string
  accentColors?: unknown
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

/**
 * Presentation settings the browser used to read straight out of config.json.
 * They are app-global rather than per-board, and reach the client through
 * /api/config -- which is now its only source of them.
 */
export const DEFAULT_CHARSET = frontend.charset || "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,-!?'/: ()"

const FALLBACK_ACCENT_COLORS = ['#00FF7F', '#FF4D00', '#AA00FF', '#00AAFF', '#00FFCC']

export const DEFAULT_ACCENT_COLORS: string[] =
  Array.isArray(frontend.accentColors) && frontend.accentColors.every((color): color is string => typeof color === 'string') && frontend.accentColors.length > 0
    ? frontend.accentColors
    : FALLBACK_ACCENT_COLORS

/** Split-flap animation timing, in milliseconds. */
export const DEFAULT_TIMING = {
  flipStepDuration: Number(frontend.timing?.flipStepDuration ?? 130),
  flipStepFastDuration: Number(frontend.timing?.flipStepFastDuration ?? 95),
  flipSettleDuration: Number(frontend.timing?.flipSettleDuration ?? 45),
  staggerDelay: Number(frontend.timing?.staggerDelay ?? 25),
  messageInterval: Number(frontend.timing?.messageInterval ?? 5000),
}

const FALLBACK_MESSAGES: string[][] = [
  ['', '\u{1F3DB}\u{FE0F} GOD IS IN', 'THE DETAILS .', '(LUDWIG MIES)', ''],
  ['', '\u{1F34E} STAY HUNGRY', 'STAY FOOLISH', '(STEVE JOBS)', ''],
  ['', '\u{1F3AF} MAKE IT SIMPLE', 'BUT SIGNIFICANT', '(DON DRAPER)', ''],
]

/**
 * These seed the manual screens of a board that has never been customised.
 * Anything non-static -- a clock, weather -- is a plugin screen now, so
 * entries that are not plain line arrays are ignored rather than rendered.
 */
const configuredMessages = (frontend.messages ?? []).filter((message): message is string[] => Array.isArray(message) && message.every((line) => typeof line === 'string'))

export const DEFAULT_MESSAGES: string[][] = configuredMessages.length > 0 ? configuredMessages : FALLBACK_MESSAGES

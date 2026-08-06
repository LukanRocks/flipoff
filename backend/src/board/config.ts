import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  DEFAULT_ACCENT_COLORS,
  DEFAULT_API_MESSAGE_DURATION_SECONDS,
  DEFAULT_BOARD_NAME,
  DEFAULT_BOARD_SLUG,
  DEFAULT_CHARSET,
  DEFAULT_COLS,
  DEFAULT_MESSAGES,
  DEFAULT_MESSAGE_DURATION_SECONDS,
  DEFAULT_ROWS,
  DEFAULT_TIMING,
} from '../config/defaults'
import type { BoardRegistry, DisplayConfig } from '../types'
import { dumpJson } from '../util/text'
import { ValidationError, coerceOptionalString, coerceSlug, makeUniqueSlug, normalizeRuntimeSettingsPayload, suggestSlug } from './normalize'

/**
 * The public `/api/config` shape, and the payload of every `config_state`
 * WebSocket frame. This is the display's only source of configuration -- the
 * board geometry and messages are per-board, the charset, colours and timing
 * are app-global and come straight from config.json.
 */
export function serializeConfig(config: DisplayConfig): Record<string, unknown> {
  return {
    boardSlug: config.slug,
    boardName: config.name,
    cols: config.cols,
    rows: config.rows,
    defaultMessages: config.defaultMessages.map((message) => [...message]),
    messageDurationSeconds: config.messageDurationSeconds,
    apiMessageDurationSeconds: config.apiMessageDurationSeconds,
    charset: DEFAULT_CHARSET,
    accentColors: [...DEFAULT_ACCENT_COLORS],
    timing: { ...DEFAULT_TIMING },
  }
}

/** The persisted / admin-facing shape, without the resolved messages. */
export function serializeSettings(config: DisplayConfig): Record<string, unknown> {
  return {
    slug: config.slug,
    name: config.name,
    cols: config.cols,
    rows: config.rows,
    messageDurationSeconds: config.messageDurationSeconds,
    apiMessageDurationSeconds: config.apiMessageDurationSeconds,
  }
}

export function defaultDisplayConfig(slug = DEFAULT_BOARD_SLUG, name = DEFAULT_BOARD_NAME): DisplayConfig {
  return {
    slug,
    name,
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    defaultMessages: DEFAULT_MESSAGES.map((message) => [...message]),
    messageDurationSeconds: DEFAULT_MESSAGE_DURATION_SECONDS,
    apiMessageDurationSeconds: DEFAULT_API_MESSAGE_DURATION_SECONDS,
  }
}

export function loadConfigPayload(configPath: string | null): Record<string, unknown> {
  if (configPath === null) return {}

  let raw: string
  try {
    raw = readFileSync(configPath, 'utf8')
  } catch {
    return {}
  }

  const payload: unknown = JSON.parse(raw)
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new ValidationError('Config file must contain a JSON object.')
  return payload as Record<string, unknown>
}

/** Title-cases a slug for boards saved without a name, as Python's str.title() did. */
function titleFromSlug(slug: string): string {
  return slug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .replace(/\B\w/g, (char) => char.toLowerCase())
}

export function normalizeBoardSettingsEntry(payload: unknown, index: number, seenSlugs: Set<string>): DisplayConfig {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new ValidationError(`Board ${index} must be a JSON object.`)
  const body = payload as Record<string, unknown>

  let slug: string
  if (body.slug === null || body.slug === undefined) {
    slug = makeUniqueSlug(suggestSlug(body.name, `board-${index}`), seenSlugs)
  } else {
    slug = coerceSlug(body.slug, `boards[${index}].slug`)
    if (seenSlugs.has(slug)) throw new ValidationError(`Duplicate board slug '${slug}' is not allowed.`)
  }

  seenSlugs.add(slug)
  const name = coerceOptionalString(body.name, `boards[${index}].name`) || titleFromSlug(slug)
  const settings = normalizeRuntimeSettingsPayload(body)

  return { slug, name, defaultMessages: [], ...settings }
}

export function loadBoardConfigs(configPath: string | null): { boards: DisplayConfig[]; defaultBoardSlug: string } {
  const payload = loadConfigPayload(configPath)
  if (Object.keys(payload).length === 0) return { boards: [defaultDisplayConfig()], defaultBoardSlug: DEFAULT_BOARD_SLUG }

  if (Array.isArray(payload.boards)) {
    const seenSlugs = new Set<string>()
    const boards = payload.boards.map((rawBoard, offset) => normalizeBoardSettingsEntry(rawBoard, offset + 1, seenSlugs))
    if (boards.length === 0) throw new ValidationError("'boards' must contain at least one board.")

    const slugs = new Set(boards.map((board) => board.slug))
    const requested = payload.defaultBoardSlug
    const defaultBoardSlug = typeof requested === 'string' && slugs.has(requested) ? requested : boards[0]!.slug
    return { boards, defaultBoardSlug }
  }

  // Legacy single-board config: the settings sat at the top level.
  const settings = normalizeRuntimeSettingsPayload(payload)
  return {
    boards: [{ slug: DEFAULT_BOARD_SLUG, name: DEFAULT_BOARD_NAME, defaultMessages: [], ...settings }],
    defaultBoardSlug: DEFAULT_BOARD_SLUG,
  }
}

export function saveBoardSettings(configPath: string | null, registry: BoardRegistry, adminPasswordHash: string): void {
  if (configPath === null) return

  mkdirSync(dirname(configPath), { recursive: true })
  const payload = {
    defaultBoardSlug: registry.defaultBoardSlug,
    boards: [...registry.boards.values()].map((board) => serializeSettings(board.config)),
    pluginCommonSettings: registry.commonSettings,
    adminPasswordHash,
  }
  writeFileSync(configPath, dumpJson(payload) + '\n', 'utf8')
}

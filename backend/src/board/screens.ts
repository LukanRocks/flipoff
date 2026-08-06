import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { DEFAULT_BOARD_SLUG, DEFAULT_MESSAGES } from '../config/defaults'
import { normalizeSchemaValues, placeholderLinesFor, type PluginRegistry } from '../plugins/base'
import type { BoardState, DisplayConfig, PluginScreen, Screen } from '../types'
import { dumpJson } from '../util/text'
import {
  ValidationError,
  centerLines,
  coerceBool,
  coerceInt,
  coerceOptionalString,
  coerceSlug,
  makeUniqueSlug,
  normalizeDefaultMessages,
  normalizeMessageLines,
  padLines,
  suggestSlug,
  trimMessageLines,
} from './normalize'

export function generateScreenId(): string {
  return randomBytes(8).toString('hex')
}

export function buildManualScreensFromMessages(messages: unknown, cols: number, rows: number): Screen[] {
  const source = messages ?? DEFAULT_MESSAGES.map((message) => [...message])
  return normalizeDefaultMessages(source, cols, rows).map((message, index) => ({
    id: `manual-${index + 1}`,
    slug: `screen-${index + 1}`,
    type: 'manual' as const,
    name: '',
    enabled: true,
    lines: trimMessageLines(message),
  }))
}

/** Raw per-board screen arrays as they sit on disk, before validation. */
export function loadScreensPayload(screensPath: string | null): Map<string, unknown[]> {
  if (screensPath === null) return new Map()

  let raw: string
  try {
    raw = readFileSync(screensPath, 'utf8')
  } catch {
    return new Map()
  }

  const payload: unknown = JSON.parse(raw)
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new ValidationError("Screens file must contain either 'boards' or 'screens'.")
  const body = payload as Record<string, unknown>

  if (Array.isArray(body.boards)) {
    const boardPayloads = new Map<string, unknown[]>()
    body.boards.forEach((rawBoard, offset) => {
      const index = offset + 1
      if (typeof rawBoard !== 'object' || rawBoard === null || Array.isArray(rawBoard)) throw new ValidationError(`Screen board ${index} must be a JSON object.`)
      const board = rawBoard as Record<string, unknown>
      const slug = coerceSlug(board.slug, `boards[${index}].slug`)
      if (!Array.isArray(board.screens)) throw new ValidationError(`'boards[${index}].screens' must be an array.`)
      boardPayloads.set(slug, board.screens)
    })
    return boardPayloads
  }

  // Legacy single-board file.
  if (Array.isArray(body.screens)) return new Map([[DEFAULT_BOARD_SLUG, body.screens]])

  throw new ValidationError("Screens file must contain either 'boards' or 'screens'.")
}

export function serializeScreenForStorage(screen: Screen): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: screen.id,
    slug: screen.slug,
    type: screen.type,
    name: screen.name ?? '',
    enabled: screen.enabled ?? true,
  }

  if (screen.type === 'manual') {
    payload.lines = trimMessageLines(screen.lines)
    return payload
  }

  payload.pluginId = screen.pluginId
  payload.refreshIntervalSeconds = screen.refreshIntervalSeconds
  payload.settings = screen.settings
  payload.design = screen.design
  payload.pluginState = screen.pluginState ?? {}
  payload.cachedLines = trimMessageLines(screen.cachedLines ?? [])
  payload.lastRefreshedAt = screen.lastRefreshedAt ?? null
  payload.lastError = screen.lastError ?? null
  return payload
}

export function saveScreens(screensPath: string | null, boards: Map<string, BoardState>): void {
  if (screensPath === null) return

  mkdirSync(dirname(screensPath), { recursive: true })
  const payload = {
    boards: [...boards.values()].map((board) => ({
      slug: board.config.slug,
      screens: board.screens.map(serializeScreenForStorage),
    })),
  }
  writeFileSync(screensPath, dumpJson(payload) + '\n', 'utf8')
}

/**
 * Validates a screens payload against the board geometry and plugin schemas.
 * Runtime fields the client never sends -- pluginState, cachedLines, timestamps
 * -- are carried over from `existingScreens` by screen id, so a settings edit
 * does not wipe a plugin's cached output.
 */
export function normalizeScreensPayload(payload: unknown, config: DisplayConfig, plugins: PluginRegistry, existingScreens: Map<string, Screen>): Screen[] {
  const container = payload as Record<string, unknown> | null
  const rawScreens = container && !Array.isArray(container) && 'screens' in container ? container.screens : payload
  if (!Array.isArray(rawScreens) || rawScreens.length === 0) throw new ValidationError("'screens' must be a non-empty array.")

  const normalizedScreens: Screen[] = []
  const seenIds = new Set<string>()
  const seenSlugs = new Set<string>()

  rawScreens.forEach((rawScreen, offset) => {
    const index = offset + 1
    if (typeof rawScreen !== 'object' || rawScreen === null || Array.isArray(rawScreen)) throw new ValidationError(`Screen ${index} must be a JSON object.`)
    const screen = rawScreen as Record<string, unknown>

    const screenId = typeof screen.id === 'string' ? screen.id : generateScreenId()
    if (seenIds.has(screenId)) throw new ValidationError(`Duplicate screen id '${screenId}' is not allowed.`)
    seenIds.add(screenId)

    const previous = existingScreens.get(screenId)
    const rawSlug = screen.slug ?? previous?.slug
    let screenSlug: string
    if (rawSlug === null || rawSlug === undefined) {
      const suggested = suggestSlug(screen.name || previous?.name || screen.pluginId || screenId, `screen-${index}`)
      screenSlug = makeUniqueSlug(suggested, seenSlugs)
    } else {
      screenSlug = coerceSlug(rawSlug, `screens[${index}].slug`)
      if (seenSlugs.has(screenSlug)) throw new ValidationError(`Duplicate screen slug '${screenSlug}' is not allowed.`)
    }
    seenSlugs.add(screenSlug)

    const name = coerceOptionalString(screen.name, `screens[${index}].name`)
    const enabled = coerceBool(screen.enabled ?? true, `screens[${index}].enabled`)

    if (screen.type === 'manual') {
      normalizedScreens.push({
        id: screenId,
        slug: screenSlug,
        type: 'manual',
        name,
        enabled,
        lines: normalizeMessageLines(screen.lines, { cols: config.cols, rows: config.rows, fieldName: `screens[${index}].lines` }),
      })
      return
    }

    if (screen.type === 'plugin') {
      const pluginId = screen.pluginId
      if (typeof pluginId !== 'string' || !plugins.has(pluginId)) throw new ValidationError(`Screen ${index} references an unknown plugin.`)

      const plugin = plugins.get(pluginId)!
      const refreshIntervalSeconds = coerceInt(screen.refreshIntervalSeconds ?? plugin.manifest.defaultRefreshIntervalSeconds, `screens[${index}].refreshIntervalSeconds`, 1, 86400)
      const previousPlugin = previous?.type === 'plugin' ? previous : null
      const cachedLines = normalizeMessageLines(previousPlugin?.cachedLines ?? [], {
        cols: config.cols,
        rows: config.rows,
        fieldName: `screens[${index}].cachedLines`,
        allowEmpty: true,
      })

      normalizedScreens.push({
        id: screenId,
        slug: screenSlug,
        type: 'plugin',
        name,
        enabled,
        pluginId,
        refreshIntervalSeconds,
        settings: normalizeSchemaValues(screen.settings, plugin.manifest.settingsSchema, `screens[${index}].settings`),
        design: normalizeSchemaValues(screen.design, plugin.manifest.designSchema, `screens[${index}].design`),
        pluginState: previousPlugin?.pluginState ?? {},
        cachedLines,
        lastRefreshedAt: previousPlugin?.lastRefreshedAt ?? null,
        lastError: previousPlugin?.lastError ?? null,
      })
      return
    }

    throw new ValidationError(`Screen ${index} must have type 'manual' or 'plugin'.`)
  })

  return normalizedScreens
}

/**
 * Re-validates existing screens after a grid resize. Plugin output is discarded
 * rather than re-wrapped, because lines rendered for the old width would be
 * clipped or ragged at the new one -- the next refresh regenerates them.
 */
export function reconcileScreensForConfigChange(screens: Screen[], cols: number, rows: number, plugins: PluginRegistry): Screen[] {
  return screens.map((screen) => {
    if (screen.type === 'manual') {
      return { ...screen, lines: normalizeMessageLines(screen.lines, { cols, rows, fieldName: `screen '${screen.slug}'` }) }
    }

    const plugin = plugins.get(screen.pluginId)
    if (!plugin) throw new ValidationError(`Screen '${screen.slug}' references an unknown plugin.`)

    return {
      ...screen,
      settings: normalizeSchemaValues(screen.settings, plugin.manifest.settingsSchema, `screen '${screen.slug}'.settings`),
      design: normalizeSchemaValues(screen.design, plugin.manifest.designSchema, `screen '${screen.slug}'.design`),
      pluginState: {},
      cachedLines: [],
      lastRefreshedAt: null,
      lastError: null,
    } satisfies PluginScreen
  })
}

export function resolveScreenLines(screen: Screen, config: DisplayConfig, plugins: PluginRegistry): string[] {
  if (screen.type === 'manual') return padLines(screen.lines, config.rows)

  const plugin = plugins.get(screen.pluginId)
  if (!plugin) throw new ValidationError(`Screen '${screen.slug}' references an unknown plugin.`)

  const cachedLines = screen.cachedLines ?? []
  if (cachedLines.length > 0) return centerLines(cachedLines, config.rows)

  const placeholder = placeholderLinesFor(plugin, {
    settings: screen.settings,
    design: screen.design,
    context: { cols: config.cols, rows: config.rows },
    error: screen.lastError,
  })
  return centerLines(normalizeMessageLines(placeholder, { cols: config.cols, rows: config.rows, fieldName: `screen '${screen.slug}' placeholder` }), config.rows)
}

export function resolveDefaultMessages(screens: Screen[], config: DisplayConfig, plugins: PluginRegistry): string[][] {
  const messages = screens.filter((screen) => screen.enabled ?? true).map((screen) => resolveScreenLines(screen, config, plugins))
  return messages.length > 0 ? messages : normalizeDefaultMessages([['NO SCREENS']], config.cols, config.rows)
}

export function syncBoardDisplayMessages(board: BoardState, plugins: PluginRegistry): void {
  board.config.defaultMessages = resolveDefaultMessages(board.screens, board.config, plugins)
}

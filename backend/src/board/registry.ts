import type { PluginRegistry } from '../plugins/base'
import { serializeManifest } from '../plugins/base'
import type { BoardRegistry, BoardState, DisplayConfig, MessageState, Screen } from '../types'
import { serializeSettings } from './config'
import { SEEDED_PLUGIN_ID_PREFIX, buildDefaultScreens, hasDefaultPluginConfig, normalizeScreensPayload, resolveScreenLines, syncBoardDisplayMessages } from './screens'

export function emptyMessageState(rows: number): MessageState {
  return { hasOverride: false, lines: Array(rows).fill(''), updatedAt: null }
}

export function buildDefaultBoardState(config: DisplayConfig, plugins: PluginRegistry): BoardState {
  const board: BoardState = {
    config,
    screens: buildDefaultScreens(config.cols, config.rows, plugins),
    messageState: emptyMessageState(config.rows),
    refreshLoops: new Map(),
    overrideTimer: null,
  }
  syncBoardDisplayMessages(board, plugins)
  return board
}

/**
 * True when every persisted screen is still an untouched auto-generated one,
 * which is what lets a config.json message edit take effect on restart.
 *
 * Seeded plugin screens have to count, or a board saved once after the clock
 * was seeded would never pick up a config.json edit again. But a seeded id
 * alone is not proof: the screen also has to still hold its schema defaults.
 */
function areOnlySeededScreens(rawScreens: unknown[], plugins: PluginRegistry): boolean {
  return rawScreens.every((rawScreen) => {
    if (typeof rawScreen !== 'object' || rawScreen === null) return false
    const screen = rawScreen as Record<string, unknown>
    const id = String(screen.id ?? '')

    if (id.startsWith('manual-')) return true
    if (id.startsWith(SEEDED_PLUGIN_ID_PREFIX)) return hasDefaultPluginConfig(screen, plugins)
    return false
  })
}

export function buildRegistry(options: {
  boardConfigs: DisplayConfig[]
  defaultBoardSlug: string
  commonSettings: Record<string, Record<string, unknown>>
  screensByBoard: Map<string, unknown[]>
  plugins: PluginRegistry
}): BoardRegistry {
  const { boardConfigs, defaultBoardSlug, commonSettings, screensByBoard, plugins } = options
  const registry: BoardRegistry = { boards: new Map(), defaultBoardSlug, commonSettings }

  for (const config of boardConfigs) {
    const rawScreens = screensByBoard.get(config.slug)

    // Default manual screens are rebuilt from config.json on every start, so
    // editing messages there takes effect on restart without clearing state.
    // Anything the admin has actually customised is preserved instead.
    if (rawScreens === undefined || areOnlySeededScreens(rawScreens, plugins)) {
      registry.boards.set(config.slug, buildDefaultBoardState(config, plugins))
      continue
    }

    const board: BoardState = {
      config,
      screens: normalizeScreensPayload(rawScreens, config, plugins, new Map()),
      messageState: emptyMessageState(config.rows),
      refreshLoops: new Map(),
      overrideTimer: null,
    }
    syncBoardDisplayMessages(board, plugins)
    registry.boards.set(config.slug, board)
  }

  if (!registry.boards.has(registry.defaultBoardSlug)) {
    registry.defaultBoardSlug = registry.boards.keys().next().value ?? registry.defaultBoardSlug
  }

  return registry
}

export function getBoard(registry: BoardRegistry, boardSlug: string | null): BoardState | null {
  return registry.boards.get(boardSlug ?? registry.defaultBoardSlug) ?? null
}

export function getDefaultBoard(registry: BoardRegistry): BoardState {
  return registry.boards.get(registry.defaultBoardSlug)!
}

export function getScreenById(board: BoardState, screenId: string): Screen | null {
  return board.screens.find((screen) => screen.id === screenId) ?? null
}

// ── Response builders ────────────────────────────────────────────────

export function buildAdminConfigResponse(board: BoardState, defaultBoardSlug: string, hasAdminPassword: boolean): Record<string, unknown> {
  return {
    ...serializeSettings(board.config),
    isDefault: board.config.slug === defaultBoardSlug,
    hasAdminPassword,
  }
}

export function serializeScreenForAdmin(screen: Screen, config: DisplayConfig, plugins: PluginRegistry): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: screen.id,
    slug: screen.slug,
    type: screen.type,
    name: screen.name ?? '',
    enabled: screen.enabled ?? true,
    previewLines: resolveScreenLines(screen, config, plugins),
  }

  if (screen.type === 'manual') {
    payload.lines = screen.lines
    return payload
  }

  payload.pluginId = screen.pluginId
  payload.pluginName = plugins.get(screen.pluginId)?.manifest.name ?? screen.pluginId
  payload.refreshIntervalSeconds = screen.refreshIntervalSeconds
  payload.settings = screen.settings
  payload.design = screen.design
  payload.pluginState = screen.pluginState ?? {}
  payload.lastRefreshedAt = screen.lastRefreshedAt ?? null
  payload.lastError = screen.lastError ?? null
  return payload
}

export function buildAdminScreensResponse(registry: BoardRegistry, board: BoardState, plugins: PluginRegistry): Record<string, unknown> {
  return {
    boardSlug: board.config.slug,
    pluginCommonSettings: registry.commonSettings,
    screens: board.screens.map((screen) => serializeScreenForAdmin(screen, board.config, plugins)),
    plugins: [...plugins.values()].map((plugin) => serializeManifest(plugin.manifest)),
  }
}

export function buildAdminBoardsResponse(registry: BoardRegistry): Record<string, unknown> {
  return {
    defaultBoardSlug: registry.defaultBoardSlug,
    boards: [...registry.boards.values()].map((board) => ({
      slug: board.config.slug,
      name: board.config.name,
      isDefault: board.config.slug === registry.defaultBoardSlug,
      cols: board.config.cols,
      rows: board.config.rows,
      messageDurationSeconds: board.config.messageDurationSeconds,
      apiMessageDurationSeconds: board.config.apiMessageDurationSeconds,
      screenCount: board.screens.length,
    })),
  }
}

export function serializeMessageState(state: MessageState): Record<string, unknown> {
  return { hasOverride: state.hasOverride, lines: [...state.lines], updatedAt: state.updatedAt }
}

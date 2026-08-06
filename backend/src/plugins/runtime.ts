import { getBoard, getScreenById } from '../board/registry'
import { normalizeMessageLines } from '../board/normalize'
import { saveScreens, syncBoardDisplayMessages } from '../board/screens'
import type { AppState, BoardState, Screen } from '../types'
import { utcNow } from '../util/text'
import type { PluginRegistry } from './base'
import { PLUGIN_REQUEST_TIMEOUT_MS } from './lib/format'

export interface PluginRuntime {
  refreshScreen: (boardSlug: string, screenId: string, broadcast: boolean) => Promise<Screen | null>
  refreshAllForBoard: (boardSlug: string, broadcast: boolean) => Promise<void>
  restartLoops: (boardSlug: string) => void
  cancelLoops: (board: BoardState) => void
  startAll: () => Promise<void>
  stopAll: () => void
}

function sameLines(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((line, index) => line === right[index])
}

export function createPluginRuntime(state: AppState, plugins: PluginRegistry, broadcastDisplayConfig: (boardSlug: string) => void): PluginRuntime {
  async function refreshScreen(boardSlug: string, screenId: string, broadcast: boolean): Promise<Screen | null> {
    const board = getBoard(state.registry, boardSlug)
    if (board === null) return null

    const screen = getScreenById(board, screenId)
    if (screen === null || screen.type !== 'plugin' || !(screen.enabled ?? true)) return screen

    const plugin = plugins.get(screen.pluginId)
    if (!plugin) return screen

    const config = board.config
    const previousLastError = screen.lastError
    const previousCachedLines = [...(screen.cachedLines ?? [])]

    // Replaces aiohttp's ClientTimeout(total=20): one deadline covering every
    // request a single refresh makes.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PLUGIN_REQUEST_TIMEOUT_MS)

    try {
      const result = await plugin.refresh({
        settings: screen.settings,
        design: screen.design,
        context: { cols: config.cols, rows: config.rows },
        previousState: screen.pluginState,
        commonSettings: state.registry.commonSettings[plugin.manifest.commonSettingsNamespace ?? ''] ?? {},
        signal: controller.signal,
      })

      screen.cachedLines = normalizeMessageLines(result.lines, { cols: config.cols, rows: config.rows, fieldName: `plugin screen '${screen.slug}'`, allowEmpty: true })
      screen.pluginState = { ...(result.meta ?? {}) }
      screen.lastRefreshedAt = utcNow()
      screen.lastError = null
    } catch (error) {
      // A failing plugin keeps its last good output; the error surfaces in the
      // admin dashboard and in the placeholder if there is nothing cached.
      screen.pluginState = screen.pluginState ?? {}
      screen.lastError = error instanceof Error ? error.message : String(error)
    } finally {
      clearTimeout(timeout)
    }

    // A volatile plugin regenerates its lines from scratch every tick, so
    // persisting them buys nothing and would churn the file continuously.
    if (!plugin.manifest.volatile) saveScreens(state.screensPath, state.registry.boards)
    syncBoardDisplayMessages(board, plugins)

    if (broadcast && (screen.lastError !== previousLastError || !sameLines(screen.cachedLines ?? [], previousCachedLines))) {
      broadcastDisplayConfig(boardSlug)
    }

    return screen
  }

  async function refreshAllForBoard(boardSlug: string, broadcast: boolean): Promise<void> {
    const board = getBoard(state.registry, boardSlug)
    if (board === null) return

    for (const screen of board.screens) {
      if (screen.type !== 'plugin' || !(screen.enabled ?? true)) continue
      await refreshScreen(boardSlug, screen.id, false)
    }

    syncBoardDisplayMessages(board, plugins)
    if (broadcast) broadcastDisplayConfig(boardSlug)
  }

  function cancelLoops(board: BoardState): void {
    for (const loop of board.refreshLoops.values()) loop.stop()
    board.refreshLoops.clear()
  }

  /**
   * One self-rescheduling timer per enabled plugin screen. Uses a chained
   * timeout rather than setInterval so a slow refresh cannot overlap itself.
   */
  function startLoop(boardSlug: string, screenId: string, intervalSeconds: number): void {
    const board = getBoard(state.registry, boardSlug)
    if (board === null) return

    let stopped = false
    let timer: NodeJS.Timeout | null = null

    const tick = async (): Promise<void> => {
      if (stopped) return

      const currentBoard = getBoard(state.registry, boardSlug)
      const screen = currentBoard && getScreenById(currentBoard, screenId)
      if (!screen || screen.type !== 'plugin' || !(screen.enabled ?? true)) return

      await refreshScreen(boardSlug, screenId, true)
      if (!stopped) timer = setTimeout(() => void tick(), intervalSeconds * 1000)
    }

    timer = setTimeout(() => void tick(), intervalSeconds * 1000)

    board.refreshLoops.set(screenId, {
      stop: () => {
        stopped = true
        if (timer) clearTimeout(timer)
      },
    })
  }

  function restartLoops(boardSlug: string): void {
    const board = getBoard(state.registry, boardSlug)
    if (board === null) return

    cancelLoops(board)
    for (const screen of board.screens) {
      if (screen.type !== 'plugin' || !(screen.enabled ?? true)) continue
      startLoop(boardSlug, screen.id, screen.refreshIntervalSeconds)
    }
  }

  async function startAll(): Promise<void> {
    for (const boardSlug of state.registry.boards.keys()) {
      await refreshAllForBoard(boardSlug, false)
      restartLoops(boardSlug)
    }
  }

  function stopAll(): void {
    for (const board of state.registry.boards.values()) {
      cancelLoops(board)
      if (board.overrideTimer) {
        clearTimeout(board.overrideTimer)
        board.overrideTimer = null
      }
    }
  }

  return { refreshScreen, refreshAllForBoard, restartLoops, cancelLoops, startAll, stopAll }
}

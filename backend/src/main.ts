import { createServer } from 'node:http'

import { createApp } from './app'
import { announceAdminPassword, resolveAdminPassword } from './auth/password'
import { loadBoardConfigs, saveBoardSettings } from './board/config'
import { buildRegistry } from './board/registry'
import { loadScreensPayload, saveScreens } from './board/screens'
import { ADMIN_ROOT, BOARD_ROOT, CONFIG_PATH, SCREENS_PATH } from './config/paths'
import { loadPlugins } from './plugins'
import { loadConfigPayload } from './board/config'
import { normalizePluginCommonSettings } from './plugins/base'
import { createPluginRuntime } from './plugins/runtime'
import type { AppState } from './types'
import { createWsHub } from './ws/hub'

const PORT = Number(process.env.PORT ?? 8080)

/**
 * Serialises the admin write handlers. Node is single-threaded but every
 * handler awaits, so two concurrent config saves could still interleave and
 * clobber each other -- this is the asyncio.Lock the Python server held.
 */
function createMutex(): <T>(fn: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve()

  return <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn)
    tail = run.catch(() => undefined)
    return run
  }
}

function main(): void {
  const plugins = loadPlugins()

  const { boards: boardConfigs, defaultBoardSlug } = loadBoardConfigs(CONFIG_PATH)
  const screensByBoard = loadScreensPayload(SCREENS_PATH)
  const commonSettings = normalizePluginCommonSettings(loadConfigPayload(CONFIG_PATH).pluginCommonSettings, plugins)

  const registry = buildRegistry({ boardConfigs, defaultBoardSlug, commonSettings, screensByBoard, plugins })
  const adminPassword = resolveAdminPassword(process.env.ADMIN_PASSWORD, CONFIG_PATH)

  const state: AppState = {
    registry,
    adminPassword,
    sessionTokens: new Set(),
    configPath: CONFIG_PATH,
    screensPath: SCREENS_PATH,
    withAdminLock: createMutex(),
    broadcast: () => {},
  }

  // Normalising on load can rewrite state, so persist it before serving.
  saveBoardSettings(state.configPath, registry, adminPassword.passwordHash)
  saveScreens(state.screensPath, registry.boards)

  const server = createServer()
  const hub = createWsHub(server, registry, plugins)
  state.broadcast = hub.broadcast

  const runtime = createPluginRuntime(state, plugins, hub.broadcastDisplayConfig)
  server.on('request', createApp(state, plugins, hub, runtime))

  server.listen(PORT, '0.0.0.0', () => {
    announceAdminPassword(adminPassword)
    console.log(`[flipoff] Listening on http://0.0.0.0:${PORT}`)
    console.log(`[flipoff]   board ${BOARD_ROOT}`)
    console.log(`[flipoff]   admin ${ADMIN_ROOT}`)
    void runtime.startAll()
  })

  const shutdown = (signal: string): void => {
    console.log(`[flipoff] ${signal} received, shutting down.`)
    runtime.stopAll()
    void hub.close().then(() => server.close(() => process.exit(0)))
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(0), 5000).unref()
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()

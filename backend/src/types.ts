export interface DisplayConfig {
  slug: string
  name: string
  cols: number
  rows: number
  defaultMessages: string[][]
  messageDurationSeconds: number
  apiMessageDurationSeconds: number
}

export interface MessageState {
  hasOverride: boolean
  lines: string[]
  updatedAt: string | null
}

export interface ManualScreen {
  id: string
  slug: string
  type: 'manual'
  name: string
  enabled: boolean
  lines: string[]
}

export interface PluginScreen {
  id: string
  slug: string
  type: 'plugin'
  name: string
  enabled: boolean
  pluginId: string
  refreshIntervalSeconds: number
  settings: Record<string, unknown>
  design: Record<string, unknown>
  pluginState: Record<string, unknown>
  cachedLines: string[]
  lastRefreshedAt: string | null
  lastError: string | null
}

export type Screen = ManualScreen | PluginScreen

/** A cancellable background refresh loop for one plugin screen. */
export interface RefreshLoop {
  stop: () => void
}

export interface BoardState {
  config: DisplayConfig
  screens: Screen[]
  messageState: MessageState
  refreshLoops: Map<string, RefreshLoop>
  overrideTimer: NodeJS.Timeout | null
}

export interface BoardRegistry {
  boards: Map<string, BoardState>
  defaultBoardSlug: string
  commonSettings: Record<string, Record<string, unknown>>
}

export interface AdminPasswordState {
  passwordHash: string
  generated: boolean
  /** Only set for generated passwords; cleared once announced on startup. */
  plaintextForAnnounce: string | null
}

/**
 * Everything the request handlers need. Replaces aiohttp's `web.AppKey` bag —
 * built once in main.ts and closed over by the route factories.
 */
export interface AppState {
  registry: BoardRegistry
  adminPassword: AdminPasswordState
  sessionTokens: Set<string>
  configPath: string | null
  screensPath: string | null
  /** Serialises the admin write handlers, like the asyncio.Lock did. */
  withAdminLock: <T>(fn: () => Promise<T>) => Promise<T>
  broadcast: (boardSlug: string, event: BroadcastEvent) => void
}

export interface BroadcastEvent {
  type: 'message_state' | 'config_state'
  payload: Record<string, unknown>
}

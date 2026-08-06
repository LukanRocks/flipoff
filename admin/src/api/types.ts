/**
 * The shapes the admin API actually returns.
 *
 * Hand-written rather than imported from the backend: its serializers are
 * typed `Record<string, unknown>`, so sharing them would give us nothing to
 * check against. These mirror `buildAdmin*Response` and `serializeScreenForAdmin`
 * in backend/src/board/registry.ts, and `serializeManifest` in
 * backend/src/plugins/base.ts. Change one, change the other.
 */

export interface BoardSummary {
  slug: string
  name: string
  isDefault: boolean
  cols: number
  rows: number
  messageDurationSeconds: number
  apiMessageDurationSeconds: number
  screenCount: number
}

export interface BoardsResponse {
  defaultBoardSlug: string
  boards: BoardSummary[]
}

export interface AdminConfig {
  slug: string
  name: string
  isDefault: boolean
  cols: number
  rows: number
  messageDurationSeconds: number
  apiMessageDurationSeconds: number
  hasAdminPassword: boolean
}

export interface MessageState {
  hasOverride: boolean
  lines: string[]
  updatedAt: string | null
}

export type PluginFieldType = 'text' | 'select' | 'checkbox' | 'number'

export interface PluginFieldOption {
  label: string
  value: string
}

export interface PluginField {
  name: string
  label: string
  type: PluginFieldType
  required?: boolean
  default?: unknown
  placeholder?: string
  helpText?: string
  options?: PluginFieldOption[]
}

export interface PluginManifest {
  id: string
  name: string
  description: string
  defaultRefreshIntervalSeconds: number
  settingsSchema: PluginField[]
  designSchema: PluginField[]
  /** Settings shared by a plugin family, e.g. one API key across all API Ninjas plugins. */
  commonSettingsNamespace: string
  commonSettingsSchema: PluginField[]
}

export type SchemaValues = Record<string, unknown>

interface ScreenBase {
  id: string
  slug: string
  name: string
  enabled: boolean
  /** Server-rendered lines. Absent on a draft that has never been saved. */
  previewLines?: string[]
}

export interface ManualScreen extends ScreenBase {
  type: 'manual'
  lines: string[]
}

export interface PluginScreen extends ScreenBase {
  type: 'plugin'
  pluginId: string
  pluginName: string
  refreshIntervalSeconds: number
  settings: SchemaValues
  design: SchemaValues
  pluginState?: SchemaValues
  lastRefreshedAt: string | null
  lastError: string | null
}

export type Screen = ManualScreen | PluginScreen

export interface ScreensResponse {
  boardSlug: string
  pluginCommonSettings: Record<string, SchemaValues>
  screens: Screen[]
  plugins: PluginManifest[]
}

/** Everything one board's admin view needs, fetched together. */
export interface AdminSnapshot {
  boards: BoardsResponse
  config: AdminConfig
  screens: ScreensResponse
  message: MessageState
}

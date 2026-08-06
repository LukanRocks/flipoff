import type { PluginField, PluginManifest, Screen, SchemaValues } from '../api/types'
import { cpSlice, createLocalScreenId, padLines } from './format'

export function getScreenTitle(screen: Screen, index: number): string {
  if (screen.name) return screen.name
  if (screen.type === 'plugin' && screen.pluginName) return screen.pluginName
  return `Screen ${index + 1}`
}

/**
 * One line describing what a screen shows.
 *
 * Location is read from the plugin's own schema rather than assumed. The
 * previous version hardcoded `settings.city` / `settings.country` for every
 * plugin type, so a clock screen announced itself as "Clock for Unconfigured
 * city, country." That was invisible only because the panel calling it had
 * lost its markup and rendered nowhere.
 */
export function getScreenSummary(screen: Screen, plugins: PluginManifest[]): string {
  if (screen.type === 'manual') return 'Manual split-flap message.'

  const label = screen.pluginName || screen.pluginId
  const manifest = plugins.find((plugin) => plugin.id === screen.pluginId)
  const declares = (name: string): boolean => Boolean(manifest?.settingsSchema.some((field) => field.name === name))

  const place = ['city', 'country']
    .filter(declares)
    .map((name) => String(screen.settings[name] ?? '').trim())
    .filter(Boolean)

  return place.length > 0 ? `${label} for ${place.join(', ')}.` : `${label} screen.`
}

/** What the board would show for a draft the server has not rendered yet. */
export function buildLocalPreviewLines(screen: Screen, cols: number, rows: number): string[] {
  if (screen.type === 'manual') return padLines(screen.lines, rows)

  const title = String(screen.design?.title || screen.settings?.city || screen.pluginName || 'PLUGIN')
    .trim()
    .toUpperCase()
  const detail = screen.lastError ? screen.lastError.toUpperCase() : 'PLUGIN SCREEN'
  return padLines(['', cpSlice(title, cols), cpSlice(detail, cols)], rows)
}

/** Server-rendered lines when there are any, otherwise a local approximation. */
export function getScreenPreviewLines(screen: Screen, cols: number, rows: number): string[] {
  const lines = screen.previewLines
  return lines && lines.length > 0 ? padLines(lines, rows) : buildLocalPreviewLines(screen, cols, rows)
}

export function buildDefaultManualDraft(): Screen {
  return { id: createLocalScreenId(), slug: '', type: 'manual', name: '', enabled: true, lines: [] }
}

/**
 * Strips everything the server owns -- previewLines, pluginState, lastError,
 * lastRefreshedAt -- so a save never echoes stale render results back as input.
 */
export function serializeScreenForSave(screen: Screen): Record<string, unknown> {
  const base = { id: screen.id, slug: screen.slug, name: screen.name || '', enabled: true }

  if (screen.type === 'manual') return { ...base, type: 'manual', lines: screen.lines }

  return {
    ...base,
    type: 'plugin',
    pluginId: screen.pluginId,
    refreshIntervalSeconds: screen.refreshIntervalSeconds,
    settings: screen.settings || {},
    design: screen.design || {},
  }
}

/** A field's starting value: what the screen already has, else the schema default. */
export function initialFieldValue(field: PluginField, values: SchemaValues | undefined): unknown {
  return values && field.name in values ? values[field.name] : field.default
}

/** Coerces one editor value to the type its field declares, matching what the server expects. */
export function coerceFieldValue(field: PluginField, raw: unknown): unknown {
  if (field.type === 'checkbox') return Boolean(raw)
  if (field.type === 'number') return Number(raw)
  return String(raw ?? '').trim()
}

export function collectSchemaValues(schema: PluginField[], values: SchemaValues): SchemaValues {
  const collected: SchemaValues = {}
  for (const field of schema) collected[field.name] = coerceFieldValue(field, values[field.name])
  return collected
}

/** Every field in a schema at its starting value, for a freshly opened editor. */
export function initialSchemaValues(schema: PluginField[], values: SchemaValues | undefined): SchemaValues {
  const initial: SchemaValues = {}
  for (const field of schema) initial[field.name] = initialFieldValue(field, values) ?? (field.type === 'checkbox' ? false : '')
  return initial
}

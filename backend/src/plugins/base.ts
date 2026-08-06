import { ValidationError, coerceBool } from '../board/normalize'
import { cpSlice } from '../util/text'

export interface PluginFieldOption {
  label: string
  value: string
}

export type PluginFieldType = 'text' | 'select' | 'checkbox' | 'number'

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
  settingsSchema?: PluginField[]
  designSchema?: PluginField[]
  /** Settings shared by a whole plugin family, e.g. one API key for all API Ninjas plugins. */
  commonSettingsNamespace?: string
  commonSettingsSchema?: PluginField[]
}

export interface PluginContext {
  cols: number
  rows: number
}

export interface PluginRefreshResult {
  lines: string[]
  meta?: Record<string, unknown>
}

export interface PluginRefreshArgs {
  settings: Record<string, unknown>
  design: Record<string, unknown>
  context: PluginContext
  previousState?: Record<string, unknown> | null
  commonSettings?: Record<string, unknown> | null
  signal: AbortSignal
}

export interface PluginPlaceholderArgs {
  settings: Record<string, unknown>
  design: Record<string, unknown>
  context: PluginContext
  error?: string | null
}

export interface ScreenPlugin {
  manifest: PluginManifest
  refresh(args: PluginRefreshArgs): Promise<PluginRefreshResult>
  /** Optional. Falls back to `defaultPlaceholderLines`. */
  placeholderLines?(args: PluginPlaceholderArgs): string[]
}

export type PluginRegistry = Map<string, ScreenPlugin>

// ── Serialisation ────────────────────────────────────────────────────
// Key order below is what the admin dashboard's golden responses contain;
// admin.js reads these descriptors to render plugin config forms.

export function serializeField(field: PluginField): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required ?? false,
    default: field.default ?? null,
    placeholder: field.placeholder ?? '',
    helpText: field.helpText ?? '',
  }
  if (field.options && field.options.length > 0) payload.options = field.options.map((option) => ({ label: option.label, value: option.value }))
  return payload
}

export function serializeManifest(manifest: PluginManifest): Record<string, unknown> {
  return {
    id: manifest.id,
    name: manifest.name,
    description: manifest.description,
    defaultRefreshIntervalSeconds: manifest.defaultRefreshIntervalSeconds,
    settingsSchema: (manifest.settingsSchema ?? []).map(serializeField),
    designSchema: (manifest.designSchema ?? []).map(serializeField),
    commonSettingsNamespace: manifest.commonSettingsNamespace ?? '',
    commonSettingsSchema: (manifest.commonSettingsSchema ?? []).map(serializeField),
  }
}

// ── Title helpers, shared by every plugin's line rendering ────────────

export function getTitleLine(design: Record<string, unknown>, context: PluginContext): string | null {
  const title = String(design.title ?? '')
    .trim()
    .toUpperCase()
  if (!title) return null
  return cpSlice(title, 0, context.cols)
}

export function withOptionalTitle(lines: string[], design: Record<string, unknown>, context: PluginContext): string[] {
  const titleLine = getTitleLine(design, context)
  return titleLine ? [titleLine, '', ...lines] : lines
}

export function defaultPlaceholderLines({ design, context, error }: PluginPlaceholderArgs): string[] {
  const lines = withOptionalTitle([cpSlice((error || 'NO DATA').toUpperCase(), 0, context.cols)], design, context)
  return lines.slice(0, context.rows)
}

export function placeholderLinesFor(plugin: ScreenPlugin, args: PluginPlaceholderArgs): string[] {
  return plugin.placeholderLines ? plugin.placeholderLines(args) : defaultPlaceholderLines(args)
}

// ── Schema-driven value validation ───────────────────────────────────

export function normalizeSchemaValues(values: unknown, schema: PluginField[] | undefined, sectionName: string): Record<string, unknown> {
  const source = values ?? {}
  if (typeof source !== 'object' || source === null || Array.isArray(source)) throw new ValidationError(`'${sectionName}' must be a JSON object.`)
  const provided = source as Record<string, unknown>

  const normalized: Record<string, unknown> = {}
  for (const field of schema ?? []) {
    const rawValue = field.name in provided ? provided[field.name] : field.default

    switch (field.type) {
      case 'text': {
        const value = rawValue ?? ''
        if (typeof value !== 'string') throw new ValidationError(`'${sectionName}.${field.name}' must be a string.`)
        const trimmed = value.trim()
        if (field.required && !trimmed) throw new ValidationError(`'${sectionName}.${field.name}' is required.`)
        normalized[field.name] = trimmed
        break
      }
      case 'select': {
        const value = rawValue ?? field.default
        if (typeof value !== 'string') throw new ValidationError(`'${sectionName}.${field.name}' must be a string.`)
        const validValues = new Set((field.options ?? []).map((option) => option.value))
        if (!validValues.has(value)) throw new ValidationError(`'${sectionName}.${field.name}' must be one of the allowed options.`)
        normalized[field.name] = value
        break
      }
      case 'checkbox':
        normalized[field.name] = coerceBool(rawValue, `${sectionName}.${field.name}`)
        break
      case 'number':
        if (typeof rawValue !== 'number' || Number.isNaN(rawValue)) throw new ValidationError(`'${sectionName}.${field.name}' must be numeric.`)
        normalized[field.name] = rawValue
        break
      default:
        throw new ValidationError(`Unsupported schema field type '${String(field.type)}'.`)
    }
  }

  return normalized
}

export function collectCommonSettingsSchemas(plugins: PluginRegistry): Map<string, PluginField[]> {
  const schemas = new Map<string, PluginField[]>()
  for (const plugin of plugins.values()) {
    const namespace = plugin.manifest.commonSettingsNamespace
    if (!namespace) continue
    if (!schemas.has(namespace)) schemas.set(namespace, plugin.manifest.commonSettingsSchema ?? [])
  }
  return schemas
}

export function normalizePluginCommonSettings(payload: unknown, plugins: PluginRegistry): Record<string, Record<string, unknown>> {
  const source = payload ?? {}
  if (typeof source !== 'object' || source === null || Array.isArray(source)) throw new ValidationError("'pluginCommonSettings' must be a JSON object.")
  const provided = source as Record<string, unknown>

  const normalized: Record<string, Record<string, unknown>> = {}
  for (const [namespace, schema] of collectCommonSettingsSchemas(plugins)) {
    normalized[namespace] = normalizeSchemaValues(provided[namespace], schema, `pluginCommonSettings.${namespace}`)
  }
  return normalized
}

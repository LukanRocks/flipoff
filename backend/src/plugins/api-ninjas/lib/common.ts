import { ValidationError } from '../../../board/normalize'
import { cpSlice } from '../../../util/text'
import type { PluginField } from '../../base'
import { fit, wrapText } from '../../lib/format'

export const API_NINJAS_QUOTES_URL = 'https://api.api-ninjas.com/v1/quotes'
export const API_NINJAS_CRYPTO_PRICE_URL = 'https://api.api-ninjas.com/v1/cryptoprice'
export const API_NINJAS_API_KEY_ENV = 'API_NINJAS_API_KEY'
export const API_NINJAS_COMMON_SETTINGS_NAMESPACE = 'quotes'

export const API_NINJAS_COMMON_SETTINGS_SCHEMA: PluginField[] = [
  {
    name: 'apiNinjasApiKey',
    label: 'API Ninjas API Key',
    type: 'text',
    default: '',
    placeholder: 'Required for API Ninjas plugins',
    helpText: 'Shared by all API Ninjas plugins.',
  },
]

export function currentUtcDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function compactAuthor(value: unknown, maxLength: number): string {
  const author = String(value || 'UNKNOWN')
    .trim()
    .toUpperCase()
  return cpSlice(author, 0, maxLength)
}

export function buildHeaders(apiKey: string): Record<string, string> {
  return { Accept: 'application/json', 'X-Api-Key': apiKey }
}

/** Admin-configured key wins over the environment variable, as in Python. */
export function resolveApiKey(commonSettings: Record<string, unknown> | null | undefined): string {
  const apiKey = commonSettings?.apiNinjasApiKey || process.env[API_NINJAS_API_KEY_ENV]
  if (!apiKey) throw new ValidationError(`${API_NINJAS_API_KEY_ENV} is not configured on the server.`)
  return String(apiKey)
}

/**
 * Lays a quote out with an attribution line beneath it, reserving two rows when
 * a title is present (the title plus its blank separator).
 */
export function buildQuoteLines(options: { quoteText: unknown; author: unknown; cols: number; rows: number; hasTitle: boolean }): string[] {
  const { quoteText, author, cols, rows, hasTitle } = options

  const availableRows = Math.max(0, rows - (hasTitle ? 2 : 0))
  if (availableRows <= 0) return []
  if (availableRows === 1) return wrapText(quoteText, cols, 1)

  const authorLine = fit(`- ${compactAuthor(author, Math.max(0, cols - 2))}`, cols)
  const quoteLines = wrapText(quoteText, cols, availableRows - 1)

  if (quoteLines.length === 0) return [authorLine]

  return [...quoteLines, authorLine].slice(0, availableRows)
}

export function errorFrom(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = (payload as Record<string, unknown>).error
    if (typeof error === 'string' && error) return error
  }
  return fallback
}

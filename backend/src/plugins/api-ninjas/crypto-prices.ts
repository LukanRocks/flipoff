import { ValidationError } from '../../board/normalize'
import type { PluginField, PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fetchJson, fit, formatAlignedPairs } from '../lib/format'
import { API_NINJAS_COMMON_SETTINGS_NAMESPACE, API_NINJAS_COMMON_SETTINGS_SCHEMA, API_NINJAS_CRYPTO_PRICE_URL, buildHeaders, errorFrom, resolveApiKey } from './lib/common'

const DEFAULT_SYMBOLS = ['BTC', 'ETH', 'SOL'] as const
const KNOWN_QUOTE_SUFFIXES = ['USDT', 'USDC', 'USD', 'BTC', 'ETH', 'EUR', 'GBP']
const SYMBOL_HELP = 'Enter a ticker like BTC or ETH. Plain tickers are requested as USD pairs.'

const symbolFields: PluginField[] = DEFAULT_SYMBOLS.map((symbol, index) => ({
  name: `symbol${index + 1}`,
  label: `Symbol ${index + 1}`,
  type: 'text',
  default: symbol,
  placeholder: symbol,
  required: true,
  helpText: SYMBOL_HELP,
}))

function sanitizeSymbol(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '') || 'BTC'
}

function hasQuoteSuffix(value: string): boolean {
  return KNOWN_QUOTE_SUFFIXES.some((suffix) => value.endsWith(suffix) && value.length > suffix.length)
}

/** Returns [displaySymbol, requestSymbol] pairs; bare tickers become USD pairs. */
function resolveSymbols(settings: Record<string, unknown>): [string, string][] {
  return DEFAULT_SYMBOLS.map((defaultSymbol, index) => {
    const rawValue = String(settings[`symbol${index + 1}`] || defaultSymbol)
      .trim()
      .toUpperCase()
    const displaySymbol = sanitizeSymbol(rawValue || defaultSymbol)
    return [displaySymbol, hasQuoteSuffix(displaySymbol) ? displaySymbol : `${displaySymbol}USD`]
  })
}

/**
 * Significant digits scale with magnitude, so a four-figure coin and a
 * fractional one both stay readable in the same column width.
 */
function formatPrice(value: unknown): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '--'

  const absolute = Math.abs(amount)
  if (absolute >= 1000) return amount.toFixed(2)
  const decimals = absolute >= 1 ? 4 : 6
  return amount.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '')
}

async function fetchPrice(apiKey: string, symbol: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const url = `${API_NINJAS_CRYPTO_PRICE_URL}?symbol=${encodeURIComponent(symbol)}`
  const { ok, payload } = await fetchJson(url, { headers: buildHeaders(apiKey), signal })
  if (!ok) throw new ValidationError(errorFrom(payload, `API Ninjas crypto price request failed for ${symbol}.`))
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new ValidationError(`API Ninjas returned an invalid price payload for ${symbol}.`)
  return payload as Record<string, unknown>
}

export const cryptoPricesPlugin: ScreenPlugin = {
  manifest: {
    id: 'api_ninjas_crypto_prices',
    name: 'Crypto Prices',
    description: 'Show live prices for three cryptocurrencies from API Ninjas.',
    defaultRefreshIntervalSeconds: 300,
    settingsSchema: symbolFields,
    designSchema: [{ name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: 'CRYPTO PRICES' }],
    commonSettingsNamespace: API_NINJAS_COMMON_SETTINGS_NAMESPACE,
    commonSettingsSchema: API_NINJAS_COMMON_SETTINGS_SCHEMA,
  },

  async refresh({ settings, design, context, commonSettings, signal }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const apiKey = resolveApiKey(commonSettings)
    const symbols = resolveSymbols(settings)
    const prices = await Promise.all(symbols.map(([, requestSymbol]) => fetchPrice(apiKey, requestSymbol, signal)))

    const rows = symbols.map(([displaySymbol], index) => [displaySymbol, formatPrice(prices[index]?.price)] as [string, string])
    const lines = withOptionalTitle(formatAlignedPairs(rows, context.cols), design, context)

    return { lines: lines.slice(0, context.rows), meta: { symbols: symbols.map(([displaySymbol]) => displaySymbol) } }
  },

  placeholderLines({ settings, design, context, error }: PluginPlaceholderArgs): string[] {
    const symbols = resolveSymbols(settings).map(([displaySymbol]) => displaySymbol)
    const lines = formatAlignedPairs(
      symbols.map((symbol) => [symbol, '--'] as [string, string]),
      context.cols,
    )
    if (error && context.rows > lines.length) lines.push(fit(String(error).toUpperCase(), context.cols))
    return withOptionalTitle(lines, design, context).slice(0, context.rows)
  },
}

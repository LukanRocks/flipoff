import { ValidationError } from '../../board/normalize'
import type { PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { getTitleLine, withOptionalTitle } from '../base'
import { fetchJson, fit } from '../lib/format'
import {
  API_NINJAS_COMMON_SETTINGS_NAMESPACE,
  API_NINJAS_COMMON_SETTINGS_SCHEMA,
  API_NINJAS_QUOTES_URL,
  buildHeaders,
  buildQuoteLines,
  errorFrom,
  resolveApiKey,
} from './lib/common'

export interface Quote {
  quote?: unknown
  author?: unknown
}

export async function fetchQuote(commonSettings: Record<string, unknown> | null | undefined, signal: AbortSignal): Promise<Quote> {
  const apiKey = resolveApiKey(commonSettings)
  const { ok, payload } = await fetchJson(API_NINJAS_QUOTES_URL, { headers: buildHeaders(apiKey), signal })
  if (!ok) throw new ValidationError(errorFrom(payload, 'API Ninjas quote request failed.'))
  if (!Array.isArray(payload) || payload.length === 0) throw new ValidationError('API Ninjas did not return a quote.')
  return payload[0] as Quote
}

export function quotePlaceholderLines({ design, context, error }: PluginPlaceholderArgs): string[] {
  const detail = (error || 'FETCHING').toUpperCase()
  return withOptionalTitle([fit(detail, context.cols), fit('QUOTE PENDING', context.cols)], design, context).slice(0, context.rows)
}

export const randomQuotePlugin: ScreenPlugin = {
  manifest: {
    id: 'api_ninjas_random_quote',
    name: 'Random Quote',
    description: 'Show a random quote from API Ninjas.',
    defaultRefreshIntervalSeconds: 3600,
    settingsSchema: [],
    designSchema: [{ name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: 'RANDOM QUOTE' }],
    commonSettingsNamespace: API_NINJAS_COMMON_SETTINGS_NAMESPACE,
    commonSettingsSchema: API_NINJAS_COMMON_SETTINGS_SCHEMA,
  },

  async refresh({ design, context, commonSettings, signal }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const quote = await fetchQuote(commonSettings, signal)

    const quoteLines = buildQuoteLines({
      quoteText: quote.quote,
      author: quote.author,
      cols: context.cols,
      rows: context.rows,
      hasTitle: Boolean(getTitleLine(design, context)),
    })

    return { lines: withOptionalTitle(quoteLines, design, context).slice(0, context.rows), meta: {} }
  },

  placeholderLines: quotePlaceholderLines,
}

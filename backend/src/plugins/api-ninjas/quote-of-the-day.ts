import type { PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { getTitleLine, withOptionalTitle } from '../base'
import { API_NINJAS_COMMON_SETTINGS_NAMESPACE, API_NINJAS_COMMON_SETTINGS_SCHEMA, buildQuoteLines, currentUtcDate } from './lib/common'
import { fetchQuote, quotePlaceholderLines } from './random-quote'

export const quoteOfTheDayPlugin: ScreenPlugin = {
  manifest: {
    id: 'api_ninjas_quote_of_the_day',
    name: 'Quote of the Day',
    description: 'Show one quote per UTC day from API Ninjas.',
    defaultRefreshIntervalSeconds: 3600,
    settingsSchema: [],
    designSchema: [{ name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: 'QUOTE OF DAY' }],
    commonSettingsNamespace: API_NINJAS_COMMON_SETTINGS_NAMESPACE,
    commonSettingsSchema: API_NINJAS_COMMON_SETTINGS_SCHEMA,
  },

  async refresh({ design, context, previousState, commonSettings, signal }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const today = currentUtcDate()
    const previous = previousState ?? {}

    // One quote per UTC day: replay the cached lines until the date rolls over,
    // regardless of how often the refresh interval fires.
    if (previous.quoteDate === today && Array.isArray(previous.lines) && previous.lines.length > 0) {
      return { lines: previous.lines as string[], meta: previous }
    }

    const quote = await fetchQuote(commonSettings, signal)

    const quoteLines = buildQuoteLines({
      quoteText: quote.quote,
      author: quote.author,
      cols: context.cols,
      rows: context.rows,
      hasTitle: Boolean(getTitleLine(design, context)),
    })
    const lines = withOptionalTitle(quoteLines, design, context).slice(0, context.rows)

    return { lines, meta: { quoteDate: today, lines } }
  },

  placeholderLines: quotePlaceholderLines,
}

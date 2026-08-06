import type { PluginRegistry, ScreenPlugin } from './base'
import { cryptoPricesPlugin } from './api-ninjas/crypto-prices'
import { quoteOfTheDayPlugin } from './api-ninjas/quote-of-the-day'
import { randomQuotePlugin } from './api-ninjas/random-quote'
import { githubOpenWorkPlugin } from './github/open-work'
import { githubRepoStatsPlugin } from './github/repo-stats'
import { openMeteoForecastPlugin } from './weather/open-meteo-forecast'

/**
 * Every available plugin. Python discovered these by scanning the package with
 * importlib; an explicit list survives compilation and bundling, and the type
 * checker sees each manifest.
 *
 * Adding a plugin: write the module, then add one import and one entry here.
 *
 * Sorted by plugin id, which is the order the admin dashboard renders and the
 * order the golden API responses were captured in.
 */
const PLUGIN_LIST: ScreenPlugin[] = [cryptoPricesPlugin, quoteOfTheDayPlugin, randomQuotePlugin, githubOpenWorkPlugin, githubRepoStatsPlugin, openMeteoForecastPlugin]

export function loadPlugins(): PluginRegistry {
  const registry: PluginRegistry = new Map()
  for (const plugin of [...PLUGIN_LIST].sort((a, b) => a.manifest.id.localeCompare(b.manifest.id))) {
    if (registry.has(plugin.manifest.id)) throw new Error(`Duplicate plugin id '${plugin.manifest.id}'.`)
    registry.set(plugin.manifest.id, plugin)
  }
  return registry
}

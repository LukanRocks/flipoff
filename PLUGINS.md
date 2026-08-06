# Plugin Development Guide

Plugins are server-side screen generators. A plugin declares a manifest describing how the
admin UI should configure it, fetches or computes data on the server, and renders the result
as a list of display lines. It can refresh on demand or on a schedule, persist state between
refreshes, and share settings with other plugins in the same family.

Plugins only exist when the backend is running. The static deployment has no plugin support.

## Where plugins live

```
backend/src/plugins/
├── base.ts                          Types, manifest serialisation, schema validation
├── index.ts                         The registry — every plugin is listed here
├── runtime.ts                       Refresh loops, timeouts, error handling
├── lib/format.ts                    Shared layout helpers (wrapping, column alignment)
├── weather/open-meteo-forecast.ts
├── github/{repo-stats,open-work}.ts + lib/common.ts
└── api-ninjas/{random-quote,quote-of-the-day,crypto-prices}.ts + lib/common.ts
```

Families with more than one plugin keep shared API clients and formatting in a `lib/common.ts`
beside them. This is encouraged — it keeps request handling in one place instead of spreading
it across sibling plugins.

## Registration

There is no filesystem scanning. `index.ts` holds an explicit list:

```ts
import { myPlugin } from './my-family/my-plugin'

const PLUGIN_LIST: ScreenPlugin[] = [
  // ...
  myPlugin,
]
```

Adding a plugin is one import and one array entry. The registry is keyed by `manifest.id` and
sorted by it, and a duplicate id throws at startup.

> **`manifest.id` is a persistent identifier.** It is written into `~/.flipoff/screens.json`
> for every configured screen. Renaming one orphans every screen using it — users get a
> validation error and have to recreate the screen. Treat ids as frozen once shipped. (The
> Open-Meteo plugin still carries `weatherbit_forecast` from an earlier implementation for
> exactly this reason.)

## Writing a plugin

A plugin is a plain object satisfying `ScreenPlugin`:

```ts
import type { PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fetchJson, fit } from '../lib/format'

export const myPlugin: ScreenPlugin = {
  manifest: {
    id: 'my_plugin',
    name: 'My Plugin',
    description: 'Shown in the admin plugin picker.',
    defaultRefreshIntervalSeconds: 300,
    settingsSchema: [{ name: 'city', label: 'City', type: 'text', required: true, placeholder: 'London' }],
    designSchema: [{ name: 'title', label: 'Title Override', type: 'text', default: '' }],
  },

  async refresh({ settings, design, context, signal }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const url = `https://example.com/api?q=${encodeURIComponent(String(settings.city))}`
    const { ok, payload } = await fetchJson(url, { signal })
    if (!ok) throw new Error('Upstream request failed.')

    const lines = withOptionalTitle([fit(String((payload as Record<string, unknown>).value), context.cols)], design, context)
    return { lines: lines.slice(0, context.rows) }
  },
}
```

### `refresh(args)`

| Argument         | What it is                                                        |
| ---------------- | ----------------------------------------------------------------- |
| `settings`       | Per-screen values, already validated against `settingsSchema`     |
| `design`         | Per-screen presentation values, validated against `designSchema`  |
| `context`        | `{ cols, rows }` for the board this screen belongs to             |
| `previousState`  | Whatever the last successful refresh returned as `meta`           |
| `commonSettings` | The family's shared settings, if `commonSettingsNamespace` is set |
| `signal`         | An `AbortSignal` with a 20s deadline covering the whole refresh   |

Return `{ lines, meta? }`. `lines` must fit the board — at most `context.rows` entries, each at
most `context.cols` **code points**. `meta` is persisted and handed back as `previousState`
next time; the Quote of the Day plugin uses it to serve one quote per UTC day.

Pass `signal` to every `fetch` you make. Without it a hung upstream stalls the refresh loop.

Throwing is the correct way to report failure. The runtime catches it, records the message as
`lastError`, keeps the previously cached lines on screen, and surfaces the error in the admin
dashboard.

### `placeholderLines(args)` (optional)

Rendered when a screen has no cached output yet, or has only ever failed. Receives `error`.
Omit it and `defaultPlaceholderLines` shows `NO DATA` or the error text.

## Schema fields

`settingsSchema`, `designSchema` and `commonSettingsSchema` drive the admin forms and are
validated server-side before a screen is saved. Field types:

| Type       | Validation                                        |
| ---------- | ------------------------------------------------- |
| `text`     | String, trimmed. `required: true` rejects empty   |
| `select`   | Must match one of `options[].value`               |
| `checkbox` | Must be a boolean                                 |
| `number`   | Must be numeric                                   |

Every field supports `label`, `default`, `placeholder` and `helpText`. Unknown keys in a saved
payload are dropped — the schema is the whole contract.

### Shared family settings

Set `commonSettingsNamespace` and `commonSettingsSchema` when several plugins need one value,
like an API key. The first plugin registering a namespace defines its schema; values are stored
once in `~/.flipoff/config.json` under `pluginCommonSettings` and passed to every plugin in the
family as `commonSettings`.

## Board text rules

The board renders one tile per code point, and lines are uppercased and clipped to
`context.cols`.

**Count code points, not UTF-16 units.** `'🏛️'.length` is 3 in JavaScript but occupies one
tile. Use `cpLength` / `cpSlice` from `util/text.ts`, or the helpers in `lib/format.ts`, which
already do:

- `fit(value, cols)` — clip to width
- `wrapText(value, cols, maxLines)` — word wrap, hard-splitting over-long words
- `formatAlignedPairs(rows, cols)` — two-column label/value layout that degrades gracefully

Plain `.slice()` will cut an emoji in half and render garbage.

## Runtime storage

Runtime data lives outside the repository, in `~/.flipoff` (override with `FLIPOFF_DATA_DIR`):

- **`config.json`** — board settings, shared plugin settings, admin password hash
- **`screens.json`** — manual screens, plugin screens, cached plugin output, plugin state, last
  refresh metadata

Plugin configuration is user-local and never checked in.

## Refresh behaviour

Each enabled plugin screen gets a self-rescheduling timer at its `refreshIntervalSeconds`
(chained timeouts, so a slow refresh cannot overlap itself). Screens also refresh on startup,
when a board's settings change, when screens are saved, and on demand from the admin dashboard.

Resizing a board discards cached plugin output rather than re-wrapping it — lines rendered for
the old width would be ragged at the new one, and the next refresh regenerates them.

## Testing a plugin

```bash
pnpm -C backend build
```

must be tsc-clean under `strict`. Then run the backend and add a screen using your plugin from
the admin dashboard, or refresh it directly:

```bash
curl -X POST "http://localhost:8080/api/admin/screens/<screenId>/refresh" -b cookies.txt
```

The response includes `previewLines` and `lastError`, which is the fastest way to see what your
plugin actually rendered.

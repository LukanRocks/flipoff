# FlipOff — project context for Claude

A split-flap (airport flip-board) display that runs in a browser. Fork of
[vakaobr/flipoff](https://github.com/vakaobr/flipoff), itself a fork of
[magnum6actual/flipoff](https://github.com/magnum6actual/flipoff).

## Stack

pnpm workspace: `board/` (the display) + `admin/` (the dashboard) + `backend/` (the
server). Prettier at root, no semicolons, single quotes, 180 print width.

- **`board/`** — vanilla ES modules under Vite. **No React, no Tailwind, no component
  framework.** The split-flap animation is hand-tuned DOM + CSS; keep it that way. This
  rule is about this package specifically, not the repo.
- **`admin/`** — the admin dashboard: React 19 + TypeScript + `react-router`, a separate
  Vite build. Different rules from the board on purpose — it is an ordinary form-and-table
  app. `admin build` runs `tsc --noEmit` first, because `vite build` strips types without
  checking them.
- **`backend/`** — Express + `ws`, state persisted as JSON files in `~/.flipoff`.

The backend serves `board/dist` and `admin/dist` (or `backend/public/{board,admin}` in a
container), not raw source — build both at least once or it has nothing to serve.

TypeScript 6 no longer loads `@types/*` into global scope automatically. `backend/tsconfig.json`
names them in `types: ["node"]`; dropping that breaks every `process` and `__dirname`.

## The two frontends share nothing, deliberately

Not one line of JavaScript is imported by both. The only duplicated file is `reset.css`,
which each package keeps its own copy of — and `admin.css` re-declares `box-sizing`, `body`
and the form-control font on top of it anyway. Do not "fix" that into a shared package: it
is 39 lines, and the whole point of the split is that these two applications have opposite
constraints and should not be able to reach into each other.

They meet only at the HTTP boundary — `/api` and `/ws`, contracts frozen below.

## Why the admin's Vite `base` is absolute and the board's is not

Both builds emit `dist/assets`, so they can share an origin only by not sharing a URL
prefix. `admin/vite.config.ts` sets `base: '/admin/'`, and `app.ts` mounts the two builds
at `/assets` and `/admin/assets`.

The board cannot do the same. It is served at `/` **and** at `/{boardSlug}` — one path
segment deep — so it needs `base: './'` for its asset URLs to land on `/assets` from both.
That is also why `routes/pages.ts` uses a `strict` router and redirects trailing slashes:
`/{slug}/` would resolve `./assets` one level too deep.

`noCacheStaticAssets` matches `/admin` by prefix rather than by listing paths, so
client-side admin routes stay uncacheable without anyone having to remember to add them.

## The board requires the backend — there is no static mode

`board/dist` is not deployable on its own. The display gets **everything** from the server:
grid, charset, accent colours, animation timing and the whole rotation all arrive in one
`/api/config` response, and live updates come over `/ws`.

There is deliberately no local fallback for **content**. If you find yourself adding a
"when the backend is missing" branch that renders messages, that is the thing this
architecture removed — a board showing built-in defaults hides an outage instead of
showing it.

The corollary is that `pnpm -C board dev` alone renders nothing useful. Run `pnpm dev` from
the root so the backend comes up alongside both Vite servers.

## The board reports its own connection state

`main.js` builds a board *before* asking the server anything, so waiting and failing happen
on the split-flap itself rather than only in the console. `statusScreen.js` holds those
screens — connecting, failure (headline, reason, retry countdown), reconnecting — as plain
`string[]`, which `Board._formatToGrid` centres like any other message.

That is only possible because **`Board` and `Tile` take their config as arguments**. They
used to import it, which chained them to a module-level `await` on `/api/config` and meant
no board could exist until the server answered. Keep them injected.

`BOOT_PRESENTATION` in `config.js` is the one sanctioned set of built-in defaults, and it
is deliberately narrow: grid, charset, accent colours, flip timings — never messages. It
comes from `localStorage` (written on every successful config fetch) or, failing that,
from `backend/config.json` inlined at build time by a Vite `define`, so a first-ever load
comes up at whatever size a fresh backend serves. Read `vite.config.ts`'s
`bootPresentation()` before changing either half.

Two things follow that are easy to get wrong:

- **Handing off to real content must interrupt.** The board is mid-animation on a status
  screen, so `rotator.start({ interrupt: true })` — without it, `next()` only queues into
  the board's `pendingLines`, returns false, and the rotation silently never starts.
- **A dropped socket does not blank the board immediately.** `OFFLINE_GRACE_MS` keeps the
  rotation up for ~20s first, because a container restart is over in about a second and
  wiping the display for each one is worse than the staleness it prevents.

## Tile sizing belongs to JavaScript, not to CSS

`fitBoard()` in `main.js` sets `--tile-size` and `--tile-gap` inline on every paint that
matters: after each `new Board(...)`, on `resize`, and on `fullscreenchange`. The values in
`board.css` are a first-paint fallback and nothing else.

This is not a preference. `cols` is server-configurable, so no `clamp()` can be right for
every grid — the old `clamp(36px, 4.2vw, 62px)` resolved to 60.48px tiles at 1440px wide,
which for 28 columns needs ~1810px inside a 1339px board, and `.board { overflow: hidden }`
silently ate about seven columns off the ends. Nothing errored; the message just quietly
lost its edges. Adding a breakpoint would only move which `cols` value breaks.

If you go measuring this yourself, do not trust `scrollWidth` — it is clipped by the same
overflow and under-reports. Read a tile's own `getBoundingClientRect()` and multiply.

Two consequences:

- **Measure, do not assume, what the chrome costs.** `chromeHeight()` adds up the live
  `offsetHeight` of `.loading-bar` and `.header` and publishes it as `--chrome-height`,
  which is where the top accent squares get their offset. It is a constant 63px today,
  because the navbar hides by fading and keeps its space — measuring it anyway means the
  3px progress line's height is not separately baked into a CSS rule.
- **`fitBoard` reads `board`, it does not close over it.** The boot board is replaced when
  the real config arrives, and a captured reference would go on styling the discarded one.

The nav icons are lucide paths pasted into `index.html` by hand, for the same reason
`board/` has no other runtime dependency. `.is-off` on `.icon-btn` picks which of a
button's icons shows; do not go back to selecting SVG children by position.

## There is one board page, and it hides its own chrome

`display.html` used to be a second entry point: the same board with no header, for
pointing a TV at. It is gone, with no redirect left behind. `.header` is `opacity: 0`
until hovered or focused, so `/` is already chrome-free whenever nobody is reaching for
the controls, and fullscreen is just that page bigger.

Two things this constrains:

- **The navbar fades, it does not `display: none`.** It keeps its 60px of layout in every
  mode, which is what stops the board's centring and the accent squares from jumping as it
  appears. It is also still hit-testable while invisible — that is what lets a pointer
  find it.
- **Nothing may hide the header in fullscreen again.** Hover is the only way back to the
  controls short of Escape, and a wall display in fullscreen is now the primary way this
  runs, not a special case.

## config.json is backend-only

`backend/config.json` holds grid size, animation timing, charset, accent colours and the
seed messages. **Only the server reads it**, once at startup; it reaches the browser
through `/api/config`. `FLIPOFF_CONFIG_PATH` overrides the location so a container can
bind-mount a different one without a rebuild.

`serializeConfig()` in `board/config.ts` is the single place that assembles that payload,
and it also feeds every `config_state` WebSocket frame. Adding a field there means adding
it to `main.js`'s `serializeLayout()` too if a running board cannot absorb the change
without being rebuilt.

## config_state must not reload the page

Plugin screens push a new `config_state` every time their output changes — for the clock,
twice a minute. `handleConfigState` in `main.js` therefore splits the payload: content
(`defaultMessages`, durations) is applied in place via `rotator.setMessages()`, and only a
layout change (grid, charset, palette, timing) reloads. The in-place path must never call
`rotator.start()` or reset `currentIndex`, or every clock tick visibly jumps the rotation
to a different screen.

## Time and weather are plugins, not client-side features

The browser used to render a clock and current weather itself from `{"dynamic": ...}`
markers in config.json, calling ipapi.co and open-meteo directly. Both are backend plugins
now (`datetime`, `open_meteo_current`). Server-side there is no per-viewer timezone or
geolocation, so both take explicit settings.

Plugin screens render plain `string[]`. There is no colour channel anywhere in the
pipeline — `PluginRefreshResult` → `resolveScreenLines` → `defaultMessages` → `Board` —
so re-adding one means widening all of them together.

A plugin whose output is derived rather than fetched sets `volatile: true` in its
manifest, and the refresh loop skips its `saveScreens` write. Without it the clock rewrites
`~/.flipoff/screens.json` roughly 2,900 times a day.

## State lives in JSON files, and the format is load-bearing

Board settings and screens persist as `~/.flipoff/{config,screens}.json`. These files were
originally written by a Python server using `json.dump(..., ensure_ascii=True)`, so non-ASCII
is escaped as `\uXXXX`. `dumpJson()` in `util/text.ts` reproduces that exactly — an existing
install upgrades with a zero-byte diff. Do not swap it for plain `JSON.stringify`.

Admin password hashes are bcrypt `$2b$`, written by Python's `bcrypt` and read by `bcryptjs`.
They stay compatible; changing the hashing library would lock existing users out.

## Board text rules

Everything on the board is uppercase, clipped to `grid.cols` per line and `grid.rows`
lines. Two things bite here:

- **Count code points, not UTF-16 units.** Messages are full of emoji — `'🏛️'.length` is
  3 in JS but the board renders it as one tile. Use `[...line].length` and
  `[...line].slice(0, cols).join('')`, never `.length` / `.slice()` directly, anywhere a
  line is measured or clipped.
- `charset` is an **animation** concern, not a filter. Nothing rejects characters outside
  it: `Tile._buildVisiblePath` flips through a few random charset characters and lands on
  whatever it was given, which is how emoji render at all. `Board._formatToGrid` segments
  lines with `Intl.Segmenter` so a multi-code-point emoji occupies one tile.

## The admin's CSS is the spec, not the components

`admin/src/css/admin.css` came over from the imperative admin **unchanged**, and the React
components are written to emit the markup it already styles. That makes the rewrite
checkable: if a page looks different, it is a bug, not a redesign. Two ways to break it
that are not obvious from reading a component:

- **A class name is a contract.** Renaming one, or flattening a wrapper that looks
  redundant, silently changes layout. `HomePage`'s rotation rows really do nest
  `.rotation-item-head` inside `.stack.compact-stack` inside another `.rotation-item-head`
  — the outer flex sizes to its content so the inner one can space-between across a
  narrower width. Flatten it and the title slams into the right edge.
- **One rule keys off an `id`.** `.settings-panel #settings-form` widens the form gap from
  20px to 30px. It is the only id-based selector in the file; drop the id and the Settings
  page quietly loses 50px of height.

## Screen drafts are local until you press Save

The Screens page edits a `drafts` array held in `App`, not in the page — the imperative
admin kept it in module state and both Settings and the board switcher refuse to act while
it is dirty, so unmounting it on navigation would change behaviour.

Only `POST /screens/:id/refresh` acts immediately, and it is blocked while dirty because
the server would refresh a configuration different from the one on screen. Everything else
— add, edit, reorder, delete — is local until **Save Screens**.

`useAdminData` refetches the whole snapshot after every mutation rather than patching
state, which is what the old `loadAdminState()` did across the same six endpoints. That is
why there is no query library and nothing to invalidate. The `requestRef` counter exists
because switching boards quickly can interleave two in-flight snapshots.

## API and WebSocket contracts are frozen

`admin/src/api/` and `board/src/RemoteMessageSync.js` are hand-written against the existing
routes and the `/ws` event shape (`{type, payload}` with `message_state` / `config_state`).
Server changes must preserve those paths and payloads unless you are also updating both
clients.

`admin/src/api/types.ts` mirrors the backend's `buildAdmin*Response`,
`serializeScreenForAdmin` and `serializeManifest` by hand. It has to: those all return
`Record<string, unknown>`, so importing them across the package boundary would check
nothing. Change a serializer and change that file in the same commit.

Plugin `plugin_id` values are persisted in `~/.flipoff/screens.json`. Renaming one orphans
a user's screen — treat them as a stable identifier.

## Ports

`board` dev server 5173 (proxies `/api` and `/ws` to the backend, and `/admin` to the admin
dev server), `admin` 5174, backend 8080. The dev
server is useless without the backend — see above.

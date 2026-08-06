# FlipOff — project context for Claude

A split-flap (airport flip-board) display that runs in a browser. Fork of
[vakaobr/flipoff](https://github.com/vakaobr/flipoff), itself a fork of
[magnum6actual/flipoff](https://github.com/magnum6actual/flipoff).

## Stack

pnpm workspace: `web/` (frontend) + `backend/` (server). Prettier at root, no semicolons,
single quotes, 180 print width.

- **`web/`** — vanilla ES modules under Vite. **No React, no Tailwind, no component
  framework.** The split-flap animation is hand-tuned DOM + CSS; keep it that way.
- **`backend/`** — Express + `ws`, state persisted as JSON files in `~/.flipoff`.

The backend serves `web/dist` (or `backend/public` in a container), not raw source — run
`pnpm -C web build` at least once or it has nothing to serve.

TypeScript 6 no longer loads `@types/*` into global scope automatically. `backend/tsconfig.json`
names them in `types: ["node"]`; dropping that breaks every `process` and `__dirname`.

## The two runtime modes — read this before touching config or fetch code

FlipOff runs **with or without a backend**, and both paths must keep working.

1. **Static** — `web/dist` served by anything (GitHub Pages, `npx serve`, nginx). No
   server. `RemoteMessageSync` probes `/api/config`, gets nothing, sets
   `_backendAvailable = false`, and the app runs entirely on `config.json` + client-side
   APIs. The Admin button stays hidden.
2. **Backend** — the server serves the built bundle and adds the admin dashboard,
   plugins, multi-board, REST API, and WebSocket push.

Anything server-only is progressive enhancement. Never make the display depend on a
backend response.

## config.json is shared, and it is fetched at runtime

`web/public/config.json` holds grid size, animation timing, charset, accent colours, and
the message rotation. It is read **twice, independently**:

- the browser fetches it at startup (`web/src/constants.js`, top-level `await`)
- the backend reads the same file for its defaults

It lives in `public/` and not `src/` on purpose: it must land at the bundle root as plain
JSON so a user can edit it in a deployed build without rebuilding. Do not `import` it.

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
- Characters outside `charset` fall back to a space in the client formatter
  (`boardFormatter.js`); emoji are handled separately by `Tile.js`.

## API and WebSocket contracts are frozen

`web/src/admin.js` (1,700+ lines) and `web/src/RemoteMessageSync.js` are hand-written
against the existing routes and the `/ws` event shape (`{type, payload}` with
`message_state` / `config_state`). Server changes must preserve those paths and payloads
unless you are also updating both clients.

Plugin `plugin_id` values are persisted in `~/.flipoff/screens.json`. Renaming one orphans
a user's screen — treat them as a stable identifier.

## Ports

`web` dev server 5173 (proxies `/api`, `/ws`, `/admin` to the backend), backend 8080.

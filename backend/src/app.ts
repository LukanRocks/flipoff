import { join } from 'node:path'

import cookieParser from 'cookie-parser'
import express, { type Express } from 'express'

import { ADMIN_ROOT, BOARD_ROOT } from './config/paths'
import { noCacheStaticAssets } from './middleware/no-cache'
import type { PluginRegistry } from './plugins/base'
import type { PluginRuntime } from './plugins/runtime'
import { createAdminRouter } from './routes/admin'
import { createApiRouter } from './routes/api'
import { createPagesRouter } from './routes/pages'
import type { AppState } from './types'
import type { WsHub } from './ws/hub'

export function createApp(state: AppState, plugins: PluginRegistry, hub: WsHub, runtime: PluginRuntime): Express {
  const app = express()

  // `secure` on the session cookie depends on this when running behind a proxy.
  app.set('trust proxy', true)
  // Trailing slashes must stay distinct so the page router can redirect them;
  // see the comment in routes/pages.ts.
  app.set('strict routing', true)
  app.disable('x-powered-by')

  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(noCacheStaticAssets)

  app.use('/api/admin', createAdminRouter(state, plugins, hub, runtime))
  app.use('/api', createApiRouter(state, plugins, hub))

  // Hashed build output. Long-lived caching is safe because the hash changes
  // with the content. One mount per frontend: both builds name their output
  // directory `assets`, so they can only share an origin by not sharing a URL
  // prefix. The admin's Vite `base` is what puts its own assets under /admin/.
  app.use('/assets', express.static(join(BOARD_ROOT, 'assets'), { fallthrough: true, maxAge: '1y', immutable: true }))
  app.use('/admin/assets', express.static(join(ADMIN_ROOT, 'assets'), { fallthrough: true, maxAge: '1y', immutable: true }))

  app.use(createPagesRouter(state))

  app.use((request, response) => {
    if (request.path.startsWith('/api/')) {
      response.status(404).json({ error: 'Not found.' })
      return
    }
    response.sendStatus(404)
  })

  return app
}

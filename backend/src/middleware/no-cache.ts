import type { NextFunction, Request, Response } from 'express'

const NO_CACHE_PATHS = new Set(['/', '/index.html', '/control.html', '/display.html', '/config.json', '/admin', '/admin/', '/screenshot.png', '/favicon.ico'])

/**
 * Keeps the HTML shells, config.json and board pages uncacheable so an edited
 * config or a redeployed bundle shows up on the next refresh rather than after
 * a hard reload. Hashed build assets under /assets are exempt -- their names
 * change when their contents do, so they are safe to cache.
 */
export function noCacheStaticAssets(request: Request, response: Response, next: NextFunction): void {
  const path = request.path
  const isBoardPage = path.split('/').length === 2 && path !== '/' && path !== '/admin'

  if (request.method === 'GET' && (NO_CACHE_PATHS.has(path) || isBoardPage)) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    response.setHeader('Pragma', 'no-cache')
    response.setHeader('Expires', '0')
  }

  next()
}

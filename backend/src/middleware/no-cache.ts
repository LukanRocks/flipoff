import type { NextFunction, Request, Response } from 'express'

const NO_CACHE_PATHS = new Set(['/', '/index.html', '/display.html', '/screenshot.png', '/favicon.ico'])

/**
 * Keeps the HTML shells and board pages uncacheable so a redeployed bundle
 * shows up on the next refresh rather than after a hard reload. Hashed build
 * assets are exempt -- their names change when their contents do, so they are
 * safe to cache.
 */
export function noCacheStaticAssets(request: Request, response: Response, next: NextFunction): void {
  const path = request.path
  // Everything under /admin is the admin shell, whatever the sub-path, except
  // its hashed assets. Matching the prefix rather than listing paths means
  // client-side admin routes stay uncacheable without touching this file.
  const isAdminPage = path === '/admin' || (path.startsWith('/admin/') && !path.startsWith('/admin/assets/'))
  // Any single segment is a candidate board slug. '/admin' matches this shape
  // too, but it is already covered above and both branches agree, so there is
  // nothing to exclude.
  const isBoardPage = path.split('/').length === 2 && path !== '/'

  if (request.method === 'GET' && (NO_CACHE_PATHS.has(path) || isAdminPage || isBoardPage)) {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    response.setHeader('Pragma', 'no-cache')
    response.setHeader('Expires', '0')
  }

  next()
}

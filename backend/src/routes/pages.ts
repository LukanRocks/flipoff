import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { Router, type Request, type Response } from 'express'

import { coerceSlug } from '../board/normalize'
import { getBoard } from '../board/registry'
import { ADMIN_ROOT, BOARD_ROOT } from '../config/paths'
import type { AppState } from '../types'
import { asyncRoute, jsonError } from './helpers'

/** Which package to build, named in the 503 when a frontend is missing. */
const PACKAGE_OF: Record<string, string> = { [BOARD_ROOT]: 'board', [ADMIN_ROOT]: 'admin' }

function sendPage(response: Response, root: string, filename: string): void {
  const path = join(root, filename)
  if (!existsSync(path)) {
    const packageName = PACKAGE_OF[root] ?? 'board'
    response.status(503).type('text/plain').send(`FlipOff frontend is not built. Run \`pnpm -C ${packageName} build\`.\nExpected: ${path}`)
    return
  }
  response.sendFile(path)
}

/**
 * The bundle uses relative asset URLs (vite `base: './'`), which only resolve
 * when the page has no trailing slash. Normalise rather than serving a page
 * whose scripts would 404.
 */
function trailingSlashRedirect(request: Request, response: Response): void {
  response.redirect(301, request.path.replace(/\/+$/, '') || '/')
}

export function createPagesRouter(state: AppState): Router {
  // `strict` keeps '/admin' and '/admin/' as distinct routes. Without it Express
  // collapses the trailing slash, the redirects below never run, and the page is
  // served at a URL where its relative asset paths resolve one level too deep.
  const router = Router({ strict: true })

  router.get('/', (_request, response) => sendPage(response, BOARD_ROOT, 'index.html'))
  router.get('/index.html', (_request, response) => sendPage(response, BOARD_ROOT, 'index.html'))
  router.get('/display.html', (_request, response) => sendPage(response, BOARD_ROOT, 'display.html'))

  // The admin is a separate package, so its own index.html -- same filename as
  // the board's, different root.
  router.get('/admin', (_request, response) => sendPage(response, ADMIN_ROOT, 'index.html'))
  router.get('/admin/', trailingSlashRedirect)

  router.get('/screenshot.png', (_request, response) => {
    const path = join(BOARD_ROOT, 'images', 'screenshot.png')
    if (!existsSync(path)) {
      response.sendStatus(404)
      return
    }
    response.sendFile(path)
  })

  router.get('/favicon.ico', (_request, response) => response.sendStatus(204))

  // Board pages last, so a real route always wins over a board slug.
  router.get(
    '/:boardSlug',
    asyncRoute(async (request, response) => {
      let boardSlug: string
      try {
        boardSlug = coerceSlug(String(request.params.boardSlug ?? ''), 'board_slug')
      } catch (error) {
        jsonError(response, error instanceof Error ? error.message : String(error), 404)
        return
      }

      if (getBoard(state.registry, boardSlug) === null) {
        jsonError(response, 'Board not found.', 404)
        return
      }
      sendPage(response, BOARD_ROOT, 'index.html')
    }),
  )
  router.get('/:boardSlug/', trailingSlashRedirect)

  return router
}

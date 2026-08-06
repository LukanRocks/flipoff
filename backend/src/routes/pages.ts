import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { Router, type Request, type Response } from 'express'

import { coerceSlug } from '../board/normalize'
import { getBoard } from '../board/registry'
import { WEB_ROOT } from '../config/paths'
import type { AppState } from '../types'
import { asyncRoute, jsonError } from './helpers'

function sendPage(response: Response, filename: string): void {
  const path = join(WEB_ROOT, filename)
  if (!existsSync(path)) {
    response.status(503).type('text/plain').send(`FlipOff frontend is not built. Run \`pnpm -C web build\`.\nExpected: ${path}`)
    return
  }
  response.sendFile(path)
}

/**
 * The bundle uses relative asset URLs (vite `base: './'`) so it can also deploy
 * to a GitHub Pages sub-path. Those only resolve when the page has no trailing
 * slash, so normalise rather than serving a page whose scripts would 404.
 */
function trailingSlashRedirect(request: Request, response: Response): void {
  response.redirect(301, request.path.replace(/\/+$/, '') || '/')
}

export function createPagesRouter(state: AppState): Router {
  // `strict` keeps '/admin' and '/admin/' as distinct routes. Without it Express
  // collapses the trailing slash, the redirects below never run, and the page is
  // served at a URL where its relative asset paths resolve one level too deep.
  const router = Router({ strict: true })

  router.get('/', (_request, response) => sendPage(response, 'index.html'))
  router.get('/index.html', (_request, response) => sendPage(response, 'index.html'))
  router.get('/control.html', (_request, response) => sendPage(response, 'control.html'))
  router.get('/display.html', (_request, response) => sendPage(response, 'display.html'))
  router.get('/admin', (_request, response) => sendPage(response, 'admin.html'))
  router.get('/admin/', trailingSlashRedirect)

  router.get('/config.json', (_request, response) => {
    const path = join(WEB_ROOT, 'config.json')
    if (!existsSync(path)) {
      response.sendStatus(404)
      return
    }
    response.sendFile(path)
  })

  router.get('/screenshot.png', (_request, response) => {
    const path = join(WEB_ROOT, 'images', 'screenshot.png')
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
      sendPage(response, 'index.html')
    }),
  )
  router.get('/:boardSlug/', trailingSlashRedirect)

  return router
}

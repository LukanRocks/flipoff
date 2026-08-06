import type { Request, Response } from 'express'

import { coerceSlug, ValidationError } from '../board/normalize'
import { getBoard } from '../board/registry'
import { SESSION_COOKIE, hasSessionToken } from '../auth/password'
import type { AppState, BoardState } from '../types'

/** Signals an HTTP status alongside the message; anything else becomes a 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function jsonError(response: Response, message: string, status = 400): Response {
  return response.status(status).json({ error: message })
}

/**
 * Wraps an async handler so a rejected promise becomes a JSON error response
 * rather than an unhandled rejection. Express 5 forwards rejections to the
 * error middleware, but going through one helper keeps the shape consistent.
 */
export function asyncRoute(handler: (request: Request, response: Response) => Promise<unknown>) {
  return (request: Request, response: Response): void => {
    handler(request, response).catch((error: unknown) => {
      if (response.headersSent) return
      if (error instanceof HttpError) {
        jsonError(response, error.message, error.status)
        return
      }
      if (error instanceof ValidationError) {
        jsonError(response, error.message, 400)
        return
      }
      console.error('[flipoff] Unhandled error:', error)
      jsonError(response, 'Internal server error.', 500)
    })
  }
}

export function resolveBoardFromQuery(state: AppState, request: Request, required = false): BoardState | null {
  const rawSlug = request.query.board
  let boardSlug: string | null = null

  if (rawSlug !== undefined) {
    if (typeof rawSlug !== 'string') throw new HttpError(400, "'board' must be a string.")
    try {
      boardSlug = coerceSlug(rawSlug, 'board')
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error))
    }
  }

  const board = getBoard(state.registry, boardSlug)
  if (board === null && required) throw new HttpError(404, 'Board not found.')
  return board
}

export function isAuthenticated(state: AppState, request: Request): boolean {
  return hasSessionToken(state.sessionTokens, request.cookies?.[SESSION_COOKIE] as string | undefined)
}

export function requireAdmin(state: AppState, request: Request): void {
  if (!isAuthenticated(state, request)) throw new HttpError(401, 'Authentication required.')
}

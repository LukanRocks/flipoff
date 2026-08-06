import { Router } from 'express'

import { serializeConfig } from '../board/config'
import { coerceSlug, normalizePayload, trimMessageLines } from '../board/normalize'
import { getBoard, serializeMessageState, serializeScreenForAdmin } from '../board/registry'
import { saveScreens, syncBoardDisplayMessages } from '../board/screens'
import type { PluginRegistry } from '../plugins/base'
import type { AppState, BoardState } from '../types'
import { utcNow } from '../util/text'
import type { WsHub } from '../ws/hub'
import { HttpError, asyncRoute, jsonError, resolveBoardFromQuery } from './helpers'

/** An API override reverts to the rotation after apiMessageDurationSeconds. */
function scheduleOverrideClear(state: AppState, board: BoardState, hub: WsHub): void {
  cancelOverrideTimer(board)
  board.overrideTimer = setTimeout(() => {
    clearOverride(state, board.config.slug, hub)
  }, board.config.apiMessageDurationSeconds * 1000)
}

export function cancelOverrideTimer(board: BoardState): void {
  if (board.overrideTimer !== null) {
    clearTimeout(board.overrideTimer)
    board.overrideTimer = null
  }
}

export function clearOverride(state: AppState, boardSlug: string, hub: WsHub, broadcast = true): void {
  const board = getBoard(state.registry, boardSlug)
  if (board === null) return

  cancelOverrideTimer(board)
  if (!board.messageState.hasOverride) return

  board.messageState = { hasOverride: false, lines: Array(board.config.rows).fill(''), updatedAt: null }
  if (broadcast) hub.broadcastMessageState(boardSlug)
}

export function createApiRouter(state: AppState, plugins: PluginRegistry, hub: WsHub): Router {
  const router = Router()

  router.get(
    '/config',
    asyncRoute(async (request, response) => {
      const board = resolveBoardFromQuery(state, request, true)!
      syncBoardDisplayMessages(board, plugins)
      response.json(serializeConfig(board.config))
    }),
  )

  router.get(
    '/message',
    asyncRoute(async (request, response) => {
      const board = resolveBoardFromQuery(state, request, true)!
      response.json(serializeMessageState(board.messageState))
    }),
  )

  router.post(
    '/message',
    asyncRoute(async (request, response) => {
      const payload: unknown = request.body
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        jsonError(response, 'Request body must be valid JSON.')
        return
      }
      const body = payload as Record<string, unknown>

      const rawBoardSlug = body.boardSlug
      const board = getBoard(state.registry, rawBoardSlug === null || rawBoardSlug === undefined ? null : coerceSlug(rawBoardSlug, 'boardSlug'))
      if (board === null) throw new HttpError(404, 'Board not found.')

      const normalizedLines = normalizePayload(body, board.config)
      const rawScreenSlug = body.screenSlug

      // Targeting a screen edits the rotation itself; without one the message
      // is a temporary override on top of it.
      if (rawScreenSlug !== null && rawScreenSlug !== undefined) {
        const screenSlug = coerceSlug(rawScreenSlug, 'screenSlug')
        const screen = board.screens.find((candidate) => candidate.slug === screenSlug)
        if (!screen) throw new HttpError(404, 'Screen not found.')
        if (screen.type !== 'manual') throw new HttpError(400, 'Only manual screens support API screen updates.')

        screen.lines = trimMessageLines(normalizedLines)
        saveScreens(state.screensPath, state.registry.boards)
        syncBoardDisplayMessages(board, plugins)
        hub.broadcastDisplayConfig(board.config.slug)
        response.json({ boardSlug: board.config.slug, screen: serializeScreenForAdmin(screen, board.config, plugins) })
        return
      }

      board.messageState = { hasOverride: true, lines: [...normalizedLines], updatedAt: utcNow() }
      scheduleOverrideClear(state, board, hub)
      hub.broadcastMessageState(board.config.slug)
      response.json(serializeMessageState(board.messageState))
    }),
  )

  router.delete(
    '/message',
    asyncRoute(async (request, response) => {
      const board = resolveBoardFromQuery(state, request, true)!
      clearOverride(state, board.config.slug, hub)
      response.json(serializeMessageState(board.messageState))
    }),
  )

  return router
}

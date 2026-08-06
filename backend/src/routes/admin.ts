import { Router } from 'express'

import { SESSION_COOKIE, createSessionToken, hashPassword, verifyPassword } from '../auth/password'
import { defaultDisplayConfig, saveBoardSettings } from '../board/config'
import { coerceBool, coerceOptionalString, coerceSlug, makeUniqueSlug, normalizeRuntimeSettingsPayload, suggestSlug } from '../board/normalize'
import {
  buildAdminBoardsResponse,
  buildAdminConfigResponse,
  buildAdminScreensResponse,
  buildDefaultBoardState,
  emptyMessageState,
  getDefaultBoard,
  getScreenById,
  serializeScreenForAdmin,
} from '../board/registry'
import { normalizeScreensPayload, reconcileScreensForConfigChange, saveScreens, syncBoardDisplayMessages } from '../board/screens'
import { normalizePluginCommonSettings, type PluginRegistry } from '../plugins/base'
import type { PluginRuntime } from '../plugins/runtime'
import type { AppState, Screen } from '../types'
import type { WsHub } from '../ws/hub'
import { cancelOverrideTimer } from './api'
import { HttpError, asyncRoute, jsonError, requireAdmin, resolveBoardFromQuery } from './helpers'

const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

function requireObjectBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new HttpError(400, 'Request body must be valid JSON.')
  return body as Record<string, unknown>
}

export function createAdminRouter(state: AppState, plugins: PluginRegistry, hub: WsHub, runtime: PluginRuntime): Router {
  const router = Router()

  const persist = (): void => {
    saveBoardSettings(state.configPath, state.registry, state.adminPassword.passwordHash)
    saveScreens(state.screensPath, state.registry.boards)
  }

  // ── Session ────────────────────────────────────────────────────────

  router.post(
    '/session',
    asyncRoute(async (request, response) => {
      const body = requireObjectBody(request.body)
      const password = body.password

      if (typeof password !== 'string' || !verifyPassword(password, state.adminPassword.passwordHash)) {
        jsonError(response, 'Invalid password.', 401)
        return
      }

      const token = createSessionToken(state.sessionTokens)
      response.cookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: request.secure,
        maxAge: SESSION_MAX_AGE_MS,
        path: '/',
      })
      response.json({ authenticated: true })
    }),
  )

  router.delete(
    '/session',
    asyncRoute(async (request, response) => {
      const token = request.cookies?.[SESSION_COOKIE] as string | undefined
      if (token) state.sessionTokens.delete(token)
      response.clearCookie(SESSION_COOKIE, { path: '/' })
      response.json({ authenticated: false })
    }),
  )

  // ── Boards ─────────────────────────────────────────────────────────

  router.get(
    '/boards',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      response.json(buildAdminBoardsResponse(state.registry))
    }),
  )

  router.post(
    '/boards',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      await state.withAdminLock(async () => {
        const body = requireObjectBody(request.body)
        const registry = state.registry

        const name = coerceOptionalString(body.name, 'name') || 'New Board'
        let slug: string
        if (body.slug === null || body.slug === undefined) {
          slug = makeUniqueSlug(suggestSlug(name, 'board'), new Set(registry.boards.keys()))
        } else {
          slug = coerceSlug(body.slug, 'slug')
          if (registry.boards.has(slug)) throw new HttpError(400, `Board slug '${slug}' already exists.`)
        }

        // New boards inherit the default board's geometry and timing.
        const template = getDefaultBoard(registry).config
        const config = {
          ...defaultDisplayConfig(slug, name),
          cols: template.cols,
          rows: template.rows,
          defaultMessages: [],
          messageDurationSeconds: template.messageDurationSeconds,
          apiMessageDurationSeconds: template.apiMessageDurationSeconds,
        }
        registry.boards.set(slug, buildDefaultBoardState(config, plugins))

        persist()
        runtime.restartLoops(slug)
        response.json(buildAdminBoardsResponse(registry))
      })
    }),
  )

  router.delete(
    '/boards/:boardSlug',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      await state.withAdminLock(async () => {
        const boardSlug = coerceSlug(String(request.params.boardSlug ?? ''), 'board_slug')
        const registry = state.registry

        const board = registry.boards.get(boardSlug)
        if (!board) throw new HttpError(404, 'Board not found.')
        if (registry.boards.size <= 1) throw new HttpError(400, 'At least one board is required.')

        registry.boards.delete(boardSlug)
        cancelOverrideTimer(board)
        runtime.cancelLoops(board)

        if (registry.defaultBoardSlug === boardSlug) registry.defaultBoardSlug = registry.boards.keys().next().value!

        persist()
        response.json(buildAdminBoardsResponse(registry))
      })
    }),
  )

  // ── Board config ───────────────────────────────────────────────────

  router.get(
    '/config',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      const board = resolveBoardFromQuery(state, request, true)!
      syncBoardDisplayMessages(board, plugins)
      response.json(buildAdminConfigResponse(board, state.registry.defaultBoardSlug, Boolean(state.adminPassword.passwordHash)))
    }),
  )

  router.put(
    '/config',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      const board = resolveBoardFromQuery(state, request, true)!

      await state.withAdminLock(async () => {
        const body = requireObjectBody(request.body)
        const registry = state.registry
        const oldSlug = board.config.slug

        const settings = normalizeRuntimeSettingsPayload(body)
        const nextName = coerceOptionalString(body.name, 'name') || board.config.name
        const nextSlug = coerceSlug(body.slug ?? board.config.slug, 'slug')
        const isDefault = coerceBool(body.isDefault ?? board.config.slug === registry.defaultBoardSlug, 'isDefault')
        const submittedAdminPassword = coerceOptionalString(body.adminPassword, 'adminPassword')

        if (nextSlug !== oldSlug && registry.boards.has(nextSlug)) throw new HttpError(400, `Board slug '${nextSlug}' already exists.`)

        // Re-validate before mutating, so a rejected resize leaves state intact.
        const reconciledScreens = reconcileScreensForConfigChange(board.screens, settings.cols, settings.rows, plugins)

        board.config = { ...board.config, slug: nextSlug, name: nextName, ...settings }
        board.screens = reconciledScreens
        board.messageState = emptyMessageState(settings.rows)

        if (nextSlug !== oldSlug) {
          // Rebuild the map so insertion order (and therefore the saved board
          // order) is preserved across a rename.
          const entries = [...registry.boards.entries()].map(([slug, value]) => (slug === oldSlug ? ([nextSlug, value] as const) : ([slug, value] as const)))
          registry.boards = new Map(entries)
          if (registry.defaultBoardSlug === oldSlug) registry.defaultBoardSlug = nextSlug
        }

        if (isDefault) registry.defaultBoardSlug = nextSlug

        if (submittedAdminPassword) {
          state.adminPassword.passwordHash = hashPassword(submittedAdminPassword)
          state.adminPassword.generated = false
        }

        persist()

        await runtime.refreshAllForBoard(nextSlug, false)
        runtime.restartLoops(nextSlug)
        hub.broadcastDisplayConfig(nextSlug)
        hub.broadcastMessageState(nextSlug)

        response.json(buildAdminConfigResponse(board, registry.defaultBoardSlug, Boolean(state.adminPassword.passwordHash)))
      })
    }),
  )

  // ── Screens ────────────────────────────────────────────────────────

  router.get(
    '/screens',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      const board = resolveBoardFromQuery(state, request, true)!
      response.json(buildAdminScreensResponse(state.registry, board, plugins))
    }),
  )

  router.put(
    '/screens',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      const board = resolveBoardFromQuery(state, request, true)!

      await state.withAdminLock(async () => {
        const body = requireObjectBody(request.body)

        const existingScreens = new Map<string, Screen>(board.screens.map((screen) => [screen.id, screen]))
        const normalizedScreens = normalizeScreensPayload(body, board.config, plugins, existingScreens)
        const commonSettings = normalizePluginCommonSettings(body.pluginCommonSettings, plugins)

        board.screens = normalizedScreens
        state.registry.commonSettings = commonSettings

        persist()

        await runtime.refreshAllForBoard(board.config.slug, false)
        runtime.restartLoops(board.config.slug)
        hub.broadcastDisplayConfig(board.config.slug)

        response.json(buildAdminScreensResponse(state.registry, board, plugins))
      })
    }),
  )

  router.post(
    '/screens/:screenId/refresh',
    asyncRoute(async (request, response) => {
      requireAdmin(state, request)
      const board = resolveBoardFromQuery(state, request, true)!

      const screenId = String(request.params.screenId ?? '')
      const screen = getScreenById(board, screenId)
      if (screen === null) throw new HttpError(404, 'Screen not found.')
      if (screen.type !== 'plugin') throw new HttpError(400, 'Only plugin screens support manual refresh.')

      await runtime.refreshScreen(board.config.slug, screenId, true)
      const refreshed = getScreenById(board, screenId)!
      response.json({ screen: serializeScreenForAdmin(refreshed, board.config, plugins) })
    }),
  )

  return router
}

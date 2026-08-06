import type { AdminConfig, AdminSnapshot, BoardsResponse, MessageState, Screen, ScreensResponse } from './types'

/**
 * Every admin request goes through here.
 *
 * The API paths and payloads are frozen -- `backend/src/routes/admin.ts` and
 * `api.ts` are the contract, and the board's own client speaks the same /ws
 * events. Nothing in this file may change a URL or a body shape.
 */

/** A 401 anywhere means the session is gone; the caller shows the login shell. */
export class UnauthorizedError extends Error {
  constructor() {
    super('Not signed in.')
    this.name = 'UnauthorizedError'
  }
}

/** Carries the server's own message, which is usually more specific than anything we could invent. */
export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string }
    return payload.error || fallback
  } catch {
    return fallback
  }
}

async function request<T>(path: string, init: RequestInit = {}, fallbackError = 'Request failed.'): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    // A dead server and a rejected request are different failures; only the
    // latter carries a message worth showing.
    throw new ApiError('Unable to reach the admin API.')
  }

  if (response.status === 401) throw new UnauthorizedError()
  if (!response.ok) throw new ApiError(await readError(response, fallbackError))

  return (await response.json()) as T
}

function jsonBody(body: unknown): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

const boardQuery = (boardSlug: string | null): string => (boardSlug ? `?board=${encodeURIComponent(boardSlug)}` : '')

// ── Session ──────────────────────────────────────────────────────────

export function login(password: string): Promise<{ authenticated: boolean }> {
  return request('/api/admin/session', { method: 'POST', ...jsonBody({ password }) }, 'Login failed.')
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/admin/session', { method: 'DELETE', credentials: 'same-origin' })
  } catch {
    // Local state is cleared either way -- a logout that cannot reach the
    // server should still get the operator out of the dashboard.
  }
}

// ── Boards ───────────────────────────────────────────────────────────

export function fetchBoards(): Promise<BoardsResponse> {
  return request('/api/admin/boards', {}, 'Unable to load boards.')
}

export function createBoard(name: string, slug: string): Promise<BoardsResponse> {
  return request('/api/admin/boards', { method: 'POST', ...jsonBody({ name, slug }) }, 'Unable to create the board.')
}

export function deleteBoard(slug: string): Promise<BoardsResponse> {
  return request(`/api/admin/boards/${encodeURIComponent(slug)}`, { method: 'DELETE' }, 'Unable to delete the board.')
}

// ── Board config ─────────────────────────────────────────────────────

export interface SettingsPayload {
  name: string
  slug: string
  isDefault: boolean
  cols: number
  rows: number
  messageDurationSeconds: number
  apiMessageDurationSeconds: number
  /** Omitted entirely to keep the current password. */
  adminPassword?: string
}

export function fetchConfig(boardSlug: string | null): Promise<AdminConfig> {
  return request(`/api/admin/config${boardQuery(boardSlug)}`, {}, 'Unable to load admin configuration.')
}

export function saveSettings(boardSlug: string | null, payload: SettingsPayload): Promise<AdminConfig> {
  return request(`/api/admin/config${boardQuery(boardSlug)}`, { method: 'PUT', ...jsonBody(payload) }, 'Save failed.')
}

// ── Screens ──────────────────────────────────────────────────────────

export function fetchScreens(boardSlug: string | null): Promise<ScreensResponse> {
  return request(`/api/admin/screens${boardQuery(boardSlug)}`, {}, 'Unable to load screen definitions.')
}

export interface ScreensPayload {
  pluginCommonSettings: Record<string, Record<string, unknown>>
  screens: unknown[]
}

export function saveScreens(boardSlug: string | null, payload: ScreensPayload): Promise<ScreensResponse> {
  return request(`/api/admin/screens${boardQuery(boardSlug)}`, { method: 'PUT', ...jsonBody(payload) }, 'Save failed.')
}

export function refreshScreen(boardSlug: string | null, screenId: string): Promise<{ screen: Screen }> {
  return request(`/api/admin/screens/${encodeURIComponent(screenId)}/refresh${boardQuery(boardSlug)}`, { method: 'POST' }, 'Unable to refresh the plugin screen.')
}

// ── Override message ─────────────────────────────────────────────────

export function fetchMessage(boardSlug: string | null): Promise<MessageState> {
  return request(`/api/message${boardQuery(boardSlug)}`, {}, 'Unable to load the current override state.')
}

export function sendMessage(boardSlug: string | null, message: string): Promise<MessageState> {
  // `message` rather than `lines`: the server accepts exactly one of the two
  // and splits a string itself, which is what the textarea produces.
  return request('/api/message', { method: 'POST', ...jsonBody({ boardSlug, message }) }, 'Unable to send the remote message.')
}

export function clearMessage(boardSlug: string | null): Promise<MessageState> {
  return request(`/api/message${boardQuery(boardSlug)}`, { method: 'DELETE' }, 'Unable to clear the remote message.')
}

// ── Composite ────────────────────────────────────────────────────────

/**
 * One board's entire admin view.
 *
 * Boards first, because its answer decides which board the rest of the calls
 * are about -- the stored slug may name a board that has since been deleted.
 */
export async function fetchSnapshot(requestedBoardSlug: string | null): Promise<AdminSnapshot & { boardSlug: string }> {
  const boards = await fetchBoards()
  const known = boards.boards.some((board) => board.slug === requestedBoardSlug)
  const boardSlug = known && requestedBoardSlug ? requestedBoardSlug : (boards.defaultBoardSlug ?? boards.boards[0]?.slug)

  if (!boardSlug) throw new ApiError('No boards are configured.')

  const [config, screens, message] = await Promise.all([fetchConfig(boardSlug), fetchScreens(boardSlug), fetchMessage(boardSlug)])

  return { boards, config, screens, message, boardSlug }
}

import { useCallback, useEffect, useRef, useState } from 'react'

import { ApiError, UnauthorizedError, fetchSnapshot } from '../api/client'
import type { AdminSnapshot } from '../api/types'

const SELECTED_BOARD_STORAGE_KEY = 'flipoff.admin.selectedBoard'

export function readStoredBoardSlug(): string | null {
  try {
    return window.localStorage.getItem(SELECTED_BOARD_STORAGE_KEY)
  } catch {
    return null
  }
}

function persistBoardSlug(boardSlug: string | null): void {
  try {
    if (boardSlug) window.localStorage.setItem(SELECTED_BOARD_STORAGE_KEY, boardSlug)
    else window.localStorage.removeItem(SELECTED_BOARD_STORAGE_KEY)
  } catch {
    // Private browsing or a full quota. Remembering the board is a convenience.
  }
}

export type AuthState = 'checking' | 'authenticated' | 'unauthenticated'

export interface AdminData {
  auth: AuthState
  snapshot: AdminSnapshot | null
  boardSlug: string | null
  error: string | null
  /** Refetch everything. `select` switches board in the same round trip. */
  reload: (select?: string | null) => Promise<void>
  setUnauthenticated: () => void
}

/**
 * The whole admin view for one board, refetched after every mutation.
 *
 * This is the shape the old imperative admin already had -- one
 * `loadAdminState()` covering six endpoints, re-run whenever anything changed.
 * Keeping it means no query library and no cache to invalidate: a mutation
 * calls `reload()` and every panel sees the server's own answer rather than an
 * optimistic guess. The Screens page is the one exception, and it holds its
 * drafts locally on purpose.
 */
export function useAdminData(): AdminData {
  const [auth, setAuth] = useState<AuthState>('checking')
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null)
  const [boardSlug, setBoardSlug] = useState<string | null>(readStoredBoardSlug)
  const [error, setError] = useState<string | null>(null)

  // A reload started before the latest one must not overwrite it -- switching
  // boards quickly is enough to interleave two in-flight snapshots.
  const requestRef = useRef(0)

  const reload = useCallback(async (select?: string | null): Promise<void> => {
    const requested = select === undefined ? readStoredBoardSlug() : select
    const requestId = ++requestRef.current

    try {
      const result = await fetchSnapshot(requested)
      if (requestId !== requestRef.current) return

      setSnapshot({ boards: result.boards, config: result.config, screens: result.screens, message: result.message })
      setBoardSlug(result.boardSlug)
      persistBoardSlug(result.boardSlug)
      setAuth('authenticated')
      setError(null)
    } catch (caught) {
      if (requestId !== requestRef.current) return

      if (caught instanceof UnauthorizedError) {
        setAuth('unauthenticated')
        setSnapshot(null)
        return
      }

      setAuth('unauthenticated')
      setSnapshot(null)
      setError(caught instanceof ApiError ? caught.message : 'Unable to reach the admin API.')
    }
  }, [])

  const setUnauthenticated = useCallback((): void => {
    requestRef.current += 1
    setAuth('unauthenticated')
    setSnapshot(null)
    setError(null)
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  return { auth, snapshot, boardSlug, error, reload, setUnauthenticated }
}

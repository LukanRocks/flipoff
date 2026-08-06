import { useOutletContext } from 'react-router'

import type { AdminConfig, BoardsResponse, MessageState, Screen, ScreensResponse, SchemaValues } from '../api/types'
import type { StatusApi } from './useStatus'

/**
 * What every page gets from the shell, passed down the router's outlet.
 *
 * Screen drafts live up here rather than in the Screens page because the old
 * admin kept them in module state: they survive navigating to Settings and
 * back, and Settings and the board switcher both refuse to act while they are
 * dirty, so losing them on unmount would change behaviour.
 */
export interface AdminContext {
  boards: BoardsResponse
  config: AdminConfig
  screens: ScreensResponse
  message: MessageState
  boardSlug: string | null
  status: StatusApi

  /** Refetch the whole snapshot; discards drafts, since the server now owns them. */
  reload: (select?: string | null) => Promise<void>
  /** Replace the override state in place, for responses that already return it. */
  setMessage: (message: MessageState) => void

  drafts: Screen[]
  draftsDirty: boolean
  /** Applies an edit and marks the stack dirty, optionally saying so in the status line. */
  updateDrafts: (next: Screen[], note?: string) => void

  commonSettings: Record<string, SchemaValues>
  setCommonSettings: (next: Record<string, SchemaValues>) => void
}

export function useAdmin(): AdminContext {
  return useOutletContext<AdminContext>()
}

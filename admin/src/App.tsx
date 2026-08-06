import { useCallback, useEffect, useState } from 'react'
import { Outlet } from 'react-router'

import { createBoard, deleteBoard, logout } from './api/client'
import type { MessageState, Screen, SchemaValues } from './api/types'
import { DashboardLayout } from './components/DashboardLayout'
import { Login } from './components/Login'
import { slugify } from './lib/format'
import type { AdminContext } from './state/adminContext'
import { useAdminData } from './state/useAdminData'
import { useStatus } from './state/useStatus'

export function App() {
  const { auth, snapshot, boardSlug, error, reload, setUnauthenticated } = useAdminData()
  const status = useStatus()

  // Local edits to the screen stack, and to the plugin settings shared across
  // a plugin family. Both are saved together by the Screens page.
  const [drafts, setDrafts] = useState<Screen[]>([])
  const [draftsDirty, setDraftsDirty] = useState(false)
  const [commonSettings, setCommonSettings] = useState<Record<string, SchemaValues>>({})
  const [message, setMessage] = useState<MessageState | null>(null)

  // A fresh snapshot is the server's answer, so it replaces any local drafts.
  // Every path that reaches here has either just saved them or deliberately
  // discarded them.
  useEffect(() => {
    if (!snapshot) return
    setDrafts(snapshot.screens.screens)
    setDraftsDirty(false)
    setCommonSettings(snapshot.screens.pluginCommonSettings)
    setMessage(snapshot.message)
  }, [snapshot])

  // A failed load leaves the login shell up; surface why rather than showing a
  // blank password box for what may be a dead server.
  useEffect(() => {
    if (error) status.set(error, 'error')
  }, [error, status])

  const updateDrafts = useCallback((next: Screen[], note?: string): void => {
    setDrafts(next)
    setDraftsDirty(true)
    if (note) status.set(note)
    // `status` is stable enough to omit: useStatus memoises its setters, and
    // including it would rebuild this callback on every status change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLogout = useCallback(async (): Promise<void> => {
    await logout()
    setDrafts([])
    setDraftsDirty(false)
    setUnauthenticated()
    status.set('Logged out.')
  }, [setUnauthenticated, status])

  const handleSelectBoard = useCallback(
    (slug: string): void => {
      if (draftsDirty) {
        status.set('Save screens before switching boards.', 'error')
        return
      }
      void reload(slug)
    },
    [draftsDirty, reload, status],
  )

  const handleAddBoard = useCallback(async (): Promise<void> => {
    const name = window.prompt('Board name')
    if (!name) return

    const slug = window.prompt('Board slug', slugify(name))
    if (!slug) return

    const ok = await status.run('Creating board...', async () => {
      await createBoard(name, slug)
    })
    if (!ok) return

    // The server normalises the slug it was given, so ask for that one rather
    // than whatever was typed.
    await reload(slugify(slug))
    status.set('Board created.', 'success')
  }, [reload, status])

  const handleDeleteBoard = useCallback(async (): Promise<void> => {
    if (!snapshot || !boardSlug) return

    const board = snapshot.boards.boards.find((entry) => entry.slug === boardSlug)
    if (!board) return
    if (!window.confirm(`Delete board "${board.name}"?`)) return

    const ok = await status.run('Deleting board...', async () => {
      await deleteBoard(boardSlug)
    })
    if (!ok) return

    // Null rather than the deleted slug, so the snapshot falls back to the
    // default board instead of asking for one that no longer exists.
    await reload(null)
    status.set('Board deleted.', 'success')
  }, [snapshot, boardSlug, reload, status])

  if (auth === 'checking') return <main className='admin-app' />

  if (auth === 'unauthenticated' || !snapshot || !message) {
    return (
      <main className='admin-app'>
        <Login status={status} onAuthenticated={() => reload()} />
        {status.message && <p className={['status-message', status.tone].filter(Boolean).join(' ')}>{status.message}</p>}
      </main>
    )
  }

  const context: AdminContext = {
    boards: snapshot.boards,
    config: snapshot.config,
    screens: snapshot.screens,
    message,
    boardSlug,
    status,
    reload,
    setMessage,
    drafts,
    draftsDirty,
    updateDrafts,
    commonSettings,
    setCommonSettings,
  }

  return (
    <main className='admin-app'>
      <DashboardLayout
        boardName={snapshot.config.name}
        status={status}
        onLogout={handleLogout}
        boards={snapshot.boards.boards}
        boardSlug={boardSlug}
        onSelect={handleSelectBoard}
        onAdd={() => void handleAddBoard()}
        onDelete={() => void handleDeleteBoard()}
      >
        <Outlet context={context} />
      </DashboardLayout>
    </main>
  )
}

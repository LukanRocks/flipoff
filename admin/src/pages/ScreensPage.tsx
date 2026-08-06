import { useState, type DragEvent } from 'react'

import { refreshScreen, saveScreens } from '../api/client'
import type { Screen } from '../api/types'
import { ScreenModal, type ScreenModalResult } from '../components/ScreenModal'
import { DeleteIcon, DragIcon, EditIcon, RefreshIcon } from '../components/primitives'
import { getScreenTitle, serializeScreenForSave } from '../lib/screens'
import { useAdmin } from '../state/adminContext'

type Editing = { screen: Screen; index: number } | null

export function ScreensPage() {
  const { config, screens, boardSlug, status, reload, drafts, draftsDirty, updateDrafts, commonSettings, setCommonSettings } = useAdmin()

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Editing>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function openModal(target: Editing): void {
    setEditing(target)
    setModalOpen(true)
  }

  function closeModal(): void {
    setModalOpen(false)
    setEditing(null)
  }

  function handleModalSave(result: ScreenModalResult): void {
    if (result.commonSettings) {
      setCommonSettings({ ...commonSettings, [result.commonSettings.namespace]: result.commonSettings.values })
    }

    if (editing) {
      const next = [...drafts]
      next[editing.index] = result.screen
      updateDrafts(next, `${getScreenTitle(result.screen, editing.index)} updated locally. Save screens to persist it.`)
    } else {
      const next = [...drafts, result.screen]
      updateDrafts(next, `${getScreenTitle(result.screen, next.length - 1)} added locally. Save screens to persist it.`)
    }

    closeModal()
  }

  function handleDelete(index: number): void {
    // The server rejects an empty stack; catching it here keeps the message
    // specific instead of surfacing a validation error after a save.
    if (drafts.length <= 1) {
      status.set('At least one screen is required.', 'error')
      return
    }

    updateDrafts(drafts.toSpliced(index, 1), 'Screen removed locally. Save screens to persist the new stack.')
  }

  async function handleRefresh(index: number): Promise<void> {
    const screen = drafts[index]
    if (!screen || screen.type !== 'plugin') return

    // Refresh runs server-side against saved state, so a dirty stack would
    // refresh a different configuration than the one on screen.
    if (draftsDirty) {
      status.set('Save screens before refreshing a plugin screen so the server is using the same configuration.', 'error')
      return
    }

    const title = getScreenTitle(screen, index)
    const ok = await status.run(`Refreshing ${title}...`, async () => {
      await refreshScreen(boardSlug, screen.id)
    })
    if (!ok) return

    await reload()
    status.set(`${title} refreshed.`, 'success')
  }

  async function handleSave(): Promise<void> {
    const ok = await status.run('Saving screens...', async () => {
      await saveScreens(boardSlug, { pluginCommonSettings: commonSettings, screens: drafts.map(serializeScreenForSave) })
    })
    if (!ok) return

    await reload()
    status.set('Screens saved. Display pages will refresh automatically.', 'success')
  }

  // ── Drag to reorder ────────────────────────────────────────────────

  function handleDragOver(event: DragEvent, index: number): void {
    if (draggedIndex === null) return
    event.preventDefault()
    setDragOverIndex(index === draggedIndex ? null : index)
  }

  function handleDrop(event: DragEvent, targetIndex: number): void {
    if (draggedIndex === null) return
    event.preventDefault()

    setDragOverIndex(null)
    const from = draggedIndex
    setDraggedIndex(null)
    if (from === targetIndex) return

    // Dropping past a row's midpoint means "after it". The index shifts by one
    // when the moved screen came from above, because removing it renumbers
    // everything below.
    const bounds = event.currentTarget.getBoundingClientRect()
    const placeAfter = event.clientY > bounds.top + bounds.height / 2
    let insertAt = targetIndex
    if (from < targetIndex) insertAt = placeAfter ? targetIndex : targetIndex - 1
    else if (placeAfter) insertAt = targetIndex + 1

    const remaining = drafts.toSpliced(from, 1)
    updateDrafts(remaining.toSpliced(insertAt, 0, drafts[from]!), 'Screen order changed locally. Save screens to persist the new rotation.')
  }

  return (
    <section className='workspace-page' data-page='screens'>
      <div className='page-grid page-grid-single'>
        <form
          className='stack screens-form-layout'
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
        >
          <div id='screens-list' className='screens-list' aria-live='polite'>
            {drafts.length === 0 ? (
              <div className='screen-empty'>No screens configured yet.</div>
            ) : (
              drafts.map((screen, index) => (
                <article
                  key={screen.id}
                  className={['screen-item', draggedIndex === index ? 'dragging' : '', dragOverIndex === index ? 'drag-over' : ''].filter(Boolean).join(' ')}
                  draggable
                  onDragStart={() => setDraggedIndex(index)}
                  onDragOver={(event) => handleDragOver(event, index)}
                  onDrop={(event) => handleDrop(event, index)}
                  onDragEnd={() => {
                    setDraggedIndex(null)
                    setDragOverIndex(null)
                  }}
                >
                  <span className='screen-drag-handle' aria-hidden='true'>
                    <DragIcon />
                  </span>
                  <h3 className='screen-item-title'>{getScreenTitle(screen, index)}</h3>
                  <div className='screen-item-actions'>
                    {screen.type === 'plugin' && (
                      <button
                        type='button'
                        className='screen-icon-button refresh'
                        aria-label='Refresh plugin screen'
                        title='Refresh plugin screen'
                        onClick={() => void handleRefresh(index)}
                      >
                        <RefreshIcon />
                      </button>
                    )}
                    <button type='button' className='screen-icon-button edit' aria-label='Edit screen' title='Edit screen' onClick={() => openModal({ screen, index })}>
                      <EditIcon />
                    </button>
                    <button type='button' className='screen-icon-button delete danger' aria-label='Delete screen' title='Delete screen' onClick={() => handleDelete(index)}>
                      <DeleteIcon />
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>

          <div className='action-row screens-actions'>
            <button type='button' className='ghost-btn' onClick={() => openModal(null)}>
              Add Screen
            </button>
            <button type='submit' className='primary-btn'>
              Save Screens
            </button>
          </div>
        </form>
      </div>

      {/* Keyed so reopening on a different screen remounts with fresh state
          rather than carrying the previous screen's draft across. */}
      {modalOpen && (
        <ScreenModal
          key={editing?.screen.id ?? 'new'}
          config={config}
          plugins={screens.plugins}
          commonSettings={commonSettings}
          editing={editing}
          existingSlugs={drafts.map((screen, index) => ({ slug: screen.slug, index }))}
          nextScreenNumber={drafts.length + 1}
          onSave={handleModalSave}
          onCancel={closeModal}
          onError={(message) => status.set(message, 'error')}
        />
      )}
    </section>
  )
}

import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { AdminConfig, PluginManifest, Screen, SchemaValues } from '../api/types'
import { createLocalScreenId, findLastPopulatedIndex, slugify } from '../lib/format'
import { collectSchemaValues, getScreenTitle, initialSchemaValues } from '../lib/screens'
import { CloseIcon } from './primitives'
import { PluginPicker, SchemaFields } from './SchemaField'

export interface ScreenModalResult {
  screen: Screen
  /** Present only when the chosen plugin declares a shared-settings namespace. */
  commonSettings?: { namespace: string; values: SchemaValues }
}

interface ScreenModalProps {
  config: AdminConfig
  plugins: PluginManifest[]
  commonSettings: Record<string, SchemaValues>
  /** The screen being edited, or null when adding. */
  editing: { screen: Screen; index: number } | null
  existingSlugs: { slug: string; index: number }[]
  nextScreenNumber: number
  onSave: (result: ScreenModalResult) => void
  onCancel: () => void
  onError: (message: string) => void
}

interface Draft {
  type: 'manual' | 'plugin'
  name: string
  slug: string
  lines: string[]
  pluginId: string
  refreshMinutes: string
  settings: SchemaValues
  design: SchemaValues
  common: SchemaValues
}

function buildDraft(
  editing: ScreenModalProps['editing'],
  plugins: PluginManifest[],
  commonSettings: Record<string, SchemaValues>,
  config: AdminConfig,
  nextScreenNumber: number,
): Draft {
  const screen = editing?.screen
  const pluginId = screen?.type === 'plugin' ? screen.pluginId : (plugins[0]?.id ?? '')
  const manifest = plugins.find((plugin) => plugin.id === pluginId)
  const refreshSeconds = screen?.type === 'plugin' ? screen.refreshIntervalSeconds : manifest?.defaultRefreshIntervalSeconds

  return {
    type: screen?.type ?? 'manual',
    name: screen?.name ?? '',
    slug: screen?.slug || slugify(screen?.name || `screen-${editing ? editing.index + 1 : nextScreenNumber}`),
    lines: Array.from({ length: config.rows }, (_, index) => (screen?.type === 'manual' ? (screen.lines[index] ?? '') : '')),
    pluginId,
    refreshMinutes: String(Math.max(1, Math.round((refreshSeconds ?? 3600) / 60))),
    settings: initialSchemaValues(manifest?.settingsSchema ?? [], screen?.type === 'plugin' ? screen.settings : undefined),
    design: initialSchemaValues(manifest?.designSchema ?? [], screen?.type === 'plugin' ? screen.design : undefined),
    common: initialSchemaValues(manifest?.commonSettingsSchema ?? [], manifest?.commonSettingsNamespace ? commonSettings[manifest.commonSettingsNamespace] : undefined),
  }
}

export function ScreenModal({ config, plugins, commonSettings, editing, existingSlugs, nextScreenNumber, onSave, onCancel, onError }: ScreenModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<Draft>(() => buildDraft(editing, plugins, commonSettings, config, nextScreenNumber))

  // A real <dialog>, opened imperatively. showModal() brings the top layer,
  // focus trapping and Escape handling with it -- all things a div would have
  // to reimplement badly.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
  }, [])

  const manifest = plugins.find((plugin) => plugin.id === draft.pluginId)
  const update = <K extends keyof Draft>(key: K, value: Draft[K]): void => setDraft((previous) => ({ ...previous, [key]: value }))

  /** Switching plugin re-seeds all three schema sections from the new manifest. */
  function selectPlugin(pluginId: string): void {
    const next = plugins.find((plugin) => plugin.id === pluginId)
    setDraft((previous) => ({
      ...previous,
      pluginId,
      refreshMinutes: String(Math.max(1, Math.round((next?.defaultRefreshIntervalSeconds ?? 3600) / 60))),
      settings: initialSchemaValues(next?.settingsSchema ?? [], undefined),
      design: initialSchemaValues(next?.designSchema ?? [], undefined),
      common: initialSchemaValues(next?.commonSettingsSchema ?? [], next?.commonSettingsNamespace ? commonSettings[next.commonSettingsNamespace] : undefined),
    }))
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault()

    const name = draft.name.trim()
    const slug = slugify(draft.slug.trim() || name || `screen-${editing ? editing.index + 1 : nextScreenNumber}`)
    const id = editing?.screen.id ?? createLocalScreenId()

    if (!slug) {
      onError('Enter a valid slug for the screen.')
      return
    }

    if (existingSlugs.some((entry) => entry.slug === slug && entry.index !== editing?.index)) {
      onError('Screen slugs must be unique within a board.')
      return
    }

    if (draft.type === 'manual') {
      const lines = draft.lines.map((line) => line.trim())
      const lastPopulated = findLastPopulatedIndex(lines)

      if (lastPopulated === -1) {
        onError('Enter at least one line for the manual screen.')
        return
      }

      // Trailing blanks are dropped, but interior ones are meaningful spacing.
      onSave({ screen: { id, slug, type: 'manual', name, enabled: true, lines: lines.slice(0, lastPopulated + 1) } })
      return
    }

    if (!manifest) {
      onError('Select a plugin before saving the screen.')
      return
    }

    const refreshMinutes = Number(draft.refreshMinutes)
    if (!Number.isInteger(refreshMinutes) || refreshMinutes < 1) {
      onError('Refresh interval must be at least 1 minute.')
      return
    }

    onSave({
      screen: {
        id,
        slug,
        type: 'plugin',
        name,
        enabled: true,
        pluginId: manifest.id,
        pluginName: manifest.name,
        refreshIntervalSeconds: refreshMinutes * 60,
        settings: collectSchemaValues(manifest.settingsSchema, draft.settings),
        design: collectSchemaValues(manifest.designSchema, draft.design),
        lastError: null,
        lastRefreshedAt: null,
      },
      commonSettings: manifest.commonSettingsNamespace
        ? { namespace: manifest.commonSettingsNamespace, values: collectSchemaValues(manifest.commonSettingsSchema, draft.common) }
        : undefined,
    })
  }

  const isPlugin = draft.type === 'plugin'

  return (
    // `onCancel` catches Escape, which closes a <dialog> without going through
    // any button.
    <dialog id='screen-modal' className='screen-modal' ref={dialogRef} onCancel={onCancel}>
      <form id='screen-modal-form' className='screen-modal-card' onSubmit={handleSubmit}>
        <div className='screen-modal-header'>
          <div>
            <p className='section-kicker'>Screen Editor</p>
            <h2 id='screen-modal-title'>{editing ? `Edit ${getScreenTitle(editing.screen, editing.index)}` : 'Add Screen'}</h2>
          </div>
          <button type='button' className='modal-close-btn' aria-label='Close dialog' title='Close dialog' onClick={onCancel}>
            <CloseIcon />
          </button>
        </div>

        <div className='screen-modal-grid'>
          <label className='field'>
            <span>Screen Type</span>
            <div className='segmented-control' role='tablist' aria-label='Screen Type'>
              {(['manual', 'plugin'] as const).map((type) => (
                <button
                  key={type}
                  type='button'
                  className={`segment-btn${draft.type === type ? ' active' : ''}`}
                  aria-pressed={draft.type === type}
                  onClick={() => update('type', type)}
                >
                  {type === 'manual' ? 'Manual' : 'Plugin'}
                </button>
              ))}
            </div>
          </label>

          <label className='field'>
            <span>Name</span>
            <input type='text' placeholder='Optional internal label' value={draft.name} onChange={(event) => update('name', event.target.value)} />
          </label>

          <label className='field'>
            <span>Slug</span>
            <input type='text' placeholder='welcome-screen' value={draft.slug} onChange={(event) => update('slug', event.target.value)} />
          </label>
        </div>

        {!isPlugin && (
          <div className='stack'>
            <div className='screen-line-fields'>
              {draft.lines.map((line, index) => (
                <label key={index} className='field'>
                  <span>{`Line ${index + 1}`}</span>
                  <input
                    type='text'
                    maxLength={config.cols}
                    placeholder={`Up to ${config.cols} characters`}
                    value={line}
                    onChange={(event) => {
                      const lines = [...draft.lines]
                      lines[index] = event.target.value
                      update('lines', lines)
                    }}
                  />
                </label>
              ))}
            </div>
            <p className='helper-copy'>Blank lines are allowed between populated lines, but at least one line must contain text.</p>
          </div>
        )}

        {isPlugin && (
          <div className='stack'>
            <div className='screen-modal-grid'>
              <label className='field'>
                <span>Plugin</span>
                <PluginPicker plugins={plugins} value={draft.pluginId} onChange={selectPlugin} />
              </label>

              <label className='field'>
                <span>Refresh Interval (minutes)</span>
                <input type='number' min='1' step='1' value={draft.refreshMinutes} onChange={(event) => update('refreshMinutes', event.target.value)} />
              </label>
            </div>

            <div>
              <p className='section-kicker'>Plugin Settings</p>
              <SchemaFields schema={manifest?.settingsSchema ?? []} values={draft.settings} onChange={(name, value) => update('settings', { ...draft.settings, [name]: value })} />
            </div>

            {(manifest?.commonSettingsSchema?.length ?? 0) > 0 && (
              <div>
                <p className='section-kicker'>Common Settings</p>
                <SchemaFields schema={manifest!.commonSettingsSchema} values={draft.common} onChange={(name, value) => update('common', { ...draft.common, [name]: value })} />
              </div>
            )}

            <div>
              <p className='section-kicker'>Screen Design</p>
              <SchemaFields schema={manifest?.designSchema ?? []} values={draft.design} onChange={(name, value) => update('design', { ...draft.design, [name]: value })} />
            </div>
          </div>
        )}

        <div className='screen-modal-actions'>
          <button type='button' className='ghost-btn' onClick={onCancel}>
            Cancel
          </button>
          <button type='submit' className='primary-btn'>
            Save Screen
          </button>
        </div>
      </form>
    </dialog>
  )
}

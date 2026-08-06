import { useEffect, useRef, useState } from 'react'

import type { PluginField, PluginManifest, SchemaValues } from '../api/types'

/**
 * One plugin setting, rendered from its manifest. Covers the four declared
 * `PluginFieldType`s; anything else falls through to a text input rather than
 * disappearing, so a new field type is visible before it is supported.
 */
export function SchemaField({ field, value, onChange }: { field: PluginField; value: unknown; onChange: (next: unknown) => void }) {
  return (
    <label className='field'>
      <span>{field.label}</span>

      {field.type === 'select' ? (
        <select value={String(value ?? '')} onChange={(event) => onChange(event.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === 'checkbox' ? (
        <input type='checkbox' checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
      ) : field.type === 'number' ? (
        <input type='number' value={String(value ?? '')} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input type='text' value={String(value ?? '')} placeholder={field.placeholder ?? ''} onChange={(event) => onChange(event.target.value)} />
      )}

      {field.helpText && <p className='helper-copy'>{field.helpText}</p>}
    </label>
  )
}

export function SchemaFields({ schema, values, onChange }: { schema: PluginField[]; values: SchemaValues; onChange: (name: string, next: unknown) => void }) {
  return (
    <div className='screen-line-fields'>
      {schema.map((field) => (
        <SchemaField key={field.name} field={field} value={values[field.name]} onChange={(next) => onChange(field.name, next)} />
      ))}
    </div>
  )
}

/**
 * A listbox rather than a `<select>`, matching the original markup that
 * `admin.css` styles as `.custom-picker`.
 */
export function PluginPicker({ plugins, value, onChange }: { plugins: PluginManifest[]; value: string; onChange: (pluginId: string) => void }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Clicking anywhere else closes it. Registered only while open so the
  // document is not carrying a listener for a menu nobody has opened.
  useEffect(() => {
    if (!open) return

    function handleDocumentPointerDown(event: MouseEvent): void {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('mousedown', handleDocumentPointerDown)
    return () => document.removeEventListener('mousedown', handleDocumentPointerDown)
  }, [open])

  const selected = plugins.find((plugin) => plugin.id === value)

  return (
    <div className='custom-picker' id='plugin-picker' ref={containerRef}>
      <button type='button' id='plugin-select-trigger' className='custom-picker-trigger' aria-haspopup='listbox' aria-expanded={open} onClick={() => setOpen(!open)}>
        {selected ? selected.name : 'Select plugin'}
      </button>

      <div id='plugin-select-menu' className={`custom-picker-menu${open ? '' : ' hidden'}`} role='listbox' aria-label='Plugin'>
        {plugins.map((plugin) => (
          <button
            key={plugin.id}
            type='button'
            className={`custom-picker-option${plugin.id === value ? ' active' : ''}`}
            role='option'
            aria-selected={plugin.id === value}
            onClick={() => {
              onChange(plugin.id)
              setOpen(false)
            }}
          >
            {plugin.name}
          </button>
        ))}
      </div>
    </div>
  )
}

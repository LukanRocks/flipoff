import type { ReactNode } from 'react'

/**
 * The small shared pieces, each emitting exactly the markup `admin.css`
 * already styles. Class names are the contract here -- the stylesheet was
 * carried over from the imperative admin unchanged, so a renamed class is a
 * silent visual regression.
 */

export type Tone = 'neutral' | 'success' | 'error' | 'warning'

export function StatusPill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  return <span className={`status-pill ${tone}`}>{label}</span>
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className='empty-state'>{children}</div>
}

export function ScreenChip({ label, variant = '' }: { label: string; variant?: '' | 'accent' | 'error' }) {
  return <span className={['screen-chip', variant].filter(Boolean).join(' ')}>{label}</span>
}

export function SectionKicker({ children }: { children: ReactNode }) {
  return <p className='section-kicker'>{children}</p>
}

/**
 * A board preview as fixed-width lines. Blank rows get `.is-empty`, which the
 * stylesheet renders as a faint middle dot -- without it an empty line
 * collapses and the preview stops resembling the board's real geometry.
 */
export function ScreenPreview({ lines, variant = '' }: { lines: string[]; variant?: '' | 'overview-preview' | 'compact-preview' }) {
  return (
    <div className={['screen-preview', variant].filter(Boolean).join(' ')}>
      {lines.map((line, index) => (
        <div key={index} className={`screen-preview-line${line ? '' : ' is-empty'}`}>
          {line}
        </div>
      ))}
    </div>
  )
}

export function MetricTile({ label, value, meta }: { label: string; value: string; meta: string }) {
  return (
    <article className='metric-tile'>
      <p className='metric-label'>{label}</p>
      <strong className='metric-value'>{value}</strong>
      <p className='helper-copy'>{meta}</p>
    </article>
  )
}

export function WorkspaceSection({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section className='workspace-section page-panel'>
      <div className='panel-heading'>
        <div>
          <SectionKicker>{kicker}</SectionKicker>
          <h2>{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

// ── Icons ────────────────────────────────────────────────────────────
// Inline rather than a sprite: `admin.css` styles `svg` inside the button
// classes directly (stroke, size), so these have to be real child nodes.

export function EditIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path d='M4 20l4.2-1 9.4-9.4-3.2-3.2L5 15.8 4 20z' />
      <path d='M13.8 5.8l3.2 3.2' />
    </svg>
  )
}

export function DeleteIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path d='M5 7h14' />
      <path d='M9 7V5h6v2' />
      <path d='M8 10v7' />
      <path d='M12 10v7' />
      <path d='M16 10v7' />
      <path d='M7 7l1 12h8l1-12' />
    </svg>
  )
}

export function RefreshIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path d='M20 11a8 8 0 1 0 2 5.5' />
      <path d='M20 4v7h-7' />
    </svg>
  )
}

export function DragIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <circle cx='8' cy='6' r='1.5' />
      <circle cx='8' cy='12' r='1.5' />
      <circle cx='8' cy='18' r='1.5' />
      <circle cx='16' cy='6' r='1.5' />
      <circle cx='16' cy='12' r='1.5' />
      <circle cx='16' cy='18' r='1.5' />
    </svg>
  )
}

export function PlusIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path d='M12 5v14' />
      <path d='M5 12h14' />
    </svg>
  )
}

export function CloseIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path d='M6 6l12 12' />
      <path d='M18 6L6 18' />
    </svg>
  )
}

export function StarIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path d='M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3z' />
    </svg>
  )
}

export function ExternalLinkIcon() {
  return (
    <svg viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      <path d='M14 5h5v5' />
      <path d='M10 14L19 5' />
      <path d='M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5' />
    </svg>
  )
}

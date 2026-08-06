import type { AdminConfig, MessageState, Screen } from '../api/types'
import { cpSlice, formatTimestamp, padLines } from '../lib/format'
import { getScreenTitle } from '../lib/screens'
import { ScreenPreview, StatusPill, type Tone } from './primitives'

/**
 * Whether a temporary override is sitting on top of the rotation, and what the
 * board is showing because of it.
 *
 * Shared by Home and Send Message -- the imperative admin rendered the same
 * three values into two different places, so they stay one component here.
 */
export interface OverrideView {
  label: string
  tone: Tone
  meta: string
  lines: string[]
}

export function describeOverride(message: MessageState, config: AdminConfig, screens: Screen[]): OverrideView {
  if (message.hasOverride) {
    return {
      label: 'Override live',
      tone: 'warning',
      meta: `Updated ${formatTimestamp(message.updatedAt)}. Clear it manually or wait for the API timer to expire.`,
      lines: padLines(message.lines, config.rows),
    }
  }

  // With no override there is nothing live to show, so name what the rotation
  // will put up instead of leaving the preview blank.
  const next = screens[0] ? `Next: ${getScreenTitle(screens[0], 0)}` : 'Rotation idle'
  return {
    label: 'Rotation live',
    tone: 'success',
    meta: 'No temporary override is active. The screen rotation is running normally.',
    lines: padLines(['', cpSlice(next, config.cols), ''], config.rows),
  }
}

export function OverrideSummary({ view, variant }: { view: OverrideView; variant: 'overview-preview' | 'compact-preview' }) {
  return (
    <>
      <div className='section-heading'>
        <StatusPill label={view.label} tone={view.tone} />
      </div>
      <p className='helper-copy'>{view.meta}</p>
      <ScreenPreview lines={view.lines} variant={variant} />
    </>
  )
}

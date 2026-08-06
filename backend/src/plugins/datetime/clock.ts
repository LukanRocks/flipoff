import { ValidationError } from '../../board/normalize'
import type { PluginPlaceholderArgs, PluginRefreshArgs, PluginRefreshResult, ScreenPlugin } from '../base'
import { withOptionalTitle } from '../base'
import { fit } from '../lib/format'

/**
 * Builds a part lookup rather than a formatted string, so the lines below can
 * be assembled in the board's own layout instead of a locale's.
 */
function partsFor(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  let formatter: Intl.DateTimeFormat
  try {
    formatter = new Intl.DateTimeFormat('en-US', timeZone ? { ...options, timeZone } : options)
  } catch {
    throw new ValidationError(`'${timeZone}' is not a recognised time zone. Use an IANA name such as Europe/Lisbon.`)
  }

  const parts: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value
  return parts
}

function timeLine(now: Date, timeZone: string, showSeconds: boolean): string {
  const parts = partsFor(now, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  })

  const clock = [parts.hour, parts.minute, ...(showSeconds ? [parts.second] : [])].join(':')
  return `\u{1F550} ${clock}`
}

function dateLine(now: Date, timeZone: string, dateFormat: string): string | null {
  if (dateFormat === 'none') return null

  if (dateFormat === 'numeric') {
    const parts = partsFor(now, timeZone, { day: '2-digit', month: '2-digit', year: 'numeric' })
    return `\u{1F4C5} ${parts.day}/${parts.month}/${parts.year}`
  }

  const parts = partsFor(now, timeZone, { day: 'numeric', month: 'long', year: 'numeric' })
  return `\u{1F4C5} ${parts.day} ${(parts.month ?? '').toUpperCase()} ${parts.year}`
}

/**
 * The clock the browser used to render itself from a `{"dynamic": "datetime"}`
 * marker. Rendered server-side it can only know one time zone, so that becomes
 * a setting -- it is no longer per-viewer.
 */
export const datetimePlugin: ScreenPlugin = {
  manifest: {
    id: 'datetime',
    name: 'Date & Time',
    description: 'Show the current time, weekday and date for a chosen time zone.',
    defaultRefreshIntervalSeconds: 30,
    // Nothing here is fetched, so there is no point persisting the rendered
    // lines -- they would be stale the moment they were written.
    volatile: true,
    settingsSchema: [
      {
        name: 'timeZone',
        label: 'Time Zone',
        type: 'text',
        default: '',
        placeholder: 'Europe/Lisbon',
        helpText: "IANA time zone name. Leave blank to use the server's own.",
      },
      {
        name: 'dateFormat',
        label: 'Date Format',
        type: 'select',
        default: 'long',
        options: [
          { label: '6 AUGUST 2026', value: 'long' },
          { label: '06/08/2026', value: 'numeric' },
          { label: 'No date', value: 'none' },
        ],
      },
      {
        name: 'showSeconds',
        label: 'Show Seconds',
        type: 'checkbox',
        default: false,
        helpText: 'The screen is rendered once per refresh, so seconds will read as stale unless the refresh interval is very short.',
      },
    ],
    designSchema: [
      { name: 'title', label: 'Title Override', type: 'text', default: '', placeholder: 'LOCAL TIME' },
      { name: 'showWeekday', label: 'Show Weekday', type: 'checkbox', default: true },
      { name: 'showTimeZone', label: 'Show Time Zone', type: 'checkbox', default: true },
    ],
  },

  async refresh({ settings, design, context }: PluginRefreshArgs): Promise<PluginRefreshResult> {
    const timeZone = String(settings.timeZone ?? '').trim()
    const dateFormat = String(settings.dateFormat ?? 'long')
    const showSeconds = Boolean(settings.showSeconds ?? false)

    const now = new Date()
    const lines = [timeLine(now, timeZone, showSeconds)]

    if (design.showWeekday ?? true) {
      lines.push((partsFor(now, timeZone, { weekday: 'long' }).weekday ?? '').toUpperCase())
    }

    const date = dateLine(now, timeZone, dateFormat)
    if (date !== null) lines.push(date)

    if (design.showTimeZone ?? true) {
      lines.push(partsFor(now, timeZone, { timeZoneName: 'shortOffset' }).timeZoneName ?? '')
    }

    return {
      lines: withOptionalTitle(
        lines.map((line) => fit(line, context.cols)),
        design,
        context,
      ).slice(0, context.rows),
      meta: { timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone },
    }
  },

  placeholderLines({ design, context, error }: PluginPlaceholderArgs): string[] {
    return withOptionalTitle([fit((error || 'CLOCK').toUpperCase(), context.cols)], design, context).slice(0, context.rows)
  },
}

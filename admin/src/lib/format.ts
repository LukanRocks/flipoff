export function pluralize(word: string, count: number): string {
  return count === 1 ? word : `${word}s`
}

export function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'never'
  const parsed = new Date(timestamp)
  if (Number.isNaN(parsed.getTime())) return timestamp
  return parsed.toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} ${pluralize('sec', seconds)}`

  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60)
    return `${minutes} ${pluralize('min', minutes)}`
  }

  const hours = Math.round(seconds / 3600)
  return `${hours} ${pluralize('hr', hours)}`
}

export function slugify(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

/** Pads or trims to exactly `rows` lines, so a preview always fills the board's height. */
export function padLines(lines: string[] | undefined, rows: number): string[] {
  const padded = [...(lines ?? [])]
  while (padded.length < rows) padded.push('')
  return padded.slice(0, rows)
}

/**
 * Board text is measured in code points, not UTF-16 units -- '🏛️'.length is 3
 * in JS but the board renders it as one tile. Previews here must clip the same
 * way the board does or they misrepresent what will fit.
 */
export function cpSlice(value: string, cols: number): string {
  return [...value].slice(0, cols).join('')
}

export function createLocalScreenId(): string {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `screen-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export function findLastPopulatedIndex(lines: string[]): number {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index]) return index
  }
  return -1
}

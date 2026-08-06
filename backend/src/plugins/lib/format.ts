import { cpLength, cpSlice } from '../../util/text'

/**
 * Layout helpers shared by the plugin families. Python had this logic
 * duplicated verbatim in `github/lib/common.py` and `api_ninjas/lib/common.py`;
 * it is one copy here.
 *
 * Every width calculation counts code points, not UTF-16 units, so plugin
 * output lines up on the board even when values contain non-ASCII.
 */

export function fit(value: unknown, cols: number): string {
  return cpSlice(String(value ?? ''), 0, cols)
}

function padEndCp(value: string, width: number): string {
  return value + ' '.repeat(Math.max(0, width - cpLength(value)))
}

function padStartCp(value: string, width: number): string {
  return ' '.repeat(Math.max(0, width - cpLength(value))) + value
}

/**
 * Renders label/value pairs as two columns, label left and value right.
 * Narrows the gap, then the label column, and finally gives up on alignment
 * entirely rather than overflowing the grid.
 */
export function formatAlignedPairs(rows: [unknown, unknown][], cols: number): string[] {
  if (rows.length === 0) return []

  const normalizedRows: [string, string][] = rows.map(([label, value]) => [
    String(label ?? '')
      .trim()
      .toUpperCase(),
    String(value ?? '')
      .trim()
      .toUpperCase(),
  ])

  let labelWidth = Math.max(...normalizedRows.map(([label]) => cpLength(label)))
  const valueWidth = Math.max(...normalizedRows.map(([, value]) => cpLength(value)))
  let gapWidth = 2

  if (labelWidth + gapWidth + valueWidth > cols) gapWidth = 1
  if (labelWidth + gapWidth + valueWidth > cols) labelWidth = Math.max(1, cols - gapWidth - valueWidth)
  if (labelWidth + gapWidth + valueWidth > cols) return normalizedRows.map(([label, value]) => fit(`${label} ${value}`, cols))

  const gap = ' '.repeat(gapWidth)
  return normalizedRows.map(([label, value]) => `${padEndCp(cpSlice(label, 0, labelWidth), labelWidth)}${gap}${padStartCp(value, valueWidth)}`)
}

/** Word-wraps to at most `maxLines`, hard-splitting words longer than `cols`. */
export function wrapText(value: unknown, cols: number, maxLines: number): string[] {
  if (maxLines <= 0 || cols <= 0) return []

  const collapsed = String(value ?? '')
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')
  if (!collapsed) return []

  const lines: string[] = []
  let current = ''

  for (const rawWord of collapsed.split(' ')) {
    let word = rawWord

    while (cpLength(word) > cols) {
      if (current) {
        lines.push(current)
        if (lines.length >= maxLines) return lines.slice(0, maxLines)
        current = ''
      }
      lines.push(cpSlice(word, 0, cols))
      if (lines.length >= maxLines) return lines.slice(0, maxLines)
      word = cpSlice(word, cols)
    }

    const candidate = current ? `${current} ${word}` : word
    if (cpLength(candidate) <= cols) {
      current = candidate
      continue
    }

    lines.push(current)
    if (lines.length >= maxLines) return lines.slice(0, maxLines)
    current = word
  }

  if (current && lines.length < maxLines) lines.push(current)

  return lines.slice(0, maxLines)
}

/** Shared 20s ceiling, replacing aiohttp's ClientTimeout(total=20). */
export const PLUGIN_REQUEST_TIMEOUT_MS = 20_000

export async function fetchJson(
  url: string,
  options: { headers?: Record<string, string>; signal: AbortSignal },
): Promise<{ ok: boolean; status: number; payload: unknown; headers: Headers }> {
  const response = await fetch(url, { headers: options.headers, signal: options.signal })
  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    payload = null
  }
  return { ok: response.ok, status: response.status, payload, headers: response.headers }
}

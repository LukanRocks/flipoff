/**
 * Code-point-safe string helpers.
 *
 * The board renders one tile per code point, and Python measured lines with
 * `len()`, which counts code points too. JS `.length` and `.slice()` count
 * UTF-16 units, so a plain port would measure a variation-selector emoji as 3
 * instead of 2 and clip emoji in half. Every length check and truncation on
 * board text goes through these.
 *
 * Note: `.trim()` stands in for Python's `str.strip()`. The two disagree only
 * on characters that cannot appear in board text (Python also strips the
 * \x1c-\x1f separators, JS also strips the BOM).
 */

export function cpLength(value: string): number {
  return [...value].length
}

export function cpSlice(value: string, start: number, end?: number): string {
  return [...value].slice(start, end).join('')
}

/** Uppercased, trimmed and clipped to `cols` code points -- the board's house style. */
export function fitLine(value: unknown, cols: number): string {
  return cpSlice(
    String(value ?? '')
      .trim()
      .toUpperCase(),
    0,
    cols,
  )
}

const NON_ASCII = /[^\x00-\x7F]/g

/**
 * JSON.stringify with non-ASCII escaped, matching Python's
 * `json.dump(..., ensure_ascii=True)`. Emoji are surrogate pairs, and each half
 * escapes separately, which is exactly what Python emitted. Keeps the on-disk
 * state files byte-identical to what the Python server wrote, so upgrading in
 * place produces no spurious diff.
 */
export function dumpJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(NON_ASCII, (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'))
}

/**
 * ISO-8601 UTC with a trailing Z, as Python's
 * `isoformat().replace('+00:00', 'Z')` produced. Python wrote microseconds and
 * this writes milliseconds; both parse identically and nothing compares the
 * strings for length.
 */
export function utcNow(): string {
  return new Date().toISOString()
}

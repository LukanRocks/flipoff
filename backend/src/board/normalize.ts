import { DEFAULT_MESSAGE_DURATION_SECONDS, RESERVED_BOARD_SLUGS, SLUG_PATTERN } from '../config/defaults'
import type { DisplayConfig } from '../types'
import { cpLength } from '../util/text'

/** Rejected payloads become 400s; anything else is a 500. */
export class ValidationError extends Error {}

function fail(message: string): never {
  throw new ValidationError(message)
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function coerceSlug(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') fail(`'${fieldName}' must be a string.`)

  const normalized = slugify(value)
  if (!normalized) fail(`'${fieldName}' must contain letters or numbers.`)
  if (RESERVED_BOARD_SLUGS.has(normalized)) fail(`'${fieldName}' uses a reserved slug.`)
  if (!SLUG_PATTERN.test(normalized)) fail(`'${fieldName}' must contain only lowercase letters, numbers, and hyphens.`)
  return normalized
}

export function suggestSlug(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const normalized = slugify(value)
    if (normalized) return normalized
  }
  return fallback
}

export function makeUniqueSlug(baseSlug: string, seenSlugs: Set<string>): string {
  let candidate = baseSlug
  let suffix = 2
  while (seenSlugs.has(candidate)) {
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }
  return candidate
}

export function coerceInt(value: unknown, fieldName: string, minimum: number, maximum: number): number {
  // Python rejected bools here because `isinstance(True, int)` is true; JS has
  // no such trap, but it does accept 4.5 and NaN where Python would not.
  if (typeof value !== 'number' || !Number.isInteger(value)) fail(`'${fieldName}' must be an integer.`)
  if (value < minimum || value > maximum) fail(`'${fieldName}' must be between ${minimum} and ${maximum}.`)
  return value
}

export function coerceBool(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') fail(`'${fieldName}' must be a boolean.`)
  return value
}

export function coerceOptionalString(value: unknown, fieldName: string): string {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') fail(`'${fieldName}' must be a string.`)
  return value.trim()
}

export function padLines(lines: string[], rows: number): string[] {
  return [...lines, ...Array(Math.max(0, rows - lines.length)).fill('')]
}

export function centerLines(lines: string[], rows: number): string[] {
  const topPadding = Math.max(0, Math.floor((rows - lines.length) / 2))
  const bottomPadding = Math.max(0, rows - lines.length - topPadding)
  return [...Array(topPadding).fill(''), ...lines, ...Array(bottomPadding).fill('')]
}

export function trimMessageLines(message: string[]): string[] {
  const trimmed = [...message]
  while (trimmed.length > 1 && trimmed[trimmed.length - 1] === '') trimmed.pop()
  return trimmed
}

export function normalizeMessageLines(lines: unknown, options: { cols: number; rows: number; fieldName: string; allowEmpty?: boolean }): string[] {
  const { cols, rows, fieldName, allowEmpty = false } = options

  if (!Array.isArray(lines)) fail(`'${fieldName}' must be an array of strings.`)
  if (lines.length === 0 && allowEmpty) return []
  if (lines.length < 1 || lines.length > rows) fail(`'${fieldName}' must contain between 1 and ${rows} items.`)

  const normalized: string[] = []
  lines.forEach((line, index) => {
    if (typeof line !== 'string') fail(`${fieldName} line ${index + 1} must be a string.`)
    const normalizedLine = line.trim().toUpperCase()
    if (cpLength(normalizedLine) > cols) fail(`${fieldName} line ${index + 1} exceeds ${cols} characters.`)
    normalized.push(normalizedLine)
  })

  return trimMessageLines(normalized)
}

export function normalizeDefaultMessages(messages: unknown, cols: number, rows: number): string[][] {
  if (!Array.isArray(messages) || messages.length === 0) fail("'defaultMessages' must be a non-empty array of message arrays.")

  return messages.map((message, index) => padLines(normalizeMessageLines(message, { cols, rows, fieldName: `defaultMessages[${index}]` }), rows))
}

export interface RuntimeSettings {
  cols: number
  rows: number
  messageDurationSeconds: number
  apiMessageDurationSeconds: number
}

export function normalizeRuntimeSettingsPayload(payload: unknown): RuntimeSettings {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) fail('Request body must be a JSON object.')
  const body = payload as Record<string, unknown>

  return {
    cols: coerceInt(body.cols, 'cols', 6, 256),
    rows: coerceInt(body.rows, 'rows', 1, 128),
    messageDurationSeconds: coerceInt(body.messageDurationSeconds ?? DEFAULT_MESSAGE_DURATION_SECONDS, 'messageDurationSeconds', 1, 86400),
    apiMessageDurationSeconds: coerceInt(body.apiMessageDurationSeconds, 'apiMessageDurationSeconds', 1, 86400),
  }
}

/**
 * Word-wraps a free-text message onto the grid, then centres it vertically.
 * Backs `POST /api/message` with a `message` field.
 */
export function normalizeMessage(message: unknown, cols: number, rows: number): string[] {
  if (typeof message !== 'string') fail("The 'message' field must be a string.")

  const collapsed = message.trim().replace(/\s+/g, ' ')
  if (!collapsed) return Array(rows).fill('')

  const words = collapsed.split(' ')
  if (words.some((word) => cpLength(word) > cols)) fail(`Each word in 'message' must be ${cols} characters or fewer.`)

  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word
    if (cpLength(candidate) <= cols) {
      currentLine = candidate
      continue
    }

    lines.push(currentLine.toUpperCase())
    currentLine = word
    if (lines.length >= rows) fail(`'message' must fit within ${rows} lines of ${cols} characters.`)
  }

  if (currentLine) lines.push(currentLine.toUpperCase())
  if (lines.length > rows) fail(`'message' must fit within ${rows} lines of ${cols} characters.`)

  return centerLines(lines, rows)
}

export function normalizePayload(payload: unknown, config: DisplayConfig): string[] {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) fail('Request body must be a JSON object.')
  const body = payload as Record<string, unknown>

  const hasMessage = 'message' in body
  const hasLines = 'lines' in body
  if (hasMessage === hasLines) fail("Request body must include exactly one of 'message' or 'lines'.")

  if (hasMessage) return normalizeMessage(body.message, config.cols, config.rows)

  return padLines(normalizeMessageLines(body.lines, { cols: config.cols, rows: config.rows, fieldName: 'lines' }), config.rows)
}

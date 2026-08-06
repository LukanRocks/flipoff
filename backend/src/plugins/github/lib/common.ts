import { ValidationError } from '../../../board/normalize'
import { fetchJson } from '../../lib/format'

export const DEFAULT_GITHUB_REPOSITORY = 'magnum6actual/flipoff'
export const GITHUB_API_BASE_URL = 'https://api.github.com'

const GITHUB_HEADERS = { Accept: 'application/vnd.github+json' }

export function normalizeRepository(value: unknown): [string, string] {
  const repository = String(value ?? DEFAULT_GITHUB_REPOSITORY).trim() || DEFAULT_GITHUB_REPOSITORY

  const separator = repository.indexOf('/')
  const owner = separator === -1 ? '' : repository.slice(0, separator).trim()
  const repo = separator === -1 ? '' : repository.slice(separator + 1).trim()
  if (!owner || !repo) throw new ValidationError("Repository must use the format 'owner/name'.")

  return [owner, repo]
}

export function compactRepository(owner: string, repo: string): string {
  return `${owner}/${repo}`
}

export function repositoryHeading(owner: string, repo: string, design: Record<string, unknown> | null, error?: string | null): string | null {
  if (error) return error.toUpperCase()
  if (design !== null && !(design.showRepository ?? true)) return null
  return compactRepository(owner, repo).toUpperCase()
}

function errorMessageFrom(payload: unknown, fallback: string): string {
  if (typeof payload === 'object' && payload !== null && 'message' in payload) {
    const message = (payload as Record<string, unknown>).message
    if (typeof message === 'string' && message) return message
  }
  return fallback
}

export async function fetchRepository(owner: string, repo: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const { ok, payload } = await fetchJson(`${GITHUB_API_BASE_URL}/repos/${owner}/${repo}`, { headers: GITHUB_HEADERS, signal })
  if (!ok) throw new ValidationError(errorMessageFrom(payload, 'GitHub repository request failed.'))
  return (payload ?? {}) as Record<string, unknown>
}

/**
 * GitHub has no open-PR count endpoint, so this asks for a single-item page and
 * reads the total off the `rel="last"` link. Falls back to the page length when
 * the result fits on one page and no Link header is sent.
 */
export async function countOpenPullRequests(owner: string, repo: string, signal: AbortSignal): Promise<number> {
  const url = `${GITHUB_API_BASE_URL}/repos/${owner}/${repo}/pulls?state=open&per_page=1&page=1`
  const { ok, payload, headers } = await fetchJson(url, { headers: GITHUB_HEADERS, signal })
  if (!ok) throw new ValidationError(errorMessageFrom(payload, 'GitHub pull request request failed.'))
  if (!Array.isArray(payload)) throw new ValidationError('GitHub pull request response was not a list.')

  const linkHeader = headers.get('Link') ?? ''
  if (linkHeader.includes('rel="last"')) {
    const lastPage = extractLastPage(linkHeader)
    if (lastPage !== null) return lastPage
  }

  return payload.length
}

export function extractLastPage(linkHeader: string): number | null {
  for (const segment of linkHeader.split(',')) {
    if (!segment.includes('rel="last"')) continue

    const marker = 'page='
    const pageIndex = segment.indexOf(marker)
    if (pageIndex === -1) continue

    const digits = /^\d+/.exec(segment.slice(pageIndex + marker.length))
    if (digits) return Number(digits[0])
  }

  return null
}

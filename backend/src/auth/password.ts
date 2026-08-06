import { randomBytes, timingSafeEqual } from 'node:crypto'

import bcrypt from 'bcryptjs'

import { MAX_SESSION_TOKENS } from '../config/defaults'
import { loadConfigPayload } from '../board/config'
import type { AdminPasswordState } from '../types'

/**
 * bcryptjs is a pure-JS implementation, so there is no native build step, and
 * it reads the `$2b$` hashes Python's `bcrypt` already wrote into existing
 * ~/.flipoff/config.json files. Upgrading does not invalidate a saved password.
 */
export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(12))
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  try {
    return bcrypt.compareSync(password, passwordHash)
  } catch {
    return false
  }
}

/** Reads the stored hash, upgrading a legacy plaintext password on the way through. */
export function loadAdminPasswordHash(configPath: string | null): string | null {
  let payload: Record<string, unknown>
  try {
    payload = loadConfigPayload(configPath)
  } catch {
    return null
  }

  const rawHash = payload.adminPasswordHash
  if (typeof rawHash === 'string' && rawHash.trim()) return rawHash.trim()

  // Legacy format: plaintext password, rehashed and persisted on the next save.
  const rawPassword = payload.adminPassword
  if (typeof rawPassword === 'string' && rawPassword.trim()) return hashPassword(rawPassword.trim())

  return null
}

export function resolveAdminPassword(adminPassword: string | undefined, configPath: string | null): AdminPasswordState {
  if (adminPassword) return { passwordHash: hashPassword(adminPassword), plaintextForAnnounce: null, generated: false }

  const configHash = loadAdminPasswordHash(configPath)
  if (configHash) return { passwordHash: configHash, plaintextForAnnounce: null, generated: false }

  const plaintext = randomBytes(16).toString('base64url')
  return { passwordHash: hashPassword(plaintext), plaintextForAnnounce: plaintext, generated: true }
}

export function announceAdminPassword(state: AdminPasswordState): void {
  if (state.generated && state.plaintextForAnnounce) {
    console.log(`[flipoff] Generated admin password: ${state.plaintextForAnnounce}`)
    state.plaintextForAnnounce = null // Clear from memory once announced.
  }
}

// ── Sessions ─────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'flipoff_admin_session'

export function createSessionToken(tokens: Set<string>): string {
  // Bounded so a long-lived server cannot accumulate tokens without limit.
  if (tokens.size >= MAX_SESSION_TOKENS) {
    const oldest = tokens.values().next().value
    if (oldest !== undefined) tokens.delete(oldest)
  }
  const token = randomBytes(32).toString('base64url')
  tokens.add(token)
  return token
}

/**
 * Constant-time membership test, standing in for Python's hmac.compare_digest.
 * A plain `Set.has` would leak token content through comparison timing.
 */
export function hasSessionToken(tokens: Set<string>, candidate: string | undefined): boolean {
  if (!candidate) return false

  const candidateBuffer = Buffer.from(candidate)
  let matched = false
  for (const token of tokens) {
    const tokenBuffer = Buffer.from(token)
    if (tokenBuffer.length !== candidateBuffer.length) continue
    if (timingSafeEqual(tokenBuffer, candidateBuffer)) matched = true
  }
  return matched
}

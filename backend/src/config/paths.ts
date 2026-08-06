import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/**
 * backend/ -- two levels up from this file whether it is running as
 * dist/config/paths.js (built) or src/config/paths.ts (tsx).
 */
export const PACKAGE_ROOT = resolve(__dirname, '..', '..')

function firstExisting(...candidates: string[]): string {
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 1]!
}

/**
 * The built frontend. In a container the web build is copied to backend/public;
 * in development it is still sitting in the sibling package as web/dist.
 */
export const WEB_ROOT = firstExisting(join(PACKAGE_ROOT, 'public'), resolve(PACKAGE_ROOT, '..', 'web', 'dist'))

/**
 * Grid, charset, colours, timing and message defaults. The browser no longer
 * reads this file -- it gets all of it from /api/config -- so it lives in the
 * backend package rather than the served bundle. FLIPOFF_CONFIG_PATH lets a
 * container bind-mount a different one without rebuilding the image.
 */
export const DEFAULTS_CONFIG_PATH = process.env.FLIPOFF_CONFIG_PATH ?? join(PACKAGE_ROOT, 'config.json')

/** Board settings and screens persist here. Docker mounts a volume over it. */
export const USER_DATA_DIR = process.env.FLIPOFF_DATA_DIR ?? join(homedir(), '.flipoff')
export const CONFIG_PATH = join(USER_DATA_DIR, 'config.json')
export const SCREENS_PATH = join(USER_DATA_DIR, 'screens.json')

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
 * Grid, timing and message defaults, read from the same config.json the browser
 * fetches. Prefers the built copy at the served root, then the source in
 * web/public so the server still starts before the frontend has been built.
 */
export const DEFAULTS_CONFIG_PATH = firstExisting(join(WEB_ROOT, 'config.json'), resolve(PACKAGE_ROOT, '..', 'web', 'public', 'config.json'))

/** Board settings and screens persist here. Docker mounts a volume over it. */
export const USER_DATA_DIR = process.env.FLIPOFF_DATA_DIR ?? join(homedir(), '.flipoff')
export const CONFIG_PATH = join(USER_DATA_DIR, 'config.json')
export const SCREENS_PATH = join(USER_DATA_DIR, 'screens.json')

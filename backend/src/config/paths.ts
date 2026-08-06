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
 * The two built frontends. They are separate packages with separate Vite
 * builds, and both emit an `assets` directory -- so they are mounted at
 * separate URL prefixes (/assets and /admin/assets) and tracked here as
 * separate roots. In a container each build is copied under backend/public;
 * in development each is still sitting in its own sibling package.
 */
export const BOARD_ROOT = firstExisting(join(PACKAGE_ROOT, 'public', 'board'), resolve(PACKAGE_ROOT, '..', 'board', 'dist'))
export const ADMIN_ROOT = firstExisting(join(PACKAGE_ROOT, 'public', 'admin'), resolve(PACKAGE_ROOT, '..', 'admin', 'dist'))

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

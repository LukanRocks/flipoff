/**
 * What the board says about itself when it has nothing from the server to show.
 *
 * Pure line builders — Board._formatToGrid centres and clips them, so nothing
 * here needs to know the grid width. Everything is uppercase, like every other
 * message on the board.
 */

/**
 * Waiting on the very first /api/config.
 *
 * Two lines, occupying the same rows as the failure screen's headline and
 * reason. Keeping the blocks aligned means moving between them only flips the
 * tiles that actually differ.
 */
export function connectingLines() {
  return ['', 'CONNECTING', 'TO SERVER...', '', '']
}

/**
 * A failed attempt: what went wrong, why, and when the next one lands.
 *
 * The countdown re-renders once a second, but Board only animates tiles whose
 * character changed — so a tick flips one or two tiles, which reads as the
 * board still trying rather than the board being stuck.
 */
export function failureLines({ kind, status, retryInSeconds }) {
  const headline = {
    unreachable: 'CANNOT REACH SERVER',
    http: 'SERVER ERROR',
    'bad-payload': 'BAD CONFIG FROM SERVER',
  }

  const reason = kind === 'http' ? `HTTP ${status}` : ''
  const retry = Number.isFinite(retryInSeconds) ? `RETRYING IN ${retryInSeconds}S` : ''

  return ['', headline[kind] ?? 'SERVER UNAVAILABLE', reason, retry, '']
}

/**
 * The socket has been down long enough that leaving the old rotation up would
 * misrepresent a dead server as a working board.
 */
export function reconnectingLines() {
  return ['', 'LOST CONNECTION', '', 'RECONNECTING...', '']
}

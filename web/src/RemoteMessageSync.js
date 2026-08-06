const RETRY_BACKOFF_MS = [1000, 2000, 4000, 8000, 15000, 30000]

/**
 * The board's live link to the backend: the current override over /api/message,
 * and pushed message/config updates over /ws.
 *
 * It never gives up. A board hanging on a wall has to survive a server restart
 * without anyone refreshing it, so a closed socket always schedules another
 * attempt and the caller is told about the state change instead.
 */
export class RemoteMessageSync {
  constructor(onEvent, boardSlug = null, onStatusChange = null) {
    this.onEvent = onEvent
    this.onStatusChange = onStatusChange
    this.routeBoardSlug = boardSlug
    this.activeBoardSlug = boardSlug
    this.ws = null
    this.reconnectTimer = null
    this.isStopped = false
    this.status = 'connecting'
    this._attempts = 0
  }

  setActiveBoardSlug(boardSlug) {
    if (boardSlug) this.activeBoardSlug = boardSlug
  }

  fetchMessageState() {
    return this._fetchJson(this._buildApiPath('/api/message', this.activeBoardSlug || this.routeBoardSlug))
  }

  connect() {
    if (this.isStopped) return
    this._clearReconnect()

    // Close any existing socket before opening a new one
    if (this.ws) {
      try {
        this.ws.close()
      } catch {}
      this.ws = null
    }

    let ws
    try {
      ws = new WebSocket(this._getWebSocketUrl())
    } catch {
      this._scheduleReconnect()
      return
    }
    this.ws = ws

    ws.addEventListener('open', () => {
      this._attempts = 0
      this._setStatus('online')
    })
    ws.addEventListener('message', (event) => this._handleMessage(event))
    ws.addEventListener('close', () => {
      // Only reconnect if this is still the active socket
      if (this.ws === ws) this._scheduleReconnect()
    })
    ws.addEventListener('error', () => {
      if (this.ws === ws) ws.close()
    })
  }

  stop() {
    this.isStopped = true
    this._clearReconnect()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  _setStatus(status) {
    if (this.status === status) return
    this.status = status
    if (this.onStatusChange) this.onStatusChange(status)
  }

  _handleMessage(event) {
    try {
      const data = JSON.parse(event.data)
      if (data?.type && data?.payload) this.onEvent(data)
    } catch {}
  }

  _scheduleReconnect() {
    if (this.isStopped) return

    this._setStatus('offline')
    this._clearReconnect()

    const delay = RETRY_BACKOFF_MS[Math.min(this._attempts, RETRY_BACKOFF_MS.length - 1)]
    this._attempts++
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay)
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  async _fetchJson(path) {
    try {
      const response = await fetch(path)
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }

  _getWebSocketUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${protocol}//${window.location.host}${this._buildApiPath('/ws', this.activeBoardSlug || this.routeBoardSlug)}`
  }

  _buildApiPath(path, boardSlug) {
    if (!boardSlug) return path
    return `${path}?board=${encodeURIComponent(boardSlug)}`
  }
}

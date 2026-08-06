import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'

import { WebSocket, WebSocketServer } from 'ws'

import { serializeConfig } from '../board/config'
import { getBoard, serializeMessageState } from '../board/registry'
import { syncBoardDisplayMessages } from '../board/screens'
import type { PluginRegistry } from '../plugins/base'
import type { BoardRegistry, BroadcastEvent, DisplayConfig, MessageState } from '../types'

const HEARTBEAT_INTERVAL_MS = 30_000

export function buildMessageEvent(state: MessageState): BroadcastEvent {
  return { type: 'message_state', payload: serializeMessageState(state) }
}

export function buildConfigEvent(config: DisplayConfig): BroadcastEvent {
  return { type: 'config_state', payload: serializeConfig(config) }
}

export interface WsHub {
  broadcast: (boardSlug: string, event: BroadcastEvent) => void
  broadcastMessageState: (boardSlug: string) => void
  broadcastDisplayConfig: (boardSlug: string) => void
  close: () => Promise<void>
}

/**
 * Attaches a `/ws` endpoint to the http server and tracks sockets per board.
 * The wire format -- one JSON `{type, payload}` per frame -- is what
 * web/src/RemoteMessageSync.js already speaks, so it must not drift.
 */
export function createWsHub(server: Server, registry: BoardRegistry, plugins: PluginRegistry): WsHub {
  const wss = new WebSocketServer({ noServer: true })
  const clientsByBoard = new Map<string, Set<WebSocket>>()

  function clientsFor(boardSlug: string): Set<WebSocket> {
    let clients = clientsByBoard.get(boardSlug)
    if (!clients) {
      clients = new Set()
      clientsByBoard.set(boardSlug, clients)
    }
    return clients
  }

  function broadcast(boardSlug: string, event: BroadcastEvent): void {
    const clients = clientsByBoard.get(boardSlug)
    if (!clients) return

    const frame = JSON.stringify(event)
    for (const client of [...clients]) {
      if (client.readyState !== WebSocket.OPEN) {
        clients.delete(client)
        continue
      }
      try {
        client.send(frame)
      } catch {
        clients.delete(client)
      }
    }
  }

  function broadcastMessageState(boardSlug: string): void {
    const board = getBoard(registry, boardSlug)
    if (board) broadcast(boardSlug, buildMessageEvent(board.messageState))
  }

  function broadcastDisplayConfig(boardSlug: string): void {
    const board = getBoard(registry, boardSlug)
    if (!board) return
    syncBoardDisplayMessages(board, plugins)
    broadcast(boardSlug, buildConfigEvent(board.config))
  }

  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname !== '/ws') return

    const board = getBoard(registry, url.searchParams.get('board'))
    if (!board) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(request, socket, head, (client) => {
      const boardSlug = board.config.slug
      clientsFor(boardSlug).add(client)

      // Seed the new client with current state, exactly as aiohttp did on connect.
      syncBoardDisplayMessages(board, plugins)
      client.send(JSON.stringify(buildConfigEvent(board.config)))
      client.send(JSON.stringify(buildMessageEvent(board.messageState)))

      // aiohttp's `heartbeat=30` became an explicit ping/pong liveness check.
      let alive = true
      client.on('pong', () => {
        alive = true
      })
      const heartbeat = setInterval(() => {
        if (!alive) {
          client.terminate()
          return
        }
        alive = false
        client.ping()
      }, HEARTBEAT_INTERVAL_MS)

      const drop = () => {
        clearInterval(heartbeat)
        clientsFor(boardSlug).delete(client)
      }
      client.on('close', drop)
      client.on('error', drop)
    })
  })

  async function close(): Promise<void> {
    for (const clients of clientsByBoard.values()) {
      for (const client of clients) client.close(1001, 'Server shutting down')
    }
    clientsByBoard.clear()
    await new Promise<void>((resolve) => wss.close(() => resolve()))
  }

  return { broadcast, broadcastMessageState, broadcastDisplayConfig, close }
}

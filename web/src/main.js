import './css/reset.css'
import './css/layout.css'
import './css/board.css'
import './css/tile.css'
import './css/responsive.css'

import { Board } from './Board.js'
import { SoundEngine } from './SoundEngine.js'
import { MessageRotator } from './MessageRotator.js'
import { KeyboardController } from './KeyboardController.js'
import { RemoteMessageSync } from './RemoteMessageSync.js'
import { BOARD_CONFIG, BOARD_SLUG } from './constants.js'

// Module scripts are deferred — DOM is already parsed when this runs.
// Do NOT use DOMContentLoaded: top-level await in constants.js can cause
// that event to fire before this module executes, so the listener would miss it.
void bootstrap()

async function bootstrap() {
  const boardContainer = document.getElementById('board-container')
  if (!boardContainer) return

  // constants.js has already blocked on /api/config, so reaching this line
  // means the backend answered. Clear the shell's connecting message.
  document.getElementById('boot-status')?.remove()

  const soundEngine = new SoundEngine()
  const displayConfig = BOARD_CONFIG
  let layoutSignature = serializeLayout(displayConfig)

  const remoteSync = new RemoteMessageSync(handleRealtimeEvent, BOARD_SLUG, handleConnectionStatus)
  remoteSync.setActiveBoardSlug(displayConfig.boardSlug)

  let remoteOverrideActive = false
  const board = new Board(boardContainer, soundEngine, displayConfig)
  const rotator = new MessageRotator(board, {
    messages: displayConfig.defaultMessages,
    messageDurationSeconds: displayConfig.messageDurationSeconds,
  })
  const keyboard = new KeyboardController(rotator, soundEngine, board)
  void keyboard

  // Pre-load audio buffers immediately so they're ready when the user interacts.
  // The AudioContext starts suspended (browser autoplay policy) — we resume it
  // on the first user gesture so sound plays instantly without delay.
  const audioReady = soundEngine.init()
  let audioResumed = false
  const resumeAudio = () => {
    if (audioResumed) return
    audioResumed = true
    audioReady.then(() => soundEngine.resume())
    document.removeEventListener('click', resumeAudio)
    document.removeEventListener('keydown', resumeAudio)
    document.removeEventListener('pointerdown', resumeAudio)
  }
  document.addEventListener('click', resumeAudio)
  document.addEventListener('keydown', resumeAudio)
  document.addEventListener('pointerdown', resumeAudio)

  // PR #4: Sound mode UI sync
  const volumeBtn = document.getElementById('volume-btn')
  const syncSoundUi = () => {
    if (!volumeBtn || !soundEngine.getSoundState) return
    const state = soundEngine.getSoundState()
    volumeBtn.classList.toggle('muted', state.muted)
    volumeBtn.title = `Sound mode: ${state.label}`
  }
  document.addEventListener('soundmodechange', syncSoundUi)
  syncSoundUi()

  if (volumeBtn) {
    volumeBtn.addEventListener('click', () => {
      resumeAudio()
      soundEngine.toggleMute()
    })
  }

  // PR #10: Fullscreen button
  // stopPropagation prevents resumeAudio from consuming the user-activation
  // token needed by requestFullscreen().
  const fullscreenBtn = document.getElementById('fullscreen-btn')
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        document.documentElement.requestFullscreen().catch(() => {})
      }
    })
  }

  // PR #10: Fullscreen tile resizing
  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement
    document.body.classList.toggle('fullscreen-active', isFs)

    if (isFs) {
      setTimeout(() => {
        const padH = 72
        const padV = 60
        const gap = 5
        const maxW = (window.innerWidth - padH - (board.cols - 1) * gap) / board.cols
        const maxH = (window.innerHeight - padV - (board.rows - 1) * gap) / board.rows
        const size = Math.floor(Math.min(maxW, maxH))
        board.boardEl.style.setProperty('--tile-size', `${size}px`)
        board.boardEl.style.setProperty('--tile-gap', `${gap}px`)
      }, 100)
    } else {
      board.boardEl.style.removeProperty('--tile-size')
      board.boardEl.style.removeProperty('--tile-gap')
    }
  })

  // Countdown progress bar — only runs rAF when a countdown is active
  const countdownFill = document.getElementById('countdown-fill')
  if (countdownFill) {
    let countdownRaf = null
    const updateCountdown = () => {
      const progress = rotator.getCountdownProgress()
      if (progress !== null) {
        countdownFill.style.width = `${(progress * 100).toFixed(1)}%`
        countdownRaf = requestAnimationFrame(updateCountdown)
      } else {
        countdownFill.style.width = '0%'
        countdownRaf = null
      }
    }
    // Poll every second to detect when countdown starts, then switch to rAF
    setInterval(() => {
      if (countdownRaf === null && rotator.getCountdownProgress() !== null) {
        countdownRaf = requestAnimationFrame(updateCountdown)
      }
    }, 1000)
  }

  // PR #2: Remote message sync
  const initialMessageState = await remoteSync.fetchMessageState()
  if (initialMessageState?.hasOverride) {
    handleMessageState(initialMessageState)
  } else {
    rotator.start()
  }

  remoteSync.connect()

  function handleConnectionStatus(status) {
    const indicator = document.getElementById('config-indicator')
    if (!indicator) return
    indicator.classList.toggle('online', status === 'online')
    indicator.classList.toggle('offline', status !== 'online')
    indicator.title = status === 'online' ? 'Connected to server' : 'Reconnecting to server…'
  }

  function handleRealtimeEvent(event) {
    if (!event || !event.type || !event.payload) return

    if (event.type === 'message_state') {
      handleMessageState(event.payload)
      return
    }

    if (event.type === 'config_state') {
      handleConfigState(event.payload)
    }
  }

  /**
   * Content changes are applied in place; only a change the running board
   * cannot absorb — a different grid, charset, palette or animation timing —
   * warrants a reload. Reloading on any change at all would restart every
   * viewer each time a plugin screen refreshed, which for the clock is twice a
   * minute.
   */
  function handleConfigState(nextConfig) {
    if (!nextConfig) return

    const nextLayout = serializeLayout(nextConfig)
    if (nextLayout !== layoutSignature) {
      layoutSignature = nextLayout
      window.location.reload()
      return
    }

    if (Array.isArray(nextConfig.defaultMessages)) {
      // Deliberately not rotator.start(): that reshuffles and jumps to a new
      // screen, which would be visible every time the clock ticks.
      rotator.setMessages(nextConfig.defaultMessages)
    }
    if (Number.isFinite(nextConfig.messageDurationSeconds)) {
      rotator.setMessageDurationSeconds(nextConfig.messageDurationSeconds)
    }
  }

  function handleMessageState(state) {
    if (!state || typeof state.hasOverride !== 'boolean') return

    if (state.hasOverride) {
      remoteOverrideActive = true
      rotator.enableRemoteOverride()
      board.displayMessage(Array.isArray(state.lines) ? state.lines : [], { interrupt: true })
      return
    }

    if (remoteOverrideActive) {
      remoteOverrideActive = false
      rotator.disableRemoteOverride({ showNextMessage: true, interrupt: true })
      return
    }

    if (!rotator.hasStarted()) {
      rotator.start()
    }
  }
}

/** Everything a running board cannot change without being rebuilt. */
function serializeLayout(config) {
  return JSON.stringify({
    boardSlug: config.boardSlug,
    cols: config.cols,
    rows: config.rows,
    charset: config.charset,
    accentColors: config.accentColors,
    timing: config.timing,
  })
}

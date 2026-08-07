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
import { BOARD_SLUG, BOOT_PRESENTATION, cachePresentation, fetchConfig, samePresentation } from './config.js'
import { connectingLines, failureLines, reconnectingLines } from './statusScreen.js'

/**
 * How long the board keeps showing its rotation after the socket drops. A
 * container restart is over in about a second, and blanking the display for
 * every one of those would be worse than the stale content it prevents.
 */
const OFFLINE_GRACE_MS = 20_000

/** Floor for a computed tile, so a tiny window cannot produce a zero-size grid. */
const MIN_TILE_SIZE = 8

// Module scripts are deferred — the DOM is already parsed when this runs.
void bootstrap()

async function bootstrap() {
  const boardContainer = document.getElementById('board-container')
  if (!boardContainer) return

  // Built before the server has been asked anything, so the wait and any
  // failures happen on the board rather than only in the console.
  let board = new Board(boardContainer, null, BOOT_PRESENTATION)
  fitBoard()
  board.displayMessage(connectingLines())

  const displayConfig = await fetchConfig((failure) => board.displayMessage(failureLines(failure)))
  cachePresentation(displayConfig)

  // A board whose layout already matches is kept as-is: the status message just
  // flips into the first real screen, with no rebuild and no visible swap.
  if (!samePresentation(BOOT_PRESENTATION, displayConfig)) {
    boardContainer.replaceChildren()
    board = new Board(boardContainer, null, displayConfig)
    // The rebuild may have a different grid, and it is a new element either
    // way -- the inline sizing from the boot board went with the old one.
    fitBoard()
  }

  const soundEngine = new SoundEngine()
  board.setSoundEngine(soundEngine)

  let layoutSignature = serializeLayout(displayConfig)

  const remoteSync = new RemoteMessageSync(handleRealtimeEvent, BOARD_SLUG, handleConnectionStatus)
  remoteSync.setActiveBoardSlug(displayConfig.boardSlug)

  let remoteOverrideActive = false
  let offlineTimer = null
  let showingOfflineScreen = false

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
  // Used to live on Board, which meant Board reached into page chrome to keep a
  // label current. It is the same event either way, so it belongs here.
  const shortcutSoundMode = document.querySelector('.shortcut-sound-mode')
  const syncSoundUi = () => {
    if (!soundEngine.getSoundState) return
    const state = soundEngine.getSoundState()
    if (volumeBtn) {
      // `is-off` swaps volume-2 for volume-x; the label rides in the tooltip,
      // which is the only place it is readable now that the button has no text.
      volumeBtn.classList.toggle('is-off', state.muted)
      volumeBtn.dataset.tooltip = `Sound: ${state.label}`
    }
    if (shortcutSoundMode) shortcutSoundMode.textContent = state.label
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

  // Keyboard shortcuts panel. It used to be a circle badge on the board itself
  // labelled 'N' -- a key nothing ever handled -- so moving it to the nav takes
  // a false affordance with it.
  const shortcutsBtn = document.getElementById('shortcuts-btn')
  const shortcutsOverlay = document.getElementById('shortcuts-overlay')
  if (shortcutsBtn && shortcutsOverlay) {
    const setShortcutsOpen = (open) => {
      shortcutsOverlay.classList.toggle('visible', open)
      shortcutsBtn.setAttribute('aria-expanded', String(open))
    }

    shortcutsBtn.addEventListener('click', (event) => {
      // Without this the document listener below sees the same click and
      // closes the panel in the same tick it was opened.
      event.stopPropagation()
      setShortcutsOpen(!shortcutsOverlay.classList.contains('visible'))
    })

    document.addEventListener('click', (event) => {
      if (!shortcutsOverlay.contains(event.target)) setShortcutsOpen(false)
    })

    // Not KeyboardController's job: it ignores keys while a button has focus,
    // which is exactly the state you are in right after opening this.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') setShortcutsOpen(false)
    })
  }

  // Entering or leaving fullscreen changes both the chrome and the viewport.
  document.addEventListener('fullscreenchange', () => {
    document.body.classList.toggle('fullscreen-active', !!document.fullscreenElement)
    // Reading offsetHeight below flushes the class change first, so the header
    // and loading line already measure 0 by the time fitBoard() sees them.
    fitBoard()
  })

  // One frame per burst — a drag across the window fires resize continuously.
  let resizeRaf = null
  window.addEventListener('resize', () => {
    if (resizeRaf !== null) return
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = null
      fitBoard()
    })
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
    // interrupt: the board may still be animating the connecting or failure
    // screen, and without this the first real message only queues behind it.
    rotator.start({ interrupt: true })
  }

  remoteSync.connect()

  /**
   * Scale the tiles to whatever space is left over.
   *
   * The grid is server-configurable, so no CSS clamp can be right for every
   * `cols`: at 28 columns a 1440px window asked for ~1810px of tiles, and
   * `.board`'s `overflow: hidden` quietly ate the outer columns at both edges.
   * Measuring instead means any grid the server sends fits, on this page, on
   * display.html, and in fullscreen — one code path where there used to be a
   * CSS guess plus a fullscreen-only correction.
   *
   * Reads `board` rather than closing over it: the boot board is replaced once
   * the real config arrives.
   */
  function fitBoard() {
    const boardEl = board.boardEl
    const style = getComputedStyle(boardEl)
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)

    // Integer rather than the old `clamp(3px, 0.3vw, 5px)`: a fractional gap
    // multiplied across 27 columns is enough to overflow by a tile.
    const gap = window.innerWidth <= 600 ? 2 : window.innerWidth <= 900 ? 3 : 5

    // Published for CSS: the top accent squares sit below the navbar, and this
    // is the only place its height is measured. Runs before the first paint,
    // and again whenever the chrome can have changed.
    const chrome = chromeHeight()
    document.documentElement.style.setProperty('--chrome-height', `${chrome}px`)

    const availableWidth = window.innerWidth - padX - (board.cols - 1) * gap
    const availableHeight = window.innerHeight - chrome - padY - (board.rows - 1) * gap
    const size = Math.max(MIN_TILE_SIZE, Math.floor(Math.min(availableWidth / board.cols, availableHeight / board.rows)))

    boardEl.style.setProperty('--tile-size', `${size}px`)
    boardEl.style.setProperty('--tile-gap', `${gap}px`)
  }

  /** Zero on display.html, which has no chrome, and in fullscreen, where it is hidden. */
  function chromeHeight() {
    return ['.loading-bar', '.header'].reduce((total, selector) => total + (document.querySelector(selector)?.offsetHeight ?? 0), 0)
  }

  function handleConnectionStatus(status) {
    const indicator = document.getElementById('config-indicator')
    if (indicator) {
      indicator.classList.toggle('online', status === 'online')
      indicator.classList.toggle('offline', status !== 'online')
      indicator.title = status === 'online' ? 'Connected to server' : 'Reconnecting to server…'
    }

    if (status === 'online') {
      clearOfflineTimer()
      if (showingOfflineScreen) {
        // The hub seeds every new client with config_state and message_state on
        // connect, so real content is already on its way — this just gets the
        // rotation running again underneath it.
        showingOfflineScreen = false
        rotator.start({ interrupt: true })
      }
      return
    }

    if (offlineTimer === null && !showingOfflineScreen) {
      offlineTimer = window.setTimeout(() => {
        offlineTimer = null
        showingOfflineScreen = true
        rotator.stop()
        board.displayMessage(reconnectingLines(), { interrupt: true })
      }, OFFLINE_GRACE_MS)
    }
  }

  function clearOfflineTimer() {
    if (offlineTimer !== null) {
      window.clearTimeout(offlineTimer)
      offlineTimer = null
    }
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
      cachePresentation(nextConfig)
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

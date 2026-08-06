import { Tile } from './Tile.js'

const DISPLAY_MODES = ['color', 'matrix', 'grayscale']

// PR #1: Display mode accent palettes. Only 'color' is server-configurable —
// matrix and grayscale are fixed looks, not board settings.
const FIXED_ACCENTS = {
  matrix: ['#00FF41', '#00CC33', '#00FF88', '#003B00', '#00FF41'],
  grayscale: ['#888888', '#AAAAAA', '#666666', '#CCCCCC', '#555555'],
}

export class Board {
  /**
   * `config` is the /api/config shape: { cols, rows, charset, accentColors,
   * timing }. Taken as an argument rather than imported so a board can be built
   * before the server answers, which is how the connecting and error screens
   * get somewhere to render.
   */
  constructor(containerEl, soundEngine, config) {
    this.cols = config.cols
    this.rows = config.rows
    this.staggerDelay = config.timing.staggerDelay
    this.accentsByMode = { ...FIXED_ACCENTS, color: config.accentColors }
    this.soundEngine = soundEngine
    this.isTransitioning = false
    this.pendingLines = null
    // Bumped per transition so a superseded one cannot apply its result late.
    this._transitionVersion = 0
    this.tiles = []
    this.currentGrid = []
    this.accentIndex = 0
    this.modeIndex = 0

    // Build board DOM
    this.boardEl = document.createElement('div')
    this.boardEl.className = 'board'
    this.boardEl.style.setProperty('--grid-cols', this.cols)
    this.boardEl.style.setProperty('--grid-rows', this.rows)

    // Left accent squares
    this.leftBar = this._createAccentBar('accent-bar-left')
    this.boardEl.appendChild(this.leftBar)

    // Tile grid
    this.gridEl = document.createElement('div')
    this.gridEl.className = 'tile-grid'

    // One shared object rather than a copy per tile — a 28x5 board is 140 of them.
    const tileTheme = {
      charset: config.charset,
      flipStepDuration: config.timing.flipStepDuration,
      flipStepFastDuration: config.timing.flipStepFastDuration,
      flipSettleDuration: config.timing.flipSettleDuration,
    }

    for (let r = 0; r < this.rows; r++) {
      const row = []
      const charRow = []
      for (let c = 0; c < this.cols; c++) {
        const tile = new Tile(r, c, this.cols, tileTheme)
        tile.setChar(' ')
        this.gridEl.appendChild(tile.el)
        row.push(tile)
        charRow.push(' ')
      }
      this.tiles.push(row)
      this.currentGrid.push(charRow)
    }

    this.boardEl.appendChild(this.gridEl)

    // Right accent squares
    this.rightBar = this._createAccentBar('accent-bar-right')
    this.boardEl.appendChild(this.rightBar)

    // Keyboard hint icon (bottom-left)
    const hint = document.createElement('div')
    hint.className = 'keyboard-hint'
    hint.textContent = 'N'
    hint.title = 'Keyboard shortcuts'
    hint.addEventListener('click', (e) => {
      e.stopPropagation()
      const overlay = this.boardEl.querySelector('.shortcuts-overlay')
      if (overlay) overlay.classList.toggle('visible')
    })
    this.boardEl.appendChild(hint)

    // Shortcuts overlay
    const overlay = document.createElement('div')
    overlay.className = 'shortcuts-overlay'
    overlay.innerHTML = `
      <div><span>Next message</span><kbd>Enter</kbd></div>
      <div><span>Previous</span><kbd>\u2190</kbd></div>
      <div><span>Fullscreen</span><kbd>F</kbd></div>
      <div><span>Sound: <strong class="shortcut-sound-mode">Authentic</strong></span><kbd>M</kbd></div>
      <div><span>Random</span><kbd>R</kbd></div>
      <div><span>Color mode</span><kbd>C</kbd></div>
    `
    this.boardEl.appendChild(overlay)

    this.shortcutSoundModeEl = overlay.querySelector('.shortcut-sound-mode')
    this._syncSoundShortcutLabel()
    document.addEventListener('soundmodechange', () => this._syncSoundShortcutLabel())

    containerEl.appendChild(this.boardEl)
    this._updateAccentColors()
  }

  _createAccentBar(extraClass) {
    const bar = document.createElement('div')
    bar.className = `accent-bar ${extraClass}`
    for (let i = 0; i < 2; i++) {
      const seg = document.createElement('div')
      seg.className = 'accent-segment'
      bar.appendChild(seg)
    }
    return bar
  }

  // PR #1: Display mode cycling
  cycleMode() {
    this.modeIndex = (this.modeIndex + 1) % DISPLAY_MODES.length
    this._updateAccentColors()
    return DISPLAY_MODES[this.modeIndex]
  }

  get displayMode() {
    return DISPLAY_MODES[this.modeIndex]
  }

  /** Lets the silent boot board adopt the real engine without being rebuilt. */
  setSoundEngine(soundEngine) {
    this.soundEngine = soundEngine
    this._syncSoundShortcutLabel()
  }

  _updateAccentColors() {
    const palette = this.accentsByMode[this.displayMode]
    const color = palette[this.accentIndex % palette.length]
    const segments = this.boardEl.querySelectorAll('.accent-segment')
    segments.forEach((seg) => {
      seg.style.backgroundColor = color
    })
  }

  _syncSoundShortcutLabel() {
    if (!this.shortcutSoundModeEl || !this.soundEngine || !this.soundEngine.getSoundState) return
    const state = this.soundEngine.getSoundState()
    this.shortcutSoundModeEl.textContent = state.label
  }

  // PR #2: interrupt support
  interruptTransition() {
    this._transitionVersion += 1
    this.pendingLines = null
    this.isTransitioning = false

    for (const row of this.tiles) {
      for (const tile of row) {
        tile.cancelAnimation()
      }
    }

    this.currentGrid = this.tiles.map((row) => row.map((tile) => tile.currentChar))
  }

  displayMessage(lines, { interrupt = false } = {}) {
    if (interrupt) {
      this.interruptTransition()
    } else if (this.isTransitioning) {
      this.pendingLines = [...lines]
      return null
    }

    this.isTransitioning = true
    this._transitionVersion += 1
    const version = this._transitionVersion

    const newGrid = this._formatToGrid(lines)

    let hasChanges = false
    const animations = []
    const soundEvents = []

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const newChar = newGrid[r][c]
        const oldChar = this.currentGrid[r][c]

        if (newChar !== oldChar) {
          const delay = (r * this.cols + c) * this.staggerDelay
          const tile = this.tiles[r][c]
          const plan = tile.getTransitionPlan(newChar, delay)

          if (!plan) continue

          animations.push(tile.flipTo(newChar, delay, plan))
          soundEvents.push(...plan.soundEvents)
          hasChanges = true
        }
      }
    }

    if (hasChanges && this.soundEngine) {
      this.soundEngine.playTransition(soundEvents)
    }

    this.accentIndex++
    this._updateAccentColors()

    if (!hasChanges) {
      this.currentGrid = newGrid
      this.isTransitioning = false
      return Promise.resolve(false)
    }

    return Promise.allSettled(animations).then(() => {
      // An interrupt (or a newer message) already took over. Applying this
      // grid would desync currentGrid from what the tiles actually show, and
      // the next diff would skip tiles that are still mid-flip -- leaving them
      // stuck with .is-flipping and never repainted.
      if (version !== this._transitionVersion) return false

      this.currentGrid = newGrid
      this.isTransitioning = false

      if (this.pendingLines) {
        const nextLines = this.pendingLines
        this.pendingLines = null
        this.displayMessage(nextLines)
      }

      return true
    })
  }

  _formatToGrid(lines) {
    // Cache segmenter instance — Intl.Segmenter handles emojis as single grapheme clusters
    if (!this._segmenter) {
      this._segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter() : null
    }
    const segment = this._segmenter ? (str) => [...this._segmenter.segment(str)].map((s) => s.segment) : (str) => [...str] // Fallback for Firefox < 125
    const grid = []
    for (let r = 0; r < this.rows; r++) {
      const line = (lines[r] || '').toUpperCase()
      const chars = segment(line)
      const padTotal = this.cols - chars.length
      const padLeft = Math.max(0, Math.floor(padTotal / 2))
      const padRight = Math.max(0, this.cols - padLeft - chars.length)
      grid.push([...Array(padLeft).fill(' '), ...chars, ...Array(padRight).fill(' ')])
    }
    return grid
  }
}

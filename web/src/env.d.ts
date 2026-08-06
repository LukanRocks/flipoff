/**
 * Injected by Vite's `define` from backend/config.json at build time — see the
 * `bootPresentation()` comment in vite.config.ts. It is the presentation half
 * of an /api/config response, used only to draw the board's own status screens
 * before the server has answered.
 */
declare const __BOOT_PRESENTATION__: {
  cols: number
  rows: number
  charset: string
  accentColors: string[]
  timing: {
    flipStepDuration: number
    flipStepFastDuration: number
    flipSettleDuration: number
    staggerDelay: number
    messageInterval: number
  }
}

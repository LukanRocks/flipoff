import { defineConfig } from 'vite'

const BACKEND = 'http://localhost:8080'

export default defineConfig({
  // Absolute, unlike the board's './'. The admin only ever lives at /admin, so
  // its asset URLs can be fixed -- and being absolute they resolve the same
  // whether the page was reached as /admin, /admin/ or a deeper admin route.
  // The board cannot do this: it is also served at /{boardSlug}, one path
  // segment deep, where only relative URLs land on /assets.
  base: '/admin/',
  build: {
    // Emitted under dist/assets and served by the backend at /admin/assets, a
    // separate mount from the board's /assets. Two builds writing the same
    // asset directory name is exactly why the admin needs its own base.
    assetsDir: 'assets',
  },
  server: {
    port: 5174,
    // No /ws entry: the admin never opens a socket. It refetches after each
    // mutation, and the backend broadcasts to displays on its behalf.
    proxy: {
      '/api': BACKEND,
    },
  },
})

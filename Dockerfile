FROM node:22-alpine AS base
RUN corepack enable

FROM base AS board-build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY board/package.json ./board/package.json
COPY admin/package.json ./admin/package.json
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter flipoff-board
# The board inlines its boot grid from the backend's config.json at build time.
COPY backend/config.json ./backend/config.json
COPY board/ ./board/
RUN pnpm -C board build

FROM base AS admin-build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY board/package.json ./board/package.json
COPY admin/package.json ./admin/package.json
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter flipoff-admin
COPY admin/ ./admin/
RUN pnpm -C admin build

FROM base AS backend-build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY board/package.json ./board/package.json
COPY admin/package.json ./admin/package.json
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter flipoff-backend
COPY backend/ ./backend/
RUN pnpm -C backend build

FROM base AS production
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY board/package.json ./board/package.json
COPY admin/package.json ./admin/package.json
COPY backend/package.json ./backend/package.json

# No native modules here (bcryptjs is pure JS), so this needs no toolchain. The
# pnpm store is dropped in the same layer that creates it -- a later RUN would
# leave it in the image regardless, since layers only ever add.
RUN pnpm install --frozen-lockfile --filter flipoff-backend --prod \
  && rm -rf /root/.cache /root/.local/share/pnpm/store

COPY --from=backend-build /app/backend/dist ./backend/dist
# Grid, charset, colour, timing and message defaults. Bind-mount over this path
# (or point FLIPOFF_CONFIG_PATH elsewhere) to change them without a rebuild.
COPY backend/config.json ./backend/config.json
# The two frontends the server serves, each under its own root. Both Vite
# builds emit an `assets` directory, so they are kept apart here and mounted at
# separate URL prefixes (/assets and /admin/assets). The board is a pure client
# of /api/config; the admin talks only to /api/admin.
COPY --from=board-build /app/board/dist ./backend/public/board
COPY --from=admin-build /app/admin/dist ./backend/public/admin

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/config',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

WORKDIR /app/backend
CMD ["node", "dist/main.js"]

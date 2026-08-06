FROM node:22-alpine AS base
RUN corepack enable

FROM base AS web-build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json ./web/package.json
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter flipoff-web
COPY web/ ./web/
RUN pnpm -C web build

FROM base AS backend-build
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json ./web/package.json
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter flipoff-backend
COPY backend/ ./backend/
RUN pnpm -C backend build

FROM base AS production
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json ./web/package.json
COPY backend/package.json ./backend/package.json

# No native modules here (bcryptjs is pure JS), so this needs no toolchain. The
# pnpm store is dropped in the same layer that creates it -- a later RUN would
# leave it in the image regardless, since layers only ever add.
RUN pnpm install --frozen-lockfile --filter flipoff-backend --prod \
  && rm -rf /root/.cache /root/.local/share/pnpm/store

COPY --from=backend-build /app/backend/dist ./backend/dist
# The frontend is served from backend/public, which is also where the server
# reads config.json for its grid/timing/message defaults.
COPY --from=web-build /app/web/dist ./backend/public

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/config',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

WORKDIR /app/backend
CMD ["node", "dist/main.js"]

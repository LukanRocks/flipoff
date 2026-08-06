# Transitional image: the frontend is already a Vite build, the backend is still
# Python. The TypeScript port collapses this back to a single node base.

# Stage 1 — build the frontend bundle
FROM node:22-alpine AS web-build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY web/package.json ./web/package.json
COPY backend/package.json ./backend/package.json
RUN pnpm install --frozen-lockfile --filter flipoff-web
COPY web/ ./web/
RUN pnpm -C web build

# Stage 2 — Python backend serving that bundle
FROM python:3.12-slim
WORKDIR /app

COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ ./backend/
COPY --from=web-build /app/web/dist ./web/dist
# server.py reads its grid/timing/message defaults from the source config, not
# the built copy, so it has to be present even though nothing serves it.
COPY web/public/config.json ./web/public/config.json

ENV PORT=8080
EXPOSE 8080

WORKDIR /app/backend
CMD ["python", "server.py"]

FROM node:20-alpine AS web
WORKDIR /build
COPY apps/web/package.json apps/web/package-lock.json* ./
RUN npm ci
COPY apps/web/ ./
RUN npm run build

FROM node:20-alpine AS backend
RUN apk add --no-cache python3 make g++
WORKDIR /build
COPY apps/backend/package.json apps/backend/package-lock.json* ./
RUN npm ci
COPY apps/backend/tsconfig.json ./
COPY apps/backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
RUN apk add --no-cache wget
RUN addgroup -g 1001 taskbridge && adduser -u 1001 -G taskbridge -D taskbridge
WORKDIR /app

COPY --from=backend /build/package.json ./
COPY --from=backend /build/node_modules ./node_modules
COPY --from=backend /build/dist ./dist
COPY --from=web /build/dist ./public

COPY artifacts ./artifacts-input
RUN mkdir -p ./public/downloads && \
    if [ -f artifacts-input/task-bridge.apk ]; then \
      cp artifacts-input/task-bridge.apk ./public/downloads/task-bridge.apk; \
    fi

RUN mkdir -p /app/data && chown -R taskbridge:taskbridge /app

ARG VERSION=0.1.0
LABEL org.opencontainers.image.title="task-bridge" \
  org.opencontainers.image.description="Task Bridge API and Web UI" \
  org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production \
  PORT=3000 \
  DATABASE_PATH=/app/data/bridge.db

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

USER taskbridge

CMD ["node", "dist/index.js"]

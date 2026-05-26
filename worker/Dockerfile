FROM node:22-alpine
WORKDIR /app
COPY scripts/vikunja-api.mjs scripts/vikunja-api.mjs
COPY scripts/vikunja-worker.mjs scripts/vikunja-worker.mjs
COPY scripts/projects.mjs scripts/projects.mjs
RUN mkdir -p /app/worker
VOLUME ["/app/worker"]
CMD ["node", "scripts/vikunja-worker.mjs", "watch"]

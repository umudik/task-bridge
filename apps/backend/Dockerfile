FROM node:20-alpine AS web
WORKDIR /web
COPY apps/web/package.json ./
RUN npm install
COPY apps/web/ ./
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app

COPY apps/backend/package.json ./
RUN npm install

COPY apps/backend/tsconfig.json ./
COPY apps/backend/src ./src
RUN npm run build && npm prune --omit=dev

COPY --from=web /web/dist ./public

EXPOSE 3000

CMD ["node", "dist/index.js"]

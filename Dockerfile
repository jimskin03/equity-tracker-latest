# Production image (used by Render and docker build .)
# Local hot-reload development: docker compose up --build (uses Dockerfile.dev)

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

RUN npm run build

# Serve stage — Express static + API proxies (OpenFIGI / Yahoo)
FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./
COPY --from=builder /app/dist ./dist

# Render sets PORT; default matches local Docker mapping
ENV PORT=5173
EXPOSE 5173

CMD ["npm", "run", "start"]

# Deployment & Architecture (concise)

Summary
- App: Equity Tracker — React + TypeScript SPA that tracks holdings by ISIN.
- Live: https://equity-tracker-latest.onrender.com
- Purpose: Client UI persisted in browser localStorage; server provides static hosting + API proxies for third-party data.

Architecture (high level)
- Frontend: React (TypeScript), built with Vite → produces /dist
- Backend: small Express server (server.mjs) serving static files and proxying third-party APIs
- Containerization: multi-stage Docker builds (Dockerfile / Dockerfile.prod). Dev image in Dockerfile.dev.
- Deployment config: render.yaml for Render (uses Dockerfile.prod)
- No external DB: portfolio stored in browser localStorage

Tools & core libs
- React, react-dom (frontend)
- TypeScript, Vite (build/dev)
- Express (static + proxy)
- http-proxy-middleware (proxying OpenFIGI/Yahoo)
- npm (package.json), Docker (Dockerfile*), docker-compose (docker-compose.yml)
- Linter: oxlint
- Node base image: node:22-alpine (used in Dockerfiles)

External APIs (proxied)
- OpenFIGI (https://api.openfigi.com)
  - Usage: ISIN → security metadata (name).
  - Proxy path used by the app: /api/openfigi/*  → forwarded to https://api.openfigi.com/*
  - Note: free tier may be used without an API key for light usage; follow OpenFIGI limits for heavier usage.
- Yahoo Finance (https://query1.finance.yahoo.com)
  - Usage: latest prices / chart/quote
  - Proxy path used by the app: /api/yahoo/* → forwarded to https://query1.finance.yahoo.com/*
  - Note: unofficial, rate-limited; occasional unavailability possible.

Important server behavior
- server.mjs:
  - Serves static assets from dist/
  - Proxies:
    - /api/openfigi → https://api.openfigi.com (content-type ensured for POSTs)
    - /api/yahoo → https://query1.finance.yahoo.com (User-Agent & Accept headers set)
  - SPA fallback: non-/api routes return index.html
  - Logs proxy errors to console and returns 502 JSON errors on proxy failures

Run & build (quick commands)
- Local dev (Vite):
  - npm install
  - npm run dev
  - Open: http://localhost:5173
- Local docker dev (uses Dockerfile.dev):
  - docker compose up --build
  - Exposes port 5173
- Production (local):
  - npm install
  - npm run build
  - npm start  # runs node server.mjs
- Docker production image:
  - docker build -t equity-tracker:prod -f Dockerfile.prod .
  - docker run --rm -p 5173:5173 equity-tracker:prod

Render deployment
- render.yaml configured to build/run the Docker image:
  - runtime: docker
  - dockerfilePath: ./Dockerfile.prod
  - envVars: NODE_ENV=production
  - Render sets PORT for the container (server reads process.env.PORT)
- Health check: / (per render.yaml)

Environment variables
- PORT — server listens on process.env.PORT (default 5173)
- NODE_ENV — production recommended for builds

Ports
- Default application port: 5173 (used in local/dev Docker and server default)

Storage / persistence
- Portfolio stored in browser localStorage (no server-side persistence)

Minimal troubleshooting
- Proxy errors:
  - Check server logs — server.mjs prints proxy error messages prefixed with [openfigi proxy] or [yahoo proxy].
  - If proxies return 502, the upstream API may be unavailable or blocked; retry later.
- Missing static assets after build:
  - Ensure `npm run build` completed and /dist exists. Dockerfiles copy /app/dist during the build stage.
- Rate-limiting/unavailable prices:
  - Yahoo Finance is unofficial and rate-limited — app falls back to cost price when latest price cannot be fetched.
- Port conflicts:
  - Set PORT environment variable before starting the container or process.

Files to inspect / edit
- server.mjs — proxy configuration and static serving logic
- package.json — scripts: dev, build, start, lint
- Dockerfile, Dockerfile.prod, Dockerfile.dev — build & runtime images
- docker-compose.yml — local dev orchestration
- render.yaml — Render build/deploy config
- src/ (entry: src/main.tsx) — frontend code
- README.md — user-facing instructions (this file can be appended or referenced)

Quick copy-ready steps to deploy locally with Docker (summary)
1. Build production image:
   docker build -t equity-tracker:prod -f Dockerfile.prod .
2. Run container:
   docker run --rm -p 5173:5173 equity-tracker:prod
3. Visit:
   http://localhost:5173

If you want, I can:
- Add this file to the repo (create DEPLOYMENT.md) and open a pull request, or
- Append a condensed "Deployment & Architecture" section to README.md directly.  
Tell me which you prefer and I will create the file or update README.md for you.

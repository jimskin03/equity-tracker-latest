# Deployment & Architecture (concise)

Summary
- App: CryptGreg Finance — React + TypeScript workspace with Ledger and Portfolio modules.
- Reference deployment: https://equity-tracker-latest.onrender.com (owned by the previous deployment account)
- Canonical deployment target: https://expensetracker.cryptgregresearch.org
- Purpose: Supabase-backed finance data with a small server for static hosting and third-party API proxies.

Architecture (high level)
- Frontend: React (TypeScript), built with Vite → produces /dist
- Backend: small Express server (server.mjs) serving static files and proxying third-party APIs
- Containerization: multi-stage Docker builds (Dockerfile / Dockerfile.prod). Dev image in Dockerfile.dev.
- Deployment config: render.yaml for Render (uses Dockerfile.prod)
- Database: Expense Ledger and account-scoped Portfolio records are stored in Supabase.

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
- `render.yaml` configures a web service to build/run the Docker image:
  - runtime: docker
  - dockerfilePath: ./Dockerfile.prod
  - envVars: NODE_ENV=production
  - Render sets PORT for the container (server reads process.env.PORT)
- Health check: / (per render.yaml)

## Environment variables
- PORT — server listens on process.env.PORT (default 5173)
- NODE_ENV — production recommended for builds
- OPENFIGI_API_KEY — optional. When set, `server.mjs` attaches it as the
  `X-OPENFIGI-APIKEY` header on proxied requests, so the key stays server-side
  and is never part of the browser bundle. It raises the mapping limit from 25
  requests/minute to 25 per 6 seconds and the search limit from 5 to 20 per
  minute (https://www.openfigi.com/api/documentation#rate-limits). Without it the
  API still works at the unauthenticated limit, and the proxy returns the
  provider's `ratelimit-limit` / `ratelimit-remaining` headers either way.

## OpenFIGI response cache

`server.mjs` caches successful `POST /api/openfigi/*` responses in memory before
the proxy, so a repeated ISIN or company-name lookup costs no quota. Only `2xx`
responses are stored; rate-limit and error responses are never cached. Every
response carries `X-OpenFIGI-Cache: HIT|MISS`, and a `HIT` deliberately omits the
`ratelimit-*` headers because no upstream call was made.

| Variable | Default | Purpose |
| --- | --- | --- |
| `OPENFIGI_MAPPING_TTL_MS` | 7 days | `/v3/mapping` cache lifetime; identifier mappings barely change |
| `OPENFIGI_SEARCH_TTL_MS` | 24 hours | `/v3/search` cache lifetime; upstream listings change |
| `OPENFIGI_CACHE_MAX` | 500 | Entry cap, evicted least-recently-used |

The cache is per instance and resets on deploy, which is fine for the current
scale: it exists to absorb repeated lookups, not to be a persistent store.

Ports
- Default application port: 5173 (used in local/dev Docker and server default)

Storage / persistence
- Expense Ledger records remain in the canonical `expense` schema.
- Portfolio accounts, securities, holdings, prices, and trades are stored in the account-scoped `portfolio` schema.
- The first authenticated Portfolio load imports the previous browser payload once; the original payload remains as a rollback copy.

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

For a user-owned deployment, create a Render web service from this repository, let it read `render.yaml`, and add the `expensetracker.cryptgregresearch.org` custom domain. Keep the reference deployment available until the new service and DNS are verified.

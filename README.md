# Equity Tracker

React + TypeScript web app to track equity holdings by **ISIN**.

---WEBSITE IS DEPLOYED--
https://equity-tracker-latest.onrender.com

## Features

- Enter **ISIN**, **holdings (quantity)**, and **cost price**
- Auto-fetch **security name** via [OpenFIGI](https://www.openfigi.com/api) (free)
- Auto-fetch **latest price** via Yahoo Finance chart API (free, no key)
- Save / edit / delete holdings
- Persist portfolio in browser `localStorage`
- Portfolio cost, market value, and unrealized P/L summary

## Run with Docker (recommended)

```bash
cd equity-tracker
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173)

## Run with Node locally

```bash
cd equity-tracker
npm install
npm run dev
```

## Production build

Dev mode uses Vite's proxy (`npm run dev` / `docker compose`). Production needs
the Express server (`server.mjs`) so `/api/*` routes still reach OpenFIGI and
Yahoo Finance:

```bash
npm install
npm run build
npm start
```

### Docker production image

```bash
docker build -t equity-tracker:prod .
docker run --rm -p 5173:5173 equity-tracker:prod
```

On Render, the default `Dockerfile` is production-ready and reads `PORT` from
the environment. `render.yaml` also points at `Dockerfile.prod`.

## Usage

1. Enter an ISIN (e.g. `US0378331005` for Apple)
2. Enter quantity and your cost price
3. Click **Save holding**
4. Use **Edit** to change quantity/cost/ISIN
5. Use **Refresh** / **Refresh prices** to update market prices

## Notes

- OpenFIGI free tier does not require an API key for light usage
- Yahoo Finance is unofficial and rate-limited; prices may occasionally be unavailable
- When latest price cannot be fetched, cost price is used as a fallback on save
- Totals sum raw currency amounts (mixed-currency portfolios are not FX-normalized)
- Production must proxy `/api/openfigi` and `/api/yahoo` (handled by `server.mjs`)

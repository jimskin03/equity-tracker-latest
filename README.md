# Equity Tracker

React + TypeScript web app to track equity holdings by **ISIN**.

---WEBSITE IS DEPLOYED, WITH ERROR--
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

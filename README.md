# CryptGreg Finance

A unified finance workspace combining the existing expense ledger and equity tracker under one CryptGreg Supabase login.

## What is included

- React + TypeScript application shell with Dashboard, Ledger, and Portfolio navigation
- Shared root-domain Supabase session for `cryptgregresearch.org` and its finance subdomains
- Preserved expense ledger UI and canonical `expense.transactions` architecture
- Account-scoped `portfolio` schema with RLS, securities, holdings, price history, and trades
- One-time, idempotent import of legacy equity `localStorage` holdings into Supabase
- Existing OpenFIGI and Yahoo Finance server proxies
- Additive migrations and validation scripts with no destructive table drops

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). Local development uses the same Supabase project by default; `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` can override the publishable browser configuration.

## Production

```bash
npm ci
npm run build
npm start
```

The Express server serves the built SPA, the preserved Ledger module, and the `/api/openfigi` and `/api/yahoo` proxies. Docker and Render definitions remain supported.

## Database rollout

Apply the SQL files in `supabase/migrations` in filename order, then run both scripts in `supabase/validation`. The `expense` and `portfolio` schemas must be exposed through the Supabase Data API.

For the requested deployment URL, add the custom domain `expensetracker.cryptgregresearch.org` to this Render service and create a DNS CNAME record named `expensetracker` pointing to `equity-tracker-latest.onrender.com`. Verify the domain in Render before disabling the old Render subdomain; Render manages the TLS certificate automatically.

See [docs/MIGRATION_ROLLOUT.md](docs/MIGRATION_ROLLOUT.md) for the migration sequence, shared-login requirements, acceptance checks, staged rollout, and rollback plan. The preserved ledger invariants are documented in [docs/LEDGER_ARCHITECTURE.md](docs/LEDGER_ARCHITECTURE.md).

## Security model

The browser only receives the Supabase publishable key. RLS is the authorization boundary, and all record ownership flows through a service-specific account owned by `auth.uid()`. Never place a service-role key in this application.

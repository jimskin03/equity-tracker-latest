# Unified finance migration and rollout

## Scope

This repository is the destination application. It keeps the React/TypeScript shell and market-data proxy from `jimskin03/equity-tracker-latest`, and carries forward the canonical ledger UI plus the complete additive Supabase migration history from `jimskin03/expense-tracker-app`.

The services share one Supabase Auth user but retain separate account-scoped domains:

```text
auth.users.id
  ├─ expense.accounts.user_id
  │    └─ expense.transactions / categories / recurring / receipts
  └─ portfolio.accounts.user_id
       └─ portfolio.securities / holdings / prices / trades
```

## Database order

Apply migrations in filename order. The copied expense migrations preserve the existing ledger schema, backfill, reporting view, reference numbers, reversal rules, transfer integrity, and read-only rollback sources. Then apply `20260911120000_add_portfolio_schema.sql`.

No migration in this rollout drops a ledger, portfolio, public, or archive table. The expense retirement migration only revokes writes from superseded tables and documents the re-grant rollback.

After applying the migrations:

1. Run `supabase/validation/reconcile_transactions.sql`; expect no `FAIL` rows.
2. Run `supabase/validation/validate_portfolio_schema.sql`; expect every row to report `PASS`.
3. Confirm `expense` and `portfolio` are exposed in the Supabase API schema settings.
4. Confirm every deployed finance origin is listed in Supabase Auth redirect URLs.

## Browser holding cutover

On the first authenticated Portfolio load, the app creates/resolves `portfolio.accounts` for `auth.uid()`. If that account has no database holdings, it imports `equity-tracker-holdings-v1` with account-and-ISIN upserts, saves the latest known price, and writes a user-specific migration marker only after all writes succeed.

The original localStorage payload is deliberately retained as a rollback copy. Repeated or interrupted imports are safe because the database uniqueness keys are account scoped.

Browser storage is origin scoped. To migrate records from the current Render deployment automatically, release this build on that existing equity origin first and have each user sign in once before moving Portfolio to a different finance subdomain. If the origin changes first, the old deployment must provide the payload for a manual migration because a new origin cannot read it.

## Shared login

The React shell and preserved Ledger use the same Supabase URL, publishable key, storage key, and root-domain cookie adapter. On `cryptgregresearch.org` and its subdomains, the cookie is scoped to `Domain=cryptgregresearch.org`, `Path=/`, `Secure`, and `SameSite=Lax`. A localStorage mirror supports local HTTP development and the pre-existing Ledger session behavior.

Environment overrides are available as `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never expose a service-role key in the browser.

## Staged release

1. Back up the Supabase project and export the existing portfolio browser payload from a test account.
2. Apply migrations and run both validation scripts.
3. Deploy the unified build to the existing equity origin for the localStorage import window.
4. Deploy the same build to a staging finance subdomain.
5. Sign in at the root site, then open staging Ledger and Portfolio without signing in again.
6. Verify ledger totals, reversal pairs, recurring rules, and transfers against the current expense app.
7. Verify portfolio import, add/edit/delete, per-row refresh, and refresh-all from two browsers.
8. Promote the same build to the production finance subdomain.
9. Keep the old expense and equity deployments available during the rollback window.

## Render custom domain

The Blueprint declares `expensetracker.cryptgregresearch.org` for the existing Render web service. In Render, add and verify that custom domain, then create the DNS provider's CNAME record `expensetracker -> equity-tracker-latest.onrender.com`. Keep the Render subdomain enabled until the custom domain is verified and the localStorage migration window is complete; disabling it causes the old URL to return 404 rather than redirect.

In Supabase API settings, expose the `portfolio` schema after applying the portfolio migration. The current deployed API exposes only `public`, `graphql_public`, and `expense`; until `portfolio` is exposed, Portfolio will show a setup error and cannot save holdings.

## Rollback

- Application: route traffic back to the existing expense and equity deployments. The preserved browser payload remains available for the old equity UI.
- Portfolio database: leave the additive `portfolio` schema in place; it does not affect Ledger. Disable the new UI rather than dropping tables.
- Ledger retirement: if the older client must write the superseded tables, re-grant the documented permissions from the expense architecture notes. Do not delete the archive.

# FinanceDatabase instrument master

The `reference` schema is a global, read-only catalogue populated from
[JerBouma/FinanceDatabase](https://github.com/JerBouma/FinanceDatabase). It is
reference data, not a quote feed: Yahoo Finance remains the current-price
provider and OpenFIGI remains the identifier fallback.

Apply `supabase/migrations/20260911130000_add_reference_instrument_master.sql`
after the existing portfolio migration. It creates `reference.instruments`,
`reference.exchanges`, and `reference.currencies`, backfills existing
`portfolio.securities`, and removes the account+ISIN uniqueness assumption.

For a server-side refresh, set `FINANCEDATABASE_FILES` to the upstream CSV
paths (comma-separated), then run `npm run sync:financedatabase` with
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The included GitHub Actions
workflow runs weekly; configure those two repository secrets before enabling it.

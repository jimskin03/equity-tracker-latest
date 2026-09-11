# FinanceDatabase instrument master

The `reference` schema is a global, read-only catalogue populated from
[JerBouma/FinanceDatabase](https://github.com/JerBouma/FinanceDatabase). It is
reference data, not a quote feed: Yahoo Finance remains the current-price
provider and OpenFIGI remains the identifier fallback.

Apply `supabase/migrations/20260911130000_add_reference_instrument_master.sql`
after the existing portfolio migration. It creates `reference.instruments`,
`reference.exchanges`, and `reference.currencies`, backfills existing
`portfolio.securities`, and removes the account+ISIN uniqueness assumption.
Apply `supabase/migrations/20260911140000_add_security_reference_metadata.sql`
next: it adds the FinanceDatabase field set to `portfolio.securities`
(`asset_type`, `sector`, `industry_group`, `industry`, `country`,
`exchange_name`, `cusip`, `figi`, `composite_figi`, `shareclass_figi`,
`instrument_source`, `metadata_updated_at`) and backfills rows that are already
linked. Both migrations are additive and safe to re-run.

## Where the data goes

| Layer | Holds | Written by |
| --- | --- | --- |
| `reference.instruments` | Global listing catalogue, one row per `(isin, exchange, symbol)` | the seed script / weekly workflow |
| `portfolio.securities` | The listings this account actually holds, with the catalogued fields denormalised onto the row | the app on save |
| `portfolio.prices` | Price history | the app on save and refresh |

`portfolio.securities.instrument_id` is a nullable foreign key into
`reference.instruments`. It is null only for legacy rows created before the
reference schema existed. The app writes metadata sparsely: fields the lookup
did not resolve are omitted from the payload, so a price-only refresh never
blanks catalogue metadata that is already stored.

## Seeding the catalogue

The catalogue is empty until it is loaded once. Two paths exist.

**Server-side (unattended).** Set the `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` repository secrets, then run the `Sync
FinanceDatabase` workflow (it also runs weekly on Mondays). Optionally set
`FINANCEDATABASE_FILES` to a comma-separated subset of upstream CSV paths; when
it is unset the script discovers every file under `database/equities`. Running
the same thing locally is `npm run sync:financedatabase`.

**Operator-side (no service-role key on the host).**
`scripts/seed_reference_instruments.py` downloads the same CSVs, parses them
locally with the standard `csv` module (listing summaries contain quoted
commas), and pushes chunked upserts through the Supabase management API bound to
the operator's own account. It needs no database password and stores no
credential:

```bash
python3 scripts/seed_reference_instruments.py --chunk 800
python3 scripts/seed_reference_instruments.py --files ENX.csv --chunk 100   # subset smoke test
```

Upserts key on `(source, source_key)` where `source_key` is
`{isin}|{exchange}|{symbol}` for catalogue rows and
`{ISIN}|{EXCHANGE}|{SYMBOL}` for the legacy backfill, so re-running either path
updates rather than duplicates. `exchange_name` prefers the upstream
`exchange_name` column and falls back to `market` (`country` always comes from
the listing row).

Verify a load with:

```sql
select count(*) filter (where source = 'financedatabase') as catalogue,
       count(*) filter (where source = 'legacy') as legacy
from reference.instruments;
```

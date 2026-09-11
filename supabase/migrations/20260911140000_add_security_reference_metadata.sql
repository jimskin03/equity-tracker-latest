-- FinanceDatabase metadata carried onto portfolio.securities.
--
-- The instrument master (reference.instruments) already holds the full
-- FinanceDatabase field set. Holdings only need the subset that describes the
-- listing they were purchased under, so those fields are denormalised onto
-- portfolio.securities where the portfolio UI and reports can read them without
-- joining reference data on every load.
--
-- Additive only: no column is dropped, no row is rewritten, and existing
-- securities keep their legacy isin / ticker / security_name / exchange_code /
-- currency values. Every statement is guarded so a second apply is a no-op.

alter table portfolio.securities
  add column if not exists asset_type text,
  add column if not exists sector text,
  add column if not exists industry_group text,
  add column if not exists industry text,
  add column if not exists country text,
  add column if not exists exchange_name text,
  add column if not exists cusip text,
  add column if not exists figi text,
  add column if not exists composite_figi text,
  add column if not exists shareclass_figi text,
  add column if not exists instrument_source text,
  add column if not exists metadata_updated_at timestamptz;

-- Backfill from the instrument master for rows already linked by instrument_id.
update portfolio.securities s
set asset_type = coalesce(s.asset_type, i.asset_type),
    sector = coalesce(s.sector, i.sector),
    industry_group = coalesce(s.industry_group, i.industry_group),
    industry = coalesce(s.industry, i.industry),
    country = coalesce(s.country, i.country),
    exchange_name = coalesce(s.exchange_name, i.exchange_name),
    cusip = coalesce(s.cusip, i.cusip),
    figi = coalesce(s.figi, i.figi),
    composite_figi = coalesce(s.composite_figi, i.composite_figi),
    shareclass_figi = coalesce(s.shareclass_figi, i.shareclass_figi),
    instrument_source = coalesce(s.instrument_source, i.source),
    metadata_updated_at = now()
from reference.instruments i
where s.instrument_id = i.id
  and (s.metadata_updated_at is null or s.metadata_updated_at < i.updated_at);

-- Enrich legacy rows that were keyed by ISIN before the instrument master
-- existed. Only unmatched listings are touched.
update portfolio.securities s
set sector = coalesce(s.sector, i.sector),
    industry_group = coalesce(s.industry_group, i.industry_group),
    industry = coalesce(s.industry, i.industry),
    country = coalesce(s.country, i.country),
    exchange_name = coalesce(s.exchange_name, i.exchange_name),
    cusip = coalesce(s.cusip, i.cusip),
    figi = coalesce(s.figi, i.figi),
    composite_figi = coalesce(s.composite_figi, i.composite_figi),
    shareclass_figi = coalesce(s.shareclass_figi, i.shareclass_figi),
    asset_type = coalesce(s.asset_type, i.asset_type),
    metadata_updated_at = now()
from reference.instruments i
where s.instrument_id is null
  and i.isin is not null
  and upper(i.isin) = upper(s.isin);

-- Lookups by ISIN (the entry point the holdings form uses) stay index-backed,
-- and the instrument master key is indexed for the metadata refresh path.
create index if not exists portfolio_securities_isin_idx on portfolio.securities (upper(isin));
create index if not exists portfolio_securities_instrument_idx on portfolio.securities (instrument_id);

comment on column portfolio.securities.instrument_id is 'FinanceDatabase instrument master (reference.instruments). Null for legacy rows created before the reference schema existed.';
comment on column portfolio.securities.instrument_source is 'Origin of the denormalised metadata: legacy, financedatabase, or manual.';
comment on column portfolio.securities.metadata_updated_at is 'When the denormalised reference metadata on this row was last refreshed from the instrument master.';

-- Existing grants on portfolio.securities already cover the new columns; no
-- policy change is required because the table policies are column-agnostic.

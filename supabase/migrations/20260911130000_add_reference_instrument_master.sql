-- Global FinanceDatabase-backed instrument master. Additive and safe to run after
-- the portfolio migration; existing portfolio rows remain readable throughout.
create schema if not exists reference;
grant usage on schema reference to authenticated;

create table if not exists reference.exchanges (
  code text primary key,
  name text not null,
  country text,
  source text not null default 'financedatabase',
  updated_at timestamptz not null default now()
);
create table if not exists reference.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text,
  source text not null default 'financedatabase',
  updated_at timestamptz not null default now()
);
create table if not exists reference.instruments (
  id uuid primary key default gen_random_uuid(),
  asset_type text not null default 'equity',
  symbol text not null,
  name text not null,
  currency_code text,
  exchange_code text,
  exchange_name text,
  country text,
  sector text,
  industry_group text,
  industry text,
  isin text,
  cusip text,
  figi text,
  composite_figi text,
  shareclass_figi text,
  source text not null default 'financedatabase',
  source_key text not null,
  source_sha text,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_key)
);
create index if not exists instruments_symbol_idx on reference.instruments (lower(symbol));
create index if not exists instruments_name_idx on reference.instruments using gin (to_tsvector('simple', name));
create index if not exists instruments_isin_idx on reference.instruments (upper(isin));

alter table portfolio.securities add column if not exists instrument_id uuid;
alter table portfolio.securities drop constraint if exists securities_account_id_isin_key;
alter table portfolio.securities drop constraint if exists portfolio_securities_account_id_isin_key;
alter table portfolio.securities add constraint securities_instrument_fk
  foreign key (instrument_id) references reference.instruments(id) on delete restrict;

-- Backfill one global instrument per existing listing, preserving all legacy fields.
insert into reference.instruments (symbol, name, currency_code, exchange_code, isin, source, source_key)
select distinct on (upper(s.isin), coalesce(upper(s.exchange_code), ''), upper(s.ticker))
  upper(s.ticker), s.security_name, upper(s.currency), upper(s.exchange_code), upper(s.isin),
  'legacy', concat(upper(s.isin), '|', coalesce(upper(s.exchange_code), ''), '|', upper(s.ticker))
from portfolio.securities s
where s.isin is not null
on conflict (source, source_key) do update set name = excluded.name;

update portfolio.securities s
set instrument_id = i.id
from reference.instruments i
where s.instrument_id is null
  and i.source = 'legacy'
  and i.source_key = concat(upper(s.isin), '|', coalesce(upper(s.exchange_code), ''), '|', upper(s.ticker));

alter table reference.exchanges enable row level security;
alter table reference.currencies enable row level security;
alter table reference.instruments enable row level security;
drop policy if exists "Authenticated users can read exchanges" on reference.exchanges;
create policy "Authenticated users can read exchanges" on reference.exchanges for select to authenticated using (true);
drop policy if exists "Authenticated users can read currencies" on reference.currencies;
create policy "Authenticated users can read currencies" on reference.currencies for select to authenticated using (true);
drop policy if exists "Authenticated users can read instruments" on reference.instruments;
create policy "Authenticated users can read instruments" on reference.instruments for select to authenticated using (true);
grant select on reference.exchanges, reference.currencies, reference.instruments to authenticated;
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, expense, portfolio, reference';
notify pgrst, 'reload config';

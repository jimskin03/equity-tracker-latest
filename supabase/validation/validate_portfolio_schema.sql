-- Run after 20260911120000_add_portfolio_schema.sql. Every row should PASS.
with checks as (
  select 'portfolio tables exist' as check_name,
    to_regclass('portfolio.accounts') is not null
    and to_regclass('portfolio.securities') is not null
    and to_regclass('portfolio.holdings') is not null
    and to_regclass('portfolio.prices') is not null
    and to_regclass('portfolio.trades') is not null as passed
  union all
  select 'RLS enabled on every portfolio table',
    not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'portfolio'
        and c.relname in ('accounts', 'securities', 'holdings', 'prices', 'trades')
        and not c.relrowsecurity
    )
  union all
  select 'one portfolio account per auth user',
    not exists (select user_id from portfolio.accounts group by user_id having count(*) > 1)
  union all
  select 'holdings stay inside their account',
    not exists (
      select 1 from portfolio.holdings h
      join portfolio.securities s on s.id = h.security_id
      where h.account_id <> s.account_id
    )
  union all
  select 'prices stay inside their account',
    not exists (
      select 1 from portfolio.prices p
      join portfolio.securities s on s.id = p.security_id
      where p.account_id <> s.account_id
    )
  union all
  select 'securities carry the OpenFIGI identifier columns',
    (select count(*) from information_schema.columns
     where table_schema = 'portfolio' and table_name = 'securities'
       and column_name in ('figi', 'composite_figi', 'shareclass_figi', 'asset_type',
         'sector', 'industry_group', 'industry', 'country', 'exchange_name', 'cusip')) = 10
  union all
  select 'the retired reference catalogue is gone',
    to_regclass('reference.instruments') is null
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result from checks order by check_name;

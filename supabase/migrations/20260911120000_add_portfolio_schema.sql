-- Additive portfolio domain for the shared CryptGreg Supabase project.
-- This migration does not alter the canonical expense ledger or its archive.

create schema if not exists portfolio;
grant usage on schema portfolio to authenticated;

create table if not exists portfolio.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Main portfolio',
  base_currency text not null default 'USD' check (base_currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists portfolio.securities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portfolio.accounts(id) on delete cascade,
  isin text not null check (isin = upper(isin) and isin ~ '^[A-Z]{2}[A-Z0-9]{9}[0-9]$'),
  security_name text not null,
  ticker text not null,
  exchange_code text,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, isin),
  unique (account_id, id)
);

create table if not exists portfolio.holdings (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portfolio.accounts(id) on delete cascade,
  security_id uuid not null,
  quantity numeric(24, 8) not null check (quantity > 0),
  average_cost numeric(20, 6) not null check (average_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, security_id),
  constraint holdings_security_account_fk foreign key (account_id, security_id)
    references portfolio.securities(account_id, id) on delete cascade
);

create table if not exists portfolio.prices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portfolio.accounts(id) on delete cascade,
  security_id uuid not null,
  price numeric(20, 6) not null check (price > 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  as_of timestamptz not null default now(),
  source text not null default 'yahoo',
  created_at timestamptz not null default now(),
  constraint prices_security_account_fk foreign key (account_id, security_id)
    references portfolio.securities(account_id, id) on delete cascade,
  unique (account_id, security_id, source, as_of)
);

-- Trades are additive groundwork for a transaction-derived portfolio. The
-- current equity UI continues to manage direct holdings during this rollout.
create table if not exists portfolio.trades (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references portfolio.accounts(id) on delete cascade,
  security_id uuid not null,
  side text not null check (side in ('buy', 'sell')),
  quantity numeric(24, 8) not null check (quantity > 0),
  price numeric(20, 6) not null check (price >= 0),
  fees numeric(20, 6) not null default 0 check (fees >= 0),
  trade_date date not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trades_security_account_fk foreign key (account_id, security_id)
    references portfolio.securities(account_id, id) on delete restrict
);

create index if not exists portfolio_accounts_user_id_idx on portfolio.accounts(user_id);
create index if not exists portfolio_securities_account_idx on portfolio.securities(account_id, updated_at desc);
create index if not exists portfolio_holdings_account_idx on portfolio.holdings(account_id, updated_at desc);
create index if not exists portfolio_prices_account_security_as_of_idx on portfolio.prices(account_id, security_id, as_of desc);
create index if not exists portfolio_trades_account_trade_date_idx on portfolio.trades(account_id, trade_date desc);

create or replace function portfolio.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists portfolio_accounts_set_updated_at on portfolio.accounts;
create trigger portfolio_accounts_set_updated_at before update on portfolio.accounts
for each row execute function portfolio.set_updated_at();
drop trigger if exists portfolio_securities_set_updated_at on portfolio.securities;
create trigger portfolio_securities_set_updated_at before update on portfolio.securities
for each row execute function portfolio.set_updated_at();
drop trigger if exists portfolio_holdings_set_updated_at on portfolio.holdings;
create trigger portfolio_holdings_set_updated_at before update on portfolio.holdings
for each row execute function portfolio.set_updated_at();
drop trigger if exists portfolio_trades_set_updated_at on portfolio.trades;
create trigger portfolio_trades_set_updated_at before update on portfolio.trades
for each row execute function portfolio.set_updated_at();

alter table portfolio.accounts enable row level security;
alter table portfolio.securities enable row level security;
alter table portfolio.holdings enable row level security;
alter table portfolio.prices enable row level security;
alter table portfolio.trades enable row level security;

drop policy if exists "Users can read their portfolio account" on portfolio.accounts;
create policy "Users can read their portfolio account" on portfolio.accounts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Users can create their portfolio account" on portfolio.accounts;
create policy "Users can create their portfolio account" on portfolio.accounts for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "Users can update their portfolio account" on portfolio.accounts;
create policy "Users can update their portfolio account" on portfolio.accounts for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "Users can delete their portfolio account" on portfolio.accounts;
create policy "Users can delete their portfolio account" on portfolio.accounts for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists "Users can read their portfolio securities" on portfolio.securities;
create policy "Users can read their portfolio securities" on portfolio.securities for select to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can create their portfolio securities" on portfolio.securities;
create policy "Users can create their portfolio securities" on portfolio.securities for insert to authenticated with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can update their portfolio securities" on portfolio.securities;
create policy "Users can update their portfolio securities" on portfolio.securities for update to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid()))) with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can delete their portfolio securities" on portfolio.securities;
create policy "Users can delete their portfolio securities" on portfolio.securities for delete to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can read their portfolio holdings" on portfolio.holdings;
create policy "Users can read their portfolio holdings" on portfolio.holdings for select to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can create their portfolio holdings" on portfolio.holdings;
create policy "Users can create their portfolio holdings" on portfolio.holdings for insert to authenticated with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can update their portfolio holdings" on portfolio.holdings;
create policy "Users can update their portfolio holdings" on portfolio.holdings for update to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid()))) with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can delete their portfolio holdings" on portfolio.holdings;
create policy "Users can delete their portfolio holdings" on portfolio.holdings for delete to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can read their portfolio prices" on portfolio.prices;
create policy "Users can read their portfolio prices" on portfolio.prices for select to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can create their portfolio prices" on portfolio.prices;
create policy "Users can create their portfolio prices" on portfolio.prices for insert to authenticated with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can update their portfolio prices" on portfolio.prices;
create policy "Users can update their portfolio prices" on portfolio.prices for update to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid()))) with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can delete their portfolio prices" on portfolio.prices;
create policy "Users can delete their portfolio prices" on portfolio.prices for delete to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can read their portfolio trades" on portfolio.trades;
create policy "Users can read their portfolio trades" on portfolio.trades for select to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can create their portfolio trades" on portfolio.trades;
create policy "Users can create their portfolio trades" on portfolio.trades for insert to authenticated with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can update their portfolio trades" on portfolio.trades;
create policy "Users can update their portfolio trades" on portfolio.trades for update to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid()))) with check (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can delete their portfolio trades" on portfolio.trades;
create policy "Users can delete their portfolio trades" on portfolio.trades for delete to authenticated using (exists (select 1 from portfolio.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

grant select, insert, update, delete on portfolio.accounts, portfolio.securities, portfolio.holdings, portfolio.prices, portfolio.trades to authenticated;
revoke all on portfolio.accounts, portfolio.securities, portfolio.holdings, portfolio.prices, portfolio.trades from anon;

comment on schema portfolio is 'Account-scoped investment data owned by the shared CryptGreg Supabase Auth user.';
comment on table portfolio.holdings is 'Current direct holdings; retained alongside trades during the staged migration to a transaction-derived portfolio.';

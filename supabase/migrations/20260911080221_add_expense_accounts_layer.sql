-- Add an account boundary beneath Supabase Auth.
-- Existing public normalized tables remain untouched as rollback sources.

create schema if not exists expense;

grant usage on schema expense to authenticated;
revoke all on schema expense from anon;

create table if not exists expense.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  currency text not null default 'MYR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists expense.incomes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references expense.accounts(id) on delete cascade,
  type text not null default 'income' check (type = 'income'),
  record_date date not null,
  source text not null check (length(trim(source)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, legacy_key)
);

create table if not exists expense.expenses (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references expense.accounts(id) on delete cascade,
  type text not null default 'expense' check (type = 'expense'),
  record_date date not null,
  category text not null check (length(trim(category)) > 0),
  description text not null default '',
  amount numeric(12, 2) not null check (amount > 0),
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, legacy_key)
);

create table if not exists expense.recurring (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references expense.accounts(id) on delete cascade,
  type text not null check (type in ('Loan', 'Utilities', 'Others')),
  name text not null check (length(trim(name)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, legacy_key)
);

create index if not exists accounts_user_id_idx
  on expense.accounts(user_id);
create index if not exists incomes_account_date_idx
  on expense.incomes(account_id, record_date desc);
create index if not exists expenses_account_date_idx
  on expense.expenses(account_id, record_date desc);
create index if not exists recurring_account_created_idx
  on expense.recurring(account_id, created_at desc);

create or replace function expense.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = expense, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists accounts_set_updated_at on expense.accounts;
create trigger accounts_set_updated_at
before update on expense.accounts
for each row execute function expense.set_updated_at();
drop trigger if exists incomes_set_updated_at on expense.incomes;
create trigger incomes_set_updated_at
before update on expense.incomes
for each row execute function expense.set_updated_at();
drop trigger if exists expenses_set_updated_at on expense.expenses;
create trigger expenses_set_updated_at
before update on expense.expenses
for each row execute function expense.set_updated_at();
drop trigger if exists recurring_set_updated_at on expense.recurring;
create trigger recurring_set_updated_at
before update on expense.recurring
for each row execute function expense.set_updated_at();

-- Create one account for every existing Supabase user.
insert into expense.accounts(user_id)
select id from auth.users
on conflict (user_id) do nothing;

-- Copy verified normalized rows beneath their owning account.
insert into expense.incomes
  (id, account_id, type, record_date, source, amount, legacy_key, created_at, updated_at)
select
  source_row.id,
  account.id,
  source_row.type,
  source_row.record_date,
  source_row.source,
  source_row.amount,
  source_row.legacy_key,
  source_row.created_at,
  source_row.updated_at
from public.expense_income_records source_row
join expense.accounts account on account.user_id = source_row.user_id
on conflict (id) do nothing;

insert into expense.expenses
  (id, account_id, type, record_date, category, description, amount, legacy_key, created_at, updated_at)
select
  source_row.id,
  account.id,
  source_row.type,
  source_row.record_date,
  source_row.category,
  source_row.description,
  source_row.amount,
  source_row.legacy_key,
  source_row.created_at,
  source_row.updated_at
from public.expense_expense_records source_row
join expense.accounts account on account.user_id = source_row.user_id
on conflict (id) do nothing;

insert into expense.recurring
  (id, account_id, type, name, amount, legacy_key, created_at, updated_at)
select
  source_row.id,
  account.id,
  source_row.type,
  source_row.name,
  source_row.amount,
  source_row.legacy_key,
  source_row.created_at,
  source_row.updated_at
from public.expense_recurring_records source_row
join expense.accounts account on account.user_id = source_row.user_id
on conflict (id) do nothing;

alter table expense.accounts enable row level security;
alter table expense.incomes enable row level security;
alter table expense.expenses enable row level security;
alter table expense.recurring enable row level security;

drop policy if exists "Users can read their own expense account" on expense.accounts;
create policy "Users can read their own expense account"
  on expense.accounts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own expense account" on expense.accounts;
create policy "Users can create their own expense account"
  on expense.accounts for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own expense account" on expense.accounts;
create policy "Users can update their own expense account"
  on expense.accounts for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own expense account" on expense.accounts;
create policy "Users can delete their own expense account"
  on expense.accounts for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can read their account incomes" on expense.incomes;
create policy "Users can read their account incomes"
  on expense.incomes for select to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can create their account incomes" on expense.incomes;
create policy "Users can create their account incomes"
  on expense.incomes for insert to authenticated
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can update their account incomes" on expense.incomes;
create policy "Users can update their account incomes"
  on expense.incomes for update to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can delete their account incomes" on expense.incomes;
create policy "Users can delete their account incomes"
  on expense.incomes for delete to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can read their account expenses" on expense.expenses;
create policy "Users can read their account expenses"
  on expense.expenses for select to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can create their account expenses" on expense.expenses;
create policy "Users can create their account expenses"
  on expense.expenses for insert to authenticated
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can update their account expenses" on expense.expenses;
create policy "Users can update their account expenses"
  on expense.expenses for update to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can delete their account expenses" on expense.expenses;
create policy "Users can delete their account expenses"
  on expense.expenses for delete to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can read their account recurring records" on expense.recurring;
create policy "Users can read their account recurring records"
  on expense.recurring for select to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can create their account recurring records" on expense.recurring;
create policy "Users can create their account recurring records"
  on expense.recurring for insert to authenticated
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can update their account recurring records" on expense.recurring;
create policy "Users can update their account recurring records"
  on expense.recurring for update to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));
drop policy if exists "Users can delete their account recurring records" on expense.recurring;
create policy "Users can delete their account recurring records"
  on expense.recurring for delete to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

grant select, insert, update, delete on expense.accounts to authenticated;
grant select, insert, update, delete on expense.incomes to authenticated;
grant select, insert, update, delete on expense.expenses to authenticated;
grant select, insert, update, delete on expense.recurring to authenticated;
revoke all on expense.accounts from anon;
revoke all on expense.incomes from anon;
revoke all on expense.expenses from anon;
revoke all on expense.recurring from anon;

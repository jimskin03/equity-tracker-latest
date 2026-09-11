-- Normalize the expense tracker into one row per account record.
-- The legacy expense_tracker_data table is intentionally retained for rollback.

create or replace function public.set_expense_tracker_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.expense_income_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'income' check (type = 'income'),
  record_date date not null,
  source text not null check (length(trim(source)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_key)
);

create table if not exists public.expense_expense_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'expense' check (type = 'expense'),
  record_date date not null,
  category text not null check (length(trim(category)) > 0),
  description text not null default '',
  amount numeric(12, 2) not null check (amount > 0),
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_key)
);

create table if not exists public.expense_recurring_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('Loan', 'Utilities', 'Others')),
  name text not null check (length(trim(name)) > 0),
  amount numeric(12, 2) not null check (amount > 0),
  legacy_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, legacy_key)
);

create index if not exists expense_income_records_user_date_idx
  on public.expense_income_records (user_id, record_date desc);
create index if not exists expense_expense_records_user_date_idx
  on public.expense_expense_records (user_id, record_date desc);
create index if not exists expense_recurring_records_user_created_idx
  on public.expense_recurring_records (user_id, created_at desc);

-- Backfill the existing JSON arrays. The ordinal is part of the key so duplicate
-- records are preserved instead of being collapsed during migration.
insert into public.expense_income_records
  (user_id, type, record_date, source, amount, legacy_key)
select
  d.user_id,
  'income',
  (item->>'date')::date,
  trim(item->>'source'),
  (item->>'amount')::numeric,
  'income:' || entry.ordinality::text
from public.expense_tracker_data as d
cross join lateral jsonb_array_elements(d.incomes) with ordinality as entry(item, ordinality)
on conflict (user_id, legacy_key) do nothing;

insert into public.expense_expense_records
  (user_id, type, record_date, category, description, amount, legacy_key)
select
  d.user_id,
  'expense',
  (item->>'date')::date,
  trim(item->>'category'),
  coalesce(item->>'desc', ''),
  (item->>'amount')::numeric,
  'expense:' || entry.ordinality::text
from public.expense_tracker_data as d
cross join lateral jsonb_array_elements(d.expenses) with ordinality as entry(item, ordinality)
on conflict (user_id, legacy_key) do nothing;

insert into public.expense_recurring_records
  (user_id, type, name, amount, legacy_key)
select
  d.user_id,
  item->>'type',
  trim(item->>'name'),
  (item->>'amount')::numeric,
  'recurring:' || entry.ordinality::text
from public.expense_tracker_data as d
cross join lateral jsonb_array_elements(d.recurring) with ordinality as entry(item, ordinality)
on conflict (user_id, legacy_key) do nothing;

-- New and backfilled rows use database-managed modification timestamps.
drop trigger if exists expense_income_records_set_updated_at on public.expense_income_records;
create trigger expense_income_records_set_updated_at
before update on public.expense_income_records
for each row execute function public.set_expense_tracker_updated_at();

drop trigger if exists expense_expense_records_set_updated_at on public.expense_expense_records;
create trigger expense_expense_records_set_updated_at
before update on public.expense_expense_records
for each row execute function public.set_expense_tracker_updated_at();

drop trigger if exists expense_recurring_records_set_updated_at on public.expense_recurring_records;
create trigger expense_recurring_records_set_updated_at
before update on public.expense_recurring_records
for each row execute function public.set_expense_tracker_updated_at();

alter table public.expense_income_records enable row level security;
alter table public.expense_expense_records enable row level security;
alter table public.expense_recurring_records enable row level security;

 drop policy if exists "Users can read their own income records" on public.expense_income_records;
create policy "Users can read their own income records"
  on public.expense_income_records for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own income records" on public.expense_income_records;
create policy "Users can create their own income records"
  on public.expense_income_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own income records" on public.expense_income_records;
create policy "Users can update their own income records"
  on public.expense_income_records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own income records" on public.expense_income_records;
create policy "Users can delete their own income records"
  on public.expense_income_records for delete to authenticated
  using ((select auth.uid()) = user_id);

 drop policy if exists "Users can read their own expense records" on public.expense_expense_records;
create policy "Users can read their own expense records"
  on public.expense_expense_records for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own expense records" on public.expense_expense_records;
create policy "Users can create their own expense records"
  on public.expense_expense_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own expense records" on public.expense_expense_records;
create policy "Users can update their own expense records"
  on public.expense_expense_records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own expense records" on public.expense_expense_records;
create policy "Users can delete their own expense records"
  on public.expense_expense_records for delete to authenticated
  using ((select auth.uid()) = user_id);

 drop policy if exists "Users can read their own recurring records" on public.expense_recurring_records;
create policy "Users can read their own recurring records"
  on public.expense_recurring_records for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users can create their own recurring records" on public.expense_recurring_records;
create policy "Users can create their own recurring records"
  on public.expense_recurring_records for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update their own recurring records" on public.expense_recurring_records;
create policy "Users can update their own recurring records"
  on public.expense_recurring_records for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete their own recurring records" on public.expense_recurring_records;
create policy "Users can delete their own recurring records"
  on public.expense_recurring_records for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.expense_income_records from anon;
revoke all on table public.expense_expense_records from anon;
revoke all on table public.expense_recurring_records from anon;
grant select, insert, update, delete on table public.expense_income_records to authenticated;
grant select, insert, update, delete on table public.expense_expense_records to authenticated;
grant select, insert, update, delete on table public.expense_recurring_records to authenticated;

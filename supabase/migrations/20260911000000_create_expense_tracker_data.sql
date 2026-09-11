create table if not exists public.expense_tracker_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  incomes jsonb not null default '[]'::jsonb check (jsonb_typeof(incomes) = 'array'),
  expenses jsonb not null default '[]'::jsonb check (jsonb_typeof(expenses) = 'array'),
  recurring jsonb not null default '[]'::jsonb check (jsonb_typeof(recurring) = 'array'),
  updated_at timestamptz not null default now()
);

alter table public.expense_tracker_data enable row level security;

drop policy if exists "Users can read their own expense tracker data" on public.expense_tracker_data;
create policy "Users can read their own expense tracker data"
  on public.expense_tracker_data for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own expense tracker data" on public.expense_tracker_data;
create policy "Users can create their own expense tracker data"
  on public.expense_tracker_data for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own expense tracker data" on public.expense_tracker_data;
create policy "Users can update their own expense tracker data"
  on public.expense_tracker_data for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own expense tracker data" on public.expense_tracker_data;
create policy "Users can delete their own expense tracker data"
  on public.expense_tracker_data for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.expense_tracker_data from anon;
grant select, insert, update, delete on table public.expense_tracker_data to authenticated;

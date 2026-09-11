-- Archive the superseded public expense tables without dropping data.
-- The public schema remains enabled; archive is intentionally not exposed through PostgREST.

create schema if not exists archive;
revoke all on schema archive from public;
revoke all on schema archive from anon, authenticated;

do $$
begin
  if to_regclass('public.expense_tracker_data') is not null then
    alter table public.expense_tracker_data set schema archive;
  end if;
  if to_regclass('public.expense_income_records') is not null then
    alter table public.expense_income_records set schema archive;
  end if;
  if to_regclass('public.expense_expense_records') is not null then
    alter table public.expense_expense_records set schema archive;
  end if;
  if to_regclass('public.expense_recurring_records') is not null then
    alter table public.expense_recurring_records set schema archive;
  end if;
end
$$;

revoke all on table archive.expense_tracker_data from public, anon, authenticated;
revoke all on table archive.expense_income_records from public, anon, authenticated;
revoke all on table archive.expense_expense_records from public, anon, authenticated;
revoke all on table archive.expense_recurring_records from public, anon, authenticated;

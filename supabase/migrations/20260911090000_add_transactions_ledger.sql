-- Canonical money ledger for the expense tracker.
--
-- Boundary (account-scoped, unchanged from 20260911080221):
--   expense.accounts      financial containers (one per auth user today)
--   expense.transactions  canonical money ledger
--   expense.categories    account-scoped classification
--   expense.recurring     rules that generate transactions (never ledger rows)
--   expense.receipts      evidence + extraction state (never the ledger)
--
-- Ownership deliberately does NOT use a user_id column on record tables.
-- It flows expense.transactions.account_id -> expense.accounts.user_id and is
-- enforced by RLS plus composite foreign keys that pin every related row to the
-- same account. A caller-supplied owner id is never trusted or stored.
--
-- Sign convention: amount is ALWAYS positive; direction carries the sign and
-- signed_amount is a stored generated column, so balances are SUM(signed_amount)
-- over status = 'posted' with no per-query CASE logic.
--
-- Requires PostgreSQL 15+ (column-specific ON DELETE SET NULL).
-- Idempotent: safe to re-run after a partial failure.

-- ---------------------------------------------------------------------------
-- 1. Reference generator (database-side, concurrency-safe)
-- ---------------------------------------------------------------------------
-- Global monotonic counter. Concurrent inserts cannot collide and COUNT()+1 is
-- never used. A daily-resetting counter would either need a counter table or a
-- dynamic sequence name, and record_date can be backdated, so the reference
-- intentionally does not embed a date it could contradict.

create sequence if not exists expense.transaction_reference_seq start 1;

create or replace function expense.next_transaction_reference()
returns text
language sql
volatile
set search_path = expense, public
as $$
  select 'TXN-' || lpad(nextval('expense.transaction_reference_seq')::text, 9, '0');
$$;

-- ---------------------------------------------------------------------------
-- 2. Categories (account-scoped, case-normalized)
-- ---------------------------------------------------------------------------
create table if not exists expense.categories (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references expense.accounts(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  parent_id uuid null references expense.categories(id) on delete set null,
  is_active boolean not null default true,
  legacy_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Case-normalized uniqueness: 'Food' and 'food' are the same category.
create unique index if not exists ux_categories_account_name_lower
  on expense.categories (account_id, lower(name));
create index if not exists categories_account_active_idx
  on expense.categories (account_id, is_active);
-- Target for composite foreign keys that pin relationships to one account.
create unique index if not exists ux_categories_id_account
  on expense.categories (id, account_id);

-- ---------------------------------------------------------------------------
-- 3. Receipts (evidence + extraction state, never the ledger)
-- ---------------------------------------------------------------------------
create table if not exists expense.receipts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references expense.accounts(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'extracted', 'confirmed', 'rejected')),
  file_name text,
  storage_path text,
  mime_type text,
  file_size_bytes bigint check (file_size_bytes is null or file_size_bytes >= 0),
  extraction_model text,
  confidence numeric(4, 3)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  extracted_total numeric(14, 2)
    check (extracted_total is null or extracted_total > 0),
  extracted_date date,
  raw_extraction jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receipts_account_created_idx
  on expense.receipts (account_id, created_at desc);
create unique index if not exists ux_receipts_id_account
  on expense.receipts (id, account_id);

-- ---------------------------------------------------------------------------
-- 4. Recurring becomes a pure rule table (generator, not ledger)
-- ---------------------------------------------------------------------------
alter table expense.recurring add column if not exists category_id uuid null;
alter table expense.recurring add column if not exists frequency text not null default 'monthly';
alter table expense.recurring add column if not exists next_run_date date null;
alter table expense.recurring add column if not exists is_active boolean not null default true;
alter table expense.recurring add column if not exists description text not null default '';
alter table expense.recurring add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table expense.recurring drop constraint if exists recurring_frequency_check;
alter table expense.recurring add constraint recurring_frequency_check
  check (frequency in ('daily', 'weekly', 'monthly', 'quarterly', 'yearly'));

create unique index if not exists ux_recurring_id_account
  on expense.recurring (id, account_id);

-- A rule may only classify against a category owned by the same account.
alter table expense.recurring drop constraint if exists recurring_category_same_account;
alter table expense.recurring add constraint recurring_category_same_account
  foreign key (category_id, account_id)
  references expense.categories (id, account_id)
  on delete no action;

-- ---------------------------------------------------------------------------
-- 5. Transactions (the canonical ledger)
-- ---------------------------------------------------------------------------
create table if not exists expense.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references expense.accounts(id) on delete cascade,

  reference_no text not null default expense.next_transaction_reference(),

  type text not null
    check (type in ('expense', 'income', 'transfer', 'refund', 'adjustment')),
  direction text not null
    check (direction in ('in', 'out')),

  amount numeric(14, 2) not null check (amount > 0),
  signed_amount numeric(14, 2)
    generated always as (case when direction = 'in' then amount else -amount end) stored,

  record_date date not null,

  category_id uuid null,
  description text not null default '',

  source_type text not null default 'manual'
    check (source_type in ('manual', 'receipt', 'recurring', 'import', 'api', 'ai', 'migration')),
  source_ref text,

  receipt_id uuid null,
  recurring_id uuid null,
  transfer_group_id uuid null,
  reversal_of uuid null,

  legacy_key text,
  legacy_category text,

  metadata jsonb not null default '{}'::jsonb,

  status text not null default 'posted'
    check (status in ('pending', 'posted', 'voided', 'reversed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint transactions_reference_no_key unique (reference_no),

  -- Direction is implied by type, so mixed sign semantics cannot creep in.
  constraint transactions_type_direction_check check (
    (type = 'expense' and direction = 'out')
    or (type in ('income', 'refund') and direction = 'in')
    or (type in ('transfer', 'adjustment'))
  ),

  -- Transfers are always two rows sharing a group id; nothing else has one.
  constraint transactions_transfer_group_check check (
    (type = 'transfer' and transfer_group_id is not null)
    or (type <> 'transfer' and transfer_group_id is null)
  ),

  -- Every migrated row must remain re-discoverable by its migration key.
  constraint transactions_migration_key_check check (
    source_type <> 'migration' or legacy_key is not null
  ),

  constraint transactions_reversal_check check (
    reversal_of is null or reversal_of <> id
  )
);

create unique index if not exists ux_transactions_id_account
  on expense.transactions (id, account_id);

create index if not exists transactions_account_date_idx
  on expense.transactions (account_id, record_date desc);
create index if not exists transactions_account_status_date_idx
  on expense.transactions (account_id, status, record_date desc);
create index if not exists transactions_transfer_group_idx
  on expense.transactions (transfer_group_id) where transfer_group_id is not null;
create index if not exists transactions_reversal_of_idx
  on expense.transactions (reversal_of) where reversal_of is not null;
create index if not exists transactions_legacy_category_idx
  on expense.transactions (account_id, legacy_category) where legacy_category is not null;

-- Idempotent migration key. NOTE: legacy_key on the existing records tables is a
-- per-user ordinal ('income:1'), so it is NOT globally unique - the key must be
-- account-scoped or two users would collide with each other.
create unique index if not exists ux_transactions_migration_key
  on expense.transactions (account_id, source_type, legacy_key)
  where legacy_key is not null;

-- ---------------------------------------------------------------------------
-- 5b. What "counted" means for reporting
-- ---------------------------------------------------------------------------
-- Reversal cannot be "exclude the original AND count a compensating row": that
-- pair would inflate the balance by the transaction amount. A reversed row and
-- its compensating row must BOTH be counted so they net to exactly zero, while
-- 'pending' (not yet real) and 'voided' (never happened, no compensating row)
-- stay out of reports. Reports therefore read this view instead of status =
-- 'posted'.
--
--   pending   -> excluded (not yet real)
--   posted    -> counted
--   reversed  -> counted (its compensating row is counted too: net zero)
--   voided    -> excluded (never happened, nothing compensates it)
create or replace view expense.counted_transactions
with (security_invoker = true)
as
select *
from expense.transactions
where status in ('posted', 'reversed');

comment on view expense.counted_transactions is
  'Ledger rows that affect balances. Counted = posted + reversed (a reversed row is counted together with its compensating row so the pair nets to zero). Excludes pending and voided.';

-- ---------------------------------------------------------------------------
-- 6. Cross-relationship integrity (all pinned to one account)
-- ---------------------------------------------------------------------------
-- Composite keys make "transaction belongs to my account but its category /
-- receipt / rule / reversal target belongs to someone else" structurally
-- impossible, even if a caller guesses a UUID. RLS cannot do this because
-- foreign key validation runs as the table owner.
alter table expense.transactions drop constraint if exists transactions_category_same_account;
alter table expense.transactions add constraint transactions_category_same_account
  foreign key (category_id, account_id)
  references expense.categories (id, account_id)
  on delete no action;

alter table expense.transactions drop constraint if exists transactions_receipt_same_account;
alter table expense.transactions add constraint transactions_receipt_same_account
  foreign key (receipt_id, account_id)
  references expense.receipts (id, account_id)
  on delete set null (receipt_id);

alter table expense.transactions drop constraint if exists transactions_recurring_same_account;
alter table expense.transactions add constraint transactions_recurring_same_account
  foreign key (recurring_id, account_id)
  references expense.recurring (id, account_id)
  on delete set null (recurring_id);

alter table expense.transactions drop constraint if exists transactions_reversal_same_account;
alter table expense.transactions add constraint transactions_reversal_same_account
  foreign key (reversal_of, account_id)
  references expense.transactions (id, account_id)
  on delete no action;

-- ---------------------------------------------------------------------------
-- 7. Ledger history guard
-- ---------------------------------------------------------------------------
-- Manual/pending rows stay editable. Once a row is posted and did not come from
-- a human typing it (import, receipt, recurring, api, ai, migration) its
-- financial fields are frozen: reverse it and post a correction instead of
-- silently rewriting financial history.
create or replace function expense.guard_ledger_history()
returns trigger
language plpgsql
security invoker
set search_path = expense, public
as $$
begin
  if new.id is distinct from old.id
     or new.account_id is distinct from old.account_id
     or new.reference_no is distinct from old.reference_no then
    raise exception 'transaction identity and ownership cannot be changed';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('posted', 'voided'))
      or (old.status = 'posted' and new.status in ('voided', 'reversed'))
      or (old.status = 'voided' and new.status = 'posted')
    ) then
      raise exception 'illegal transaction status transition: % -> %', old.status, new.status;
    end if;
    if new.amount is distinct from old.amount
       or new.record_date is distinct from old.record_date
       or new.type is distinct from old.type
       or new.direction is distinct from old.direction then
      raise exception 'a status change must not alter amount, direction, type or date';
    end if;
  else
    if old.source_type <> 'manual' and old.status <> 'pending' then
      raise exception 'posted % transactions are immutable; reverse the ledger row and post a correction instead', old.source_type;
    end if;
    if new.source_type is distinct from old.source_type
       or new.legacy_key is distinct from old.legacy_key then
      raise exception 'transaction provenance cannot be rewritten';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_guard_ledger_history on expense.transactions;
create trigger transactions_guard_ledger_history
before update on expense.transactions
for each row execute function expense.guard_ledger_history();

drop trigger if exists transactions_set_updated_at on expense.transactions;
create trigger transactions_set_updated_at
before update on expense.transactions
for each row execute function expense.set_updated_at();

drop trigger if exists categories_set_updated_at on expense.categories;
create trigger categories_set_updated_at
before update on expense.categories
for each row execute function expense.set_updated_at();

drop trigger if exists receipts_set_updated_at on expense.receipts;
create trigger receipts_set_updated_at
before update on expense.receipts
for each row execute function expense.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. Transfer integrity (two legs, two accounts, one currency)
-- ---------------------------------------------------------------------------
create or replace function expense.assert_transfer_group_balanced()
returns trigger
language plpgsql
security invoker
set search_path = expense, public
as $$
declare
  v_group uuid;
  v_legs integer;
  v_accounts integer;
  v_directions integer;
  v_amounts integer;
  v_currencies integer;
begin
  if tg_op = 'DELETE' then
    v_group := old.transfer_group_id;
  else
    v_group := coalesce(new.transfer_group_id, old.transfer_group_id);
  end if;
  if v_group is null then
    return null;
  end if;

  select count(*),
         count(distinct t.account_id),
         count(distinct t.direction),
         count(distinct t.amount),
         count(distinct a.currency)
    into v_legs, v_accounts, v_directions, v_amounts, v_currencies
  from expense.transactions t
  join expense.accounts a on a.id = t.account_id
  where t.transfer_group_id = v_group
    and t.status <> 'voided';

  if v_legs <> 2 then
    raise exception 'transfer group % must have exactly 2 posted legs, found %', v_group, v_legs;
  end if;
  if v_accounts <> 2 then
    raise exception 'transfer group % must move money between two different accounts', v_group;
  end if;
  if v_directions <> 2 then
    raise exception 'transfer group % must have one in leg and one out leg', v_group;
  end if;
  if v_amounts <> 1 then
    raise exception 'transfer group % legs must carry the same amount', v_group;
  end if;
  if v_currencies <> 1 then
    raise exception 'cross-currency transfers are not supported yet; transfer group % spans % currencies', v_group, v_currencies;
  end if;

  return null;
end;
$$;

drop trigger if exists transactions_transfer_group_assert on expense.transactions;
create constraint trigger transactions_transfer_group_assert
after insert or update or delete on expense.transactions
deferrable initially deferred
for each row execute function expense.assert_transfer_group_balanced();

-- Atomic two-leg transfer. SECURITY INVOKER: RLS still decides what the caller
-- may touch, and the deferred constraint trigger rejects a half-written group.
create or replace function expense.create_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_record_date date default current_date,
  p_description text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = expense, public
as $$
declare
  v_group uuid := gen_random_uuid();
begin
  if p_from_account = p_to_account then
    raise exception 'a transfer requires two different accounts';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'a transfer amount must be greater than zero';
  end if;

  insert into expense.transactions
    (account_id, type, direction, amount, record_date, description, source_type, transfer_group_id)
  values
    (p_from_account, 'transfer', 'out', p_amount, p_record_date, p_description, 'manual', v_group),
    (p_to_account, 'transfer', 'in', p_amount, p_record_date, p_description, 'manual', v_group);

  return v_group;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Reversal (posted history is never silently overwritten)
-- ---------------------------------------------------------------------------
-- Marks the original 'reversed' and posts a compensating row on the opposite
-- side, linked by reversal_of. Both rows are counted by
-- expense.counted_transactions, so the pair nets to exactly zero and the
-- original amount, date and provenance survive untouched for audit.
-- 'voided' is the other option: nothing is posted, and the row leaves reports.
create or replace function expense.reverse_transaction(
  p_transaction_id uuid,
  p_reason text default ''
)
returns uuid
language plpgsql
security invoker
set search_path = expense, public
as $$
declare
  v_original expense.transactions;
  v_reversal_id uuid;
begin
  select * into v_original from expense.transactions where id = p_transaction_id;
  if v_original.id is null then
    raise exception 'transaction % was not found or is not visible to the caller', p_transaction_id;
  end if;
  if v_original.status <> 'posted' then
    raise exception 'only posted transactions can be reversed (status %)', v_original.status;
  end if;

  update expense.transactions
     set status = 'reversed'
   where id = p_transaction_id;

  insert into expense.transactions
    (account_id, type, direction, amount, record_date, category_id, description,
     source_type, reversal_of, metadata)
  values
    (v_original.account_id,
     case when v_original.direction = 'out' then 'refund' else 'adjustment' end,
     case when v_original.direction = 'out' then 'in' else 'out' end,
     v_original.amount,
     v_original.record_date,
     v_original.category_id,
     coalesce(nullif(trim(p_reason), ''), 'Reversal of ' || v_original.reference_no),
     v_original.source_type,
     p_transaction_id,
     jsonb_build_object('reversal', true, 'reversed_reference', v_original.reference_no))
  returning id into v_reversal_id;

  return v_reversal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10. Migration baseline (audit + reconciliation anchor)
-- ---------------------------------------------------------------------------
create table if not exists expense.migration_baseline (
  source_kind text not null,
  account_id uuid not null,
  source_relation text not null,
  source_row_count bigint not null,
  source_total numeric(16, 2) not null,
  captured_at timestamptz not null default now(),
  primary key (source_kind, account_id)
);

-- Internal audit anchor: not reachable from the API, and deny-all if it ever is.
alter table expense.migration_baseline enable row level security;

-- ---------------------------------------------------------------------------
-- 11. Row Level Security + grants
-- ---------------------------------------------------------------------------
-- This MUST come before the backfill inserts. The Supabase migration API runs
-- the whole script in ONE transaction, and Postgres refuses any ALTER TABLE -
-- which is what ENABLE ROW LEVEL SECURITY and CREATE POLICY are - on a relation
-- that still has pending deferred trigger events. The backfill's inserts queue
-- those events (transactions_transfer_group_assert is DEFERRABLE INITIALLY
-- DEFERRED), so anything that ALTERs expense.transactions after the backfill
-- fails with SQLSTATE 55006. The backfill runs as the migration owner, which
-- bypasses RLS, so enabling it first is safe.
alter table expense.transactions enable row level security;
alter table expense.categories enable row level security;
alter table expense.receipts enable row level security;

drop policy if exists "Users can read their account transactions" on expense.transactions;
create policy "Users can read their account transactions"
  on expense.transactions for select to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can create their account transactions" on expense.transactions;
create policy "Users can create their account transactions"
  on expense.transactions for insert to authenticated
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can update their account transactions" on expense.transactions;
create policy "Users can update their account transactions"
  on expense.transactions for update to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

-- Only self-entered rows may be hard deleted; everything else is reversed.
drop policy if exists "Users can delete their own manual transactions" on expense.transactions;
create policy "Users can delete their own manual transactions"
  on expense.transactions for delete to authenticated
  using (
    source_type = 'manual'
    and status <> 'reversed'
    and exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid()))
  );

drop policy if exists "Users can read their account categories" on expense.categories;
create policy "Users can read their account categories"
  on expense.categories for select to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can create their account categories" on expense.categories;
create policy "Users can create their account categories"
  on expense.categories for insert to authenticated
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can update their account categories" on expense.categories;
create policy "Users can update their account categories"
  on expense.categories for update to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can read their account receipts" on expense.receipts;
create policy "Users can read their account receipts"
  on expense.receipts for select to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can create their account receipts" on expense.receipts;
create policy "Users can create their account receipts"
  on expense.receipts for insert to authenticated
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can update their account receipts" on expense.receipts;
create policy "Users can update their account receipts"
  on expense.receipts for update to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())))
  with check (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

drop policy if exists "Users can delete their account receipts" on expense.receipts;
create policy "Users can delete their account receipts"
  on expense.receipts for delete to authenticated
  using (exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = (select auth.uid())));

grant select, insert, update, delete on expense.transactions to authenticated;
grant select on expense.counted_transactions to authenticated;
grant select, insert, update, delete on expense.categories to authenticated;
grant select, insert, update, delete on expense.receipts to authenticated;
grant usage on sequence expense.transaction_reference_seq to authenticated;
grant execute on function expense.next_transaction_reference() to authenticated;
grant execute on function expense.create_transfer(uuid, uuid, numeric, date, text) to authenticated;
grant execute on function expense.reverse_transaction(uuid, text) to authenticated;

revoke all on expense.transactions from anon;
revoke all on expense.counted_transactions from anon;
revoke all on expense.categories from anon;
revoke all on expense.receipts from anon;
revoke all on expense.migration_baseline from anon, authenticated;
revoke all on sequence expense.transaction_reference_seq from anon;

-- ---------------------------------------------------------------------------
-- 12. Backfill from the live legacy tables (idempotent, runs LAST)
-- ---------------------------------------------------------------------------
-- Source preference matters and is not the obvious one:
--   expense.expenses / expense.incomes  = the LIVE superset. The accounts-layer
--     migration copied the snapshot into them, and the app kept writing there
--     afterwards, so they hold everything the archive holds plus all activity
--     since.
--   archive.expense_*_records           = the frozen pre-accounts-layer snapshot
--     (superseded tables were moved there). Using it alone would silently drop
--     every record created after the accounts layer shipped.
--   public.expense_*_records            = pre-archive fallback only.
-- Each source is normalised into a session temp view that always exposes
-- user_id, so the statements below are shape-independent (the live tables are
-- account_id-scoped, the archived ones user_id-scoped).
do $$
declare
  v_expense_rel text;
  v_income_rel text;
  v_recurring_rel text;
  v_skipped bigint;
begin
  select rel into v_expense_rel from (
    select 'expense.expenses' as rel, 1 as ord
    union all select 'archive.expense_expense_records', 2
    union all select 'public.expense_expense_records', 3
    union all select 'archive.expenses', 4
    union all select 'public.expenses', 5
  ) candidates
  where to_regclass(rel) is not null
  order by ord
  limit 1;

  select rel into v_income_rel from (
    select 'expense.incomes' as rel, 1 as ord
    union all select 'archive.expense_income_records', 2
    union all select 'public.expense_income_records', 3
    union all select 'archive.incomes', 4
    union all select 'public.incomes', 5
  ) candidates
  where to_regclass(rel) is not null
  order by ord
  limit 1;

  select rel into v_recurring_rel from (
    select 'expense.recurring' as rel, 1 as ord
    union all select 'archive.expense_recurring_records', 2
    union all select 'public.expense_recurring_records', 3
    union all select 'archive.recurring', 4
    union all select 'public.recurring', 5
  ) candidates
  where to_regclass(rel) is not null
  order by ord
  limit 1;

  if v_expense_rel is null and v_income_rel is null then
    raise notice 'no legacy expense records found; nothing to backfill';
    return;
  end if;

  -- ---- Phase 1: normalise each source to expose user_id -------------------
  if v_expense_rel = 'expense.expenses' then
    execute $v$
      create or replace temp view _legacy_expense_src as
      select src.id, src.amount, src.record_date, src.legacy_key, src.category,
             src.description, src.created_at, src.updated_at, a.user_id
      from expense.expenses src
      join expense.accounts a on a.id = src.account_id
    $v$;
  elsif v_expense_rel is not null then
    execute format($v$
      create or replace temp view _legacy_expense_src as
      select id, amount, record_date, legacy_key, category, description,
             created_at, updated_at, user_id
      from %s
    $v$, v_expense_rel);
  end if;
  if v_expense_rel is not null then
    v_expense_rel := 'pg_temp._legacy_expense_src';
  end if;

  if v_income_rel = 'expense.incomes' then
    execute $v$
      create or replace temp view _legacy_income_src as
      select src.id, src.amount, src.record_date, src.legacy_key, src.source,
             src.created_at, src.updated_at, a.user_id
      from expense.incomes src
      join expense.accounts a on a.id = src.account_id
    $v$;
  elsif v_income_rel is not null then
    execute format($v$
      create or replace temp view _legacy_income_src as
      select id, amount, record_date, legacy_key, source, created_at, updated_at, user_id
      from %s
    $v$, v_income_rel);
  end if;
  if v_income_rel is not null then
    v_income_rel := 'pg_temp._legacy_income_src';
  end if;

  -- ---- Phase 2: classify legacy free-text categories -----------------------
  if v_expense_rel is not null then
    execute format($f$
      insert into expense.categories (account_id, name, legacy_category)
      select distinct a.id, trim(src.category), trim(src.category)
      from %s src
      join expense.accounts a on a.user_id = src.user_id
      where trim(coalesce(src.category, '')) <> ''
      on conflict (account_id, lower(name)) do nothing
    $f$, v_expense_rel);
  end if;

  -- ---- Phase 3a: capture the reconciliation baseline ----------------------
  if v_income_rel is not null then
    execute format($f$
      insert into expense.migration_baseline
        (source_kind, account_id, source_relation, source_row_count, source_total, captured_at)
      select 'income', a.id, %L, count(*), coalesce(sum(src.amount), 0), now()
      from %s src
      join expense.accounts a on a.user_id = src.user_id
      group by a.id
      on conflict (source_kind, account_id) do update
        set source_relation = excluded.source_relation,
            source_row_count = excluded.source_row_count,
            source_total = excluded.source_total,
            captured_at = now()
    $f$, v_income_rel, v_income_rel);
  end if;

  if v_expense_rel is not null then
    execute format($f$
      insert into expense.migration_baseline
        (source_kind, account_id, source_relation, source_row_count, source_total, captured_at)
      select 'expense', a.id, %L, count(*), coalesce(sum(src.amount), 0), now()
      from %s src
      join expense.accounts a on a.user_id = src.user_id
      group by a.id
      on conflict (source_kind, account_id) do update
        set source_relation = excluded.source_relation,
            source_row_count = excluded.source_row_count,
            source_total = excluded.source_total,
            captured_at = now()
    $f$, v_expense_rel, v_expense_rel);
  end if;

  -- ---- Phase 3b: incomes and expenses into the ledger ---------------------
  if v_income_rel is not null then
    execute format($f$
      insert into expense.transactions
        (id, account_id, type, direction, amount, record_date, description,
         source_type, legacy_key, legacy_category, status, created_at, updated_at)
      select src.id, a.id, 'income', 'in', src.amount, src.record_date,
             coalesce(src.source, ''), 'migration', src.legacy_key, null,
             'posted', coalesce(src.created_at, now()), coalesce(src.updated_at, src.created_at, now())
      from %s src
      join expense.accounts a on a.user_id = src.user_id
      on conflict (account_id, source_type, legacy_key) where legacy_key is not null do nothing
    $f$, v_income_rel);
  end if;

  if v_expense_rel is not null then
    execute format($f$
      insert into expense.transactions
        (id, account_id, type, direction, amount, record_date, category_id, description,
         source_type, legacy_key, legacy_category, status, created_at, updated_at)
      select src.id, a.id, 'expense', 'out', src.amount, src.record_date,
             c.id, coalesce(src.description, ''), 'migration', src.legacy_key, trim(src.category),
             'posted', coalesce(src.created_at, now()), coalesce(src.updated_at, src.created_at, now())
      from %s src
      join expense.accounts a on a.user_id = src.user_id
      left join expense.categories c
        on c.account_id = a.id and lower(c.name) = lower(trim(src.category))
      on conflict (account_id, source_type, legacy_key) where legacy_key is not null do nothing
    $f$, v_expense_rel);
  end if;

  -- ---- Recurring: link rules to the migrated categories -------------------
  if v_recurring_rel is not null then
    execute format($f$
      update expense.recurring r
         set category_id = c.id,
             frequency = coalesce(nullif(r.frequency, ''), 'monthly')
      from expense.categories c
      where r.category_id is null
        and c.account_id = r.account_id
        and lower(c.name) = lower(
              case r.type
                when 'Loan' then 'Financial'
                when 'Utilities' then 'Utilities'
                else 'Others'
              end)
    $f$, v_recurring_rel);
  end if;

  -- ---- Report any source rows that could not be attached to an account ----
  if v_income_rel is not null then
    execute format($f$
      select count(*) from %s src
      left join expense.accounts a on a.user_id = src.user_id
      where a.id is null
    $f$, v_income_rel) into v_skipped;
    if v_skipped > 0 then
      raise warning 'income snapshot: % row(s) had no expense.accounts row and were not migrated', v_skipped;
    end if;
  end if;

  if v_expense_rel is not null then
    execute format($f$
      select count(*) from %s src
      left join expense.accounts a on a.user_id = src.user_id
      where a.id is null
    $f$, v_expense_rel) into v_skipped;
    if v_skipped > 0 then
      raise warning 'expense snapshot: % row(s) had no expense.accounts row and were not migrated', v_skipped;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- (RLS + grants deliberately live ABOVE the backfill - see section 11.)
-- ---------------------------------------------------------------------------

-- Reconciliation for the expense.transactions ledger migration.
--
-- Run this in the Supabase SQL editor AFTER
-- supabase/migrations/20260911090000_add_transactions_ledger.sql.
-- Read-only apart from session-local temp tables; safe to re-run.
--
-- Every check returns PASS or FAIL. Zero FAIL rows is the acceptance condition.

-- ---------------------------------------------------------------------------
-- Resolve the archived snapshot into temp tables
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('pg_temp.src_income') is not null then
    execute 'drop table pg_temp.src_income';
  end if;
  if to_regclass('pg_temp.src_expense') is not null then
    execute 'drop table pg_temp.src_expense';
  end if;
end
$$;

do $$
declare
  v_expense_rel text;
  v_income_rel text;
  v_expense_sel text;
  v_income_sel text;
begin
  select rel into v_income_rel from (
    select 'expense.incomes' as rel, 1 as ord
    union all select 'archive.expense_income_records', 2
    union all select 'public.expense_income_records', 3
    union all select 'archive.incomes', 4
    union all select 'public.incomes', 5
  ) c where to_regclass(rel) is not null order by ord limit 1;

  select rel into v_expense_rel from (
    select 'expense.expenses' as rel, 1 as ord
    union all select 'archive.expense_expense_records', 2
    union all select 'public.expense_expense_records', 3
    union all select 'archive.expenses', 4
    union all select 'public.expenses', 5
  ) c where to_regclass(rel) is not null order by ord limit 1;

  if v_income_rel is null then
    raise exception 'no income source relation found; cannot reconcile';
  end if;
  if v_expense_rel is null then
    raise exception 'no expense source relation found; cannot reconcile';
  end if;

  raise notice 'reconciling income from % and expense from %', v_income_rel, v_expense_rel;

  -- Same source preference as the migration: the live account-scoped tables
  -- first (they are the superset), then the archived user-scoped snapshots.
  -- Both shapes are normalised to user_id so the comparison stays shape-independent.
  if v_income_rel = 'expense.incomes' then
    v_income_sel := 'select a.user_id, src.amount::numeric(14,2) as amount, src.record_date, src.legacy_key '
                 || 'from expense.incomes src join expense.accounts a on a.id = src.account_id';
  else
    v_income_sel := format(
      'select src.user_id, src.amount::numeric(14,2) as amount, src.record_date, src.legacy_key from %s src',
      v_income_rel);
  end if;

  if v_expense_rel = 'expense.expenses' then
    v_expense_sel := 'select a.user_id, src.amount::numeric(14,2) as amount, src.record_date, src.legacy_key, src.category, src.description '
                  || 'from expense.expenses src join expense.accounts a on a.id = src.account_id';
  else
    v_expense_sel := format(
      'select src.user_id, src.amount::numeric(14,2) as amount, src.record_date, src.legacy_key, src.category, src.description from %s src',
      v_expense_rel);
  end if;

  execute 'create temp table src_income as ' || v_income_sel;
  execute 'create temp table src_expense as ' || v_expense_sel;
end
$$;

-- ---------------------------------------------------------------------------
-- Checks
-- ---------------------------------------------------------------------------
with
src as (
  select 'income'::text as kind, s.user_id, s.amount, s.legacy_key
  from src_income s
  union all
  select 'expense'::text, s.user_id, s.amount, s.legacy_key
  from src_expense s
),
-- Source rows that can legitimately be migrated (their owner has an account).
settled as (
  select s.kind, a.id as account_id, s.amount, s.legacy_key
  from src s
  join expense.accounts a on a.user_id = s.user_id
),
ledger as (
  select t.account_id, t.type::text as kind, t.amount, t.legacy_key
  from expense.transactions t
  where t.source_type = 'migration'
),
kinds as (
  select unnest(array['income', 'expense']) as kind
),
compare as (
  select
    k.kind,
    coalesce(s.n, 0) as src_rows,
    coalesce(l.n, 0) as ledger_rows,
    coalesce(s.total, 0) as src_total,
    coalesce(l.total, 0) as ledger_total
  from kinds k
  left join (select kind, count(*) n, sum(amount) total from settled group by kind) s on s.kind = k.kind
  left join (select kind, count(*) n, sum(amount) total from ledger group by kind) l on l.kind = k.kind
),
per_account as (
  select
    coalesce(s.kind, l.kind) as kind,
    count(*) as groups_compared,
    count(*) filter (where coalesce(s.n, 0) <> coalesce(l.n, 0)
                       or coalesce(s.total, 0) <> coalesce(l.total, 0)) as mismatches
  from (select kind, account_id, count(*) n, sum(amount) total from settled group by kind, account_id) s
  full join (select kind, account_id, count(*) n, sum(amount) total from ledger group by kind, account_id) l
    on l.kind = s.kind and l.account_id = s.account_id
  group by coalesce(s.kind, l.kind)
),
checks as (

  -- 1. row counts, source vs ledger (expected = source, actual = ledger)
  select 'compare:row_count:' || kind as check_name,
         src_rows as expected,
         ledger_rows as actual,
         case when src_rows = ledger_rows then 'PASS' else 'FAIL' end as status
  from compare

  union all

  -- 2. totals, source vs ledger
  select 'compare:total:' || kind,
         src_total,
         ledger_total,
         case when src_total = ledger_total then 'PASS' else 'FAIL' end
  from compare

  union all

  -- 3. per-account counts and totals (expected = 0 mismatched account groups)
  select 'compare:per_account:' || kind,
         0::bigint,
         mismatches,
         case when mismatches = 0 then 'PASS' else 'FAIL' end
  from per_account

  union all

  select 'compare:per_account_groups:' || kind,
         groups_compared,
         groups_compared,
         'INFO'
  from per_account

  union all

  -- 4. duplicate migration keys within an account
  select
    'duplicate_migration_keys',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from (
    select account_id, source_type, legacy_key
    from expense.transactions
    where legacy_key is not null
    group by account_id, source_type, legacy_key
    having count(*) > 1
  ) d

  union all

  -- 5. every migrated expense carries a category
  select
    'category_mapping:unmapped_expenses',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from expense.transactions t
  where t.source_type = 'migration'
    and t.type = 'expense'
    and t.category_id is null
    and coalesce(trim(t.legacy_category), '') <> ''

  union all

  -- 6. every distinct legacy category string exists as a category
  select
    'category_mapping:legacy_strings_present',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from (
    select distinct t.account_id, lower(trim(t.legacy_category)) as lc
    from expense.transactions t
    where t.source_type = 'migration'
      and coalesce(trim(t.legacy_category), '') <> ''
  ) d
  where not exists (
    select 1 from expense.categories c
    where c.account_id = d.account_id and lower(c.name) = d.lc
  )

  union all

  -- 7. ledger rows always belong to a real account
  select
    'account_fk_validity:orphan_transactions',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from expense.transactions t
  left join expense.accounts a on a.id = t.account_id
  where a.id is null

  union all

  -- 8. source rows skipped because their owner has no account
  select
    'source_rows_without_account',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from src s
  left join expense.accounts a on a.user_id = s.user_id
  where a.id is null

  union all

  -- 9. reference numbers
  select
    'reference_no:malformed',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from expense.transactions
  where reference_no !~ '^TXN-[0-9]{9}$'

  union all

  select
    'reference_no:duplicates',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from (
    select reference_no from expense.transactions group by reference_no having count(*) > 1
  ) d

  union all

  -- 10. sign convention
  select
    'signed_amount:mismatch',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from expense.transactions
  where signed_amount <> (case when direction = 'in' then amount else -amount end)

  union all

  select
    'direction:type_mismatch',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from expense.transactions
  where not (
    (type = 'expense' and direction = 'out')
    or (type in ('income', 'refund') and direction = 'in')
    or (type in ('transfer', 'adjustment'))
  )

  union all

  -- 11. transfer groups
  select
    'transfer:groups_without_two_legs',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from (
    select transfer_group_id
    from expense.transactions
    where transfer_group_id is not null and status <> 'voided'
    group by transfer_group_id having count(*) <> 2
  ) d

  union all

  select
    'transfer:unequal_legs',
    0::bigint,
    count(*)::bigint,
    case when count(*) = 0 then 'PASS' else 'FAIL' end
  from (
    select transfer_group_id
    from expense.transactions
    where transfer_group_id is not null and status <> 'voided'
    group by transfer_group_id having count(distinct amount) > 1
  ) d

  union all

  -- 12. legacy tables are no longer writable
  select
    'legacy_tables:insert_revoked',
    0::bigint,
    (
      case when to_regclass('expense.incomes') is not null
             and has_table_privilege('authenticated', 'expense.incomes', 'INSERT') then 1 else 0 end
      + case when to_regclass('expense.expenses') is not null
             and has_table_privilege('authenticated', 'expense.expenses', 'INSERT') then 1 else 0 end
    )::bigint,
    case when (
      case when to_regclass('expense.incomes') is not null
             and has_table_privilege('authenticated', 'expense.incomes', 'INSERT') then 1 else 0 end
      + case when to_regclass('expense.expenses') is not null
             and has_table_privilege('authenticated', 'expense.expenses', 'INSERT') then 1 else 0 end
    ) = 0 then 'PASS' else 'FAIL' end
),
results as (
  select check_name, expected, actual, status from checks
  union all
  select
    'summary:migrated_rows',
    (select count(*) from expense.transactions where source_type = 'migration'),
    (select count(*) from expense.transactions where source_type = 'migration'),
    'INFO'
  union all
  select
    'summary:baseline_rows',
    (select count(*) from expense.migration_baseline),
    (select count(*) from expense.migration_baseline),
    'INFO'
)
select check_name, expected, actual, status
from results
order by
  case status when 'FAIL' then 0 when 'PASS' then 1 else 2 end,
  check_name;

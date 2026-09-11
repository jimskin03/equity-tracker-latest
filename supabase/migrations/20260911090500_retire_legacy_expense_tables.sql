-- Phase 5: retire expense.incomes / expense.expenses as writable tables.
--
-- This does NOT delete anything. It removes the write grants so the superseded
-- tables cannot drift away from the canonical ledger while they are still kept
-- as a rollback source. Reads stay available for verification.
--
-- Rollback: re-grant
--   grant insert, update, delete on expense.incomes to authenticated;
--   grant insert, update, delete on expense.expenses to authenticated;
--
-- A destructive cleanup (dropping expense.incomes / expense.expenses and the
-- archive schema) is intentionally NOT part of this migration and needs its own
-- explicit approval.

do $$
begin
  if to_regclass('expense.incomes') is not null then
    execute 'revoke insert, update, delete on expense.incomes from authenticated';
    execute 'revoke all on expense.incomes from anon';
    execute 'comment on table expense.incomes is '
         || quote_literal('Retired rollback source. Superseded by expense.transactions (type = ''income''). Read-only; do not write.');
  end if;

  if to_regclass('expense.expenses') is not null then
    execute 'revoke insert, update, delete on expense.expenses from authenticated';
    execute 'revoke all on expense.expenses from anon';
    execute 'comment on table expense.expenses is '
         || quote_literal('Retired rollback source. Superseded by expense.transactions (type = ''expense''). Read-only; do not write.');
  end if;

  if to_regclass('expense.recurring') is not null then
    execute 'comment on table expense.recurring is '
         || quote_literal('Recurring rules only (generator). Payments become expense.transactions rows with source_type = ''recurring''.');
  end if;
end
$$;

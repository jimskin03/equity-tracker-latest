# Architecture notes — Ledger (expense-tracker-app)

Ledger is a minimal single-file SPA implemented in `index.html`. Authentication is shared with Cryptgreg Research through Supabase Auth and a root-domain session cookie. Record data is stored in one account-scoped ledger table in Supabase with row-level security.

## 1. Application structure

- CSS variables and theme — top of `index.html`.
- HTML markup — Records, Add, Recurring, and Calculator pages toggled with `.page` and `.active`.
- JavaScript — one inline script near the bottom of `index.html`.
- Supabase migrations — `supabase/migrations/20260911074622_normalize_expense_tracker_records.sql`, `supabase/migrations/20260911080221_add_expense_accounts_layer.sql`, `supabase/migrations/20260911082916_archive_legacy_public_expense_tables.sql`, `supabase/migrations/20260911090000_add_transactions_ledger.sql`, and `supabase/migrations/20260911090500_retire_legacy_expense_tables.sql`.
- Validation — `supabase/validation/reconcile_transactions.sql`.

## 2. JavaScript responsibilities

- Auth/session: `renderAuth`, `ensureSignedIn`, and Supabase Auth listeners.
- Data loading: `loadAll` reads account categories, the counted ledger rows, and the recurring rules for the authenticated session, then derives `incomes`, `expenses`, and `transfers` from the ledger rows.
- Row persistence: `insertRecord`, `updateRecordRow`, and `deleteRecordRow` perform ID-based CRUD; writes target `expense.transactions` by `id` plus `account_id`.
- Reversal: `reverseLedgerRow` calls the `reverse_transaction` database function so a posted row is compensated rather than rewritten.
- Forms: `addIncome`, `addExpense`, `clearIncomeForm`, and `clearExpenseForm`.
- Editing/deletion: `editRecord` enters edit mode without deleting the original; the form submits an update by UUID.
- Recurring records: `saveRecurring`, `editRecurring`, `deleteRecurring`, and `logRecurringPayment`.
- Money: `toCents`, `fromCents`, and `moneyFromCents` convert between PostgREST decimal strings and integer cents, so no balance is ever summed as a float.
- Rendering: `renderActivityFeed`, `renderDashboard`, `renderRecurringList`, and `renderChart`.
- Utilities: filtering (`getFilteredLedger`, `getFilteredExpenses`, `groupByCategory`), CSV export, escaping, calculator, and category helpers.

## 3. Relational storage contract

The account-scoped schema stores one database row per record beneath the authenticated user's account, in a single canonical ledger:

- `expense.accounts` — `id`, `user_id`, `currency`, timestamps; one account per Auth user today.
- `expense.transactions` — the canonical money ledger (`id`, `account_id`, `reference_no`, `type`, `direction`, `amount`, `signed_amount`, `record_date`, `category_id`, `description`, `source_type`, `receipt_id`, `recurring_id`, `transfer_group_id`, `reversal_of`, `legacy_key`, `legacy_category`, `metadata`, `status`, timestamps).
- `expense.categories` — account-scoped classification, case-normalized unique on `(account_id, lower(name))`.
- `expense.receipts` — evidence and extraction state, never a ledger row.
- `expense.recurring` — rules that generate transactions (via `source_type = 'recurring'`), never ledger rows.

Ownership deliberately does NOT use a `user_id` column on record tables. It flows `expense.transactions.account_id -> expense.accounts.user_id` and is enforced by RLS policies of the form `exists (select 1 from expense.accounts a where a.id = account_id and a.user_id = auth.uid())`. The browser creates or resolves the current user's account, then writes only `account_id` on records.

Each table has:

- A database-generated UUID primary key.
- A foreign key through `expense.accounts` to `auth.users(id)` with `on delete cascade`.
- Positive amount and required-field constraints.
- An account-leading index for ownership-filtered queries.
- Database-managed `created_at` and `updated_at` timestamps.
- RLS policies for authenticated SELECT/INSERT/UPDATE/DELETE operations.

Composite foreign keys (category_id/receipt_id/recurring_id/`reversal_of` paired with `account_id`) make it structurally impossible to attach a transaction to another account's category, receipt, rule, or reversal target — even if a caller guesses a UUID — because foreign key validation runs as the table owner and RLS cannot police it. RLS independently verifies that the account belongs to `auth.uid()`; client-side account filters provide defense in depth.

Ledger invariants:

- **Sign**: `amount` is always positive; `direction` (`in` | `out`) carries the sign; `signed_amount` is a stored generated column = `case when direction = 'in' then amount else -amount end`. Balances are `SUM(signed_amount)`, and a CHECK pins direction to type (`expense -> out`, `income`/`refund -> in`, `transfer`/`adjustment` either).
- **Reporting**: counted rows are `status in ('posted', 'reversed')`, exposed as the view `expense.counted_transactions` (`security_invoker`); `pending` and `voided` are excluded. A reversed row and its compensating row must both be counted, otherwise the pair would inflate the balance by the transaction amount — which is why reports read the view rather than `status = 'posted'`.
- **Reversal**: `expense.reverse_transaction` marks the original `reversed` and posts a compensating opposite-side row in the same account, linked by `reversal_of`; nothing is overwritten. `voided` is the alternative that leaves reports without a compensating row.
- **Immutability**: a BEFORE UPDATE trigger freezes `amount`/`direction`/`type`/`record_date` on non-`manual` rows once posted, pins `id`/`account_id`/`reference_no` always, and forbids rewriting `source_type`/`legacy_key`. Hard DELETE is allowed only for `source_type = 'manual'` rows that are not reversed.
- **Transfers**: two rows sharing a `transfer_group_id` (equal amount, opposite directions, two different accounts), enforced by a `DEFERRABLE INITIALLY DEFERRED` constraint trigger, created atomically by `expense.create_transfer` (`SECURITY INVOKER`). Cross-currency transfers are rejected until FX support exists.
- **References**: `reference_no` comes from `expense.next_transaction_reference()` using `expense.transaction_reference_seq`, formatted `TXN-000000001`, global and monotonic (not dated, not gapless). `reference_no` is UNIQUE; the UUID remains the relational key.
- **Migration key**: the unique index `ux_transactions_migration_key` on `(account_id, source_type, legacy_key)` where `legacy_key is not null` makes backfill idempotent. It must be account-scoped because source `legacy_key` values are per-user ordinals (e.g. `'income:1'`) and are not globally unique.

## 4. Migration and rollback

`20260911090000_add_transactions_ledger.sql` creates `expense.transactions`, `expense.categories`, and `expense.receipts`, extends `expense.recurring`, adds the reporting view and integrity triggers/functions, and backfills the archived snapshot idempotently (`ON CONFLICT ... DO NOTHING`). It resolves the source tables at runtime — `archive.expense_expense_records` / `archive.expense_income_records` first, then `public.*` — and skips rows whose owner has no account with a WARNING. It requires PostgreSQL 15+ (column-specific `ON DELETE SET NULL`).

`20260911090500_retire_legacy_expense_tables.sql` revokes INSERT/UPDATE/DELETE grants on `expense.incomes` and `expense.expenses` and revokes `anon` access, leaving them readable as read-only rollback sources. It does not delete anything; the `archive` schema is preserved, and a destructive drop needs separate explicit approval.

Rollback of the retirement is a re-grant:

```sql
grant insert, update, delete on expense.incomes to authenticated;
grant insert, update, delete on expense.expenses to authenticated;
```

Migrations are applied by pasting them into the project's Supabase SQL editor in filename order (there is no CLI link on this host and no service-role credential is stored). After applying the ledger migration, run `supabase/validation/reconcile_transactions.sql` in the same editor; every check reports PASS or FAIL and zero FAIL rows is the acceptance condition. Status: the ledger migrations are written and verified against a local PostgreSQL 17 reproduction of the migration chain, but are NOT yet applied to the production Supabase project.

Before permanently deleting the archived tables:

1. Confirm the live application has no references to the archive schema.
2. Keep an export or backup if the rollback window is still required.
3. Obtain explicit approval for a separate destructive cleanup migration.

## 5. Adding a future service

Create a dedicated table rather than extending expense tables:

```sql
create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index service_records_user_id_idx
  on public.service_records(user_id);
```

Enable RLS and add separate SELECT/INSERT/UPDATE/DELETE policies using `auth.uid() = user_id`. Do not modify `auth.users` directly or rely on the browser alone for authorization.

## 6. Security and privacy

- Supabase Auth owns account identity.
- Ledger ownership is account-scoped: `expense.transactions.account_id -> expense.accounts.user_id`, with no `user_id` column on record tables and no caller-supplied owner id trusted or stored.
- RLS is the authoritative data-isolation boundary; composite foreign keys additionally make cross-account relationships structurally impossible.
- The publishable key is safe for browser use; service-role credentials must never be shipped to the client and none is stored for applying migrations.
- User emails, access tokens, and financial records must not be written to debug logs or exposed in documentation.

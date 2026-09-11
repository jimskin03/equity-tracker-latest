-- Retire the FinanceDatabase instrument master.
--
-- Identifiers are now resolved on demand through OpenFIGI
-- (api.openfigi.com/v3/mapping), which needs no key and no hosted copy, so a
-- 111k-row reference catalogue is dead weight in the project.
--
-- Migration history stays additive: the earlier migrations still create the
-- schema and columns, and this one removes them. Only structures that existed
-- solely to link against the catalogue are dropped; no portfolio business row
-- (accounts, securities, holdings, prices, trades) is deleted or rewritten.
--
-- Order matters when deploying: ship the client that stops selecting
-- instrument_id / instrument_source / metadata_updated_at FIRST, then apply
-- this, or the live Portfolio view breaks on a missing column.

alter table portfolio.securities drop constraint if exists securities_instrument_fk;
alter table portfolio.securities
  drop column if exists instrument_id,
  drop column if exists instrument_source,
  drop column if exists metadata_updated_at;

drop schema if exists reference cascade;

alter role authenticator set pgrst.db_schemas = 'public, graphql_public, expense, portfolio';
notify pgrst, 'reload config';

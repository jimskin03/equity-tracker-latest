-- Allow securities that OpenFIGI identifies by FIGI rather than ISIN.
--
-- /v3/search resolves a listing from a ticker or company name and returns FIGIs
-- only — it never echoes an ISIN. A security stored from that path therefore has
-- to be identifiable without one, so the ISIN becomes optional and a security
-- must instead carry at least one identifier.
--
-- Additive: no row is rewritten. `securities_isin_check` already tolerates NULL
-- (a NULL check result passes), so the ISIN format rule still applies whenever
-- an ISIN is present.

alter table portfolio.securities alter column isin drop not null;

alter table portfolio.securities drop constraint if exists securities_identifier_present;
alter table portfolio.securities add constraint securities_identifier_present
  check (isin is not null or figi is not null);

create index if not exists portfolio_securities_figi_idx on portfolio.securities (figi);

-- Existing orphans (a holding deleted before the delete path cleaned up after
-- itself) are removed here; prices cascade with their security.
delete from portfolio.securities s
where not exists (select 1 from portfolio.holdings h where h.security_id = s.id);

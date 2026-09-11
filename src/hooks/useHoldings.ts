import { useCallback, useEffect, useMemo, useState } from 'react'
import { lookupSecurity, refreshLatestPrice } from '../api/marketData'
import { portfolioDb } from '../lib/supabase'
import type { Holding, SecurityLookupResult } from '../types'

const LEGACY_STORAGE_KEY = 'equity-tracker-holdings-v1'

function readableError(value: unknown, fallback: string): string {
  if (value && typeof value === 'object') {
    const candidate = value as { code?: string; message?: string; details?: string; hint?: string }
    if (candidate.code === 'PGRST106' || candidate.message?.toLowerCase().includes('invalid schema')) {
      return 'Portfolio is not enabled in Supabase yet. Apply the portfolio migration, then expose the portfolio schema in Supabase API settings.'
    }
    return [candidate.message, candidate.details, candidate.hint].filter(Boolean).join(' — ') || fallback
  }
  return value instanceof Error ? value.message : fallback
}

interface SecurityRow {
  id: string
  instrument_id: string | null
  isin: string
  security_name: string
  ticker: string
  exchange_code: string | null
  currency: string
}
interface HoldingRow {
  id: string
  security_id: string
  quantity: number | string
  average_cost: number | string
  updated_at: string
}

interface PriceRow {
  security_id: string
  price: number | string
  currency: string
  as_of: string
}

function migrationMarker(userId: string): string {
  return `${LEGACY_STORAGE_KEY}:migrated:${userId}`
}

function readLegacyHoldings(): Holding[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || '[]') as Holding[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function ensurePortfolioAccount(userId: string): Promise<string> {
  const { data, error } = await portfolioDb
    .from('accounts')
    .upsert({ user_id: userId }, { onConflict: 'user_id' })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

// Reference metadata from the FinanceDatabase instrument master. Only fields the
// lookup actually resolved are sent, so a partial refresh (for example a
// Yahoo-only price refresh) never blanks metadata that is already stored.
const SECURITY_METADATA_COLUMNS = [
  ['instrument_id', 'instrumentId'],
  ['asset_type', 'assetType'],
  ['sector', 'sector'],
  ['industry_group', 'industryGroup'],
  ['industry', 'industry'],
  ['country', 'country'],
  ['exchange_name', 'exchangeName'],
  ['cusip', 'cusip'],
  ['figi', 'figi'],
  ['composite_figi', 'compositeFigi'],
  ['shareclass_figi', 'shareclassFigi'],
  ['instrument_source', 'instrumentSource'],
] as const

const SECURITY_SELECT =
  'id, instrument_id, asset_type, sector, industry_group, industry, country, exchange_name, cusip, figi, composite_figi, shareclass_figi, instrument_source, isin, security_name, ticker, exchange_code, currency'

function securityMetadata(security: SecurityLookupResult, accountId: string, isin: string): Record<string, string> {
  const payload: Record<string, string> = { account_id: accountId, isin }
  for (const [column, key] of SECURITY_METADATA_COLUMNS) {
    const value = security[key]
    if (typeof value === 'string' && value) payload[column] = value
  }
  return payload
}

async function saveSecurity(
  accountId: string,
  security: SecurityLookupResult,
): Promise<SecurityRow> {
  const key = security.instrumentId ? 'instrument_id' : 'isin'
  const existing = await portfolioDb.from('securities').select('id').eq('account_id', accountId).eq(key, security.instrumentId || security.isin).maybeSingle()
  if (existing.error) throw existing.error
  const payload = {
    ...securityMetadata(security, accountId, security.isin),
    security_name: security.securityName,
    ticker: security.ticker,
    exchange_code: security.exchangeCode || null,
    currency: security.currency || 'USD',
    metadata_updated_at: new Date().toISOString(),
  }
  const { data, error } = existing.data
    ? await portfolioDb.from('securities').update(payload).eq('id', existing.data.id).select(SECURITY_SELECT).single()
    : await portfolioDb.from('securities').insert(payload).select(SECURITY_SELECT).single()
  if (error) throw error
  return data as SecurityRow
}

async function savePrice(
  accountId: string,
  securityId: string,
  price: number,
  currency: string,
  asOf = new Date().toISOString(),
): Promise<void> {
  if (!(price > 0)) return
  const { error } = await portfolioDb.from('prices').upsert(
    {
      account_id: accountId,
      security_id: securityId,
      price,
      currency: currency || 'USD',
      as_of: asOf,
      source: 'yahoo',
    },
    { onConflict: 'account_id,security_id,source,as_of' },
  )
  if (error) throw error
}

async function fetchHoldings(accountId: string): Promise<Holding[]> {
  const [securityResult, holdingResult, priceResult] = await Promise.all([
    portfolioDb
      .from('securities')
      .select('id, instrument_id, isin, security_name, ticker, exchange_code, currency')
      .eq('account_id', accountId),
    portfolioDb
      .from('holdings')
      .select('id, security_id, quantity, average_cost, updated_at')
      .eq('account_id', accountId)
      .order('updated_at', { ascending: false }),
    portfolioDb
      .from('prices')
      .select('security_id, price, currency, as_of')
      .eq('account_id', accountId)
      .order('as_of', { ascending: false })
      .limit(2000),
  ])
  const error = securityResult.error || holdingResult.error || priceResult.error
  if (error) throw error

  const securities = new Map(
    ((securityResult.data || []) as SecurityRow[]).map((security) => [security.id, security]),
  )
  const latestPrices = new Map<string, PriceRow>()
  for (const price of (priceResult.data || []) as PriceRow[]) {
    if (!latestPrices.has(price.security_id)) latestPrices.set(price.security_id, price)
  }

  return ((holdingResult.data || []) as HoldingRow[]).flatMap((holding) => {
    const security = securities.get(holding.security_id)
    if (!security) return []
    const quote = latestPrices.get(holding.security_id)
    const costPrice = Number(holding.average_cost)
    return [{
      id: holding.id,
      instrumentId: security.instrument_id || undefined,
      isin: security.isin,
      securityName: security.security_name,
      ticker: security.ticker,
      holdings: Number(holding.quantity),
      costPrice,
      latestPrice: quote ? Number(quote.price) : costPrice,
      currency: quote?.currency || security.currency,
      updatedAt: quote?.as_of || holding.updated_at,
    }]
  })
}

async function importLegacyHoldings(accountId: string, userId: string): Promise<number> {
  if (localStorage.getItem(migrationMarker(userId))) return 0
  const legacy = readLegacyHoldings()
  if (!legacy.length) return 0

  for (const holding of legacy) {
    const security = await saveSecurity(accountId, {
      isin: holding.isin.trim().toUpperCase(),
      securityName: holding.securityName,
      ticker: holding.ticker,
      latestPrice: holding.latestPrice,
      currency: holding.currency,
    })
    const { error } = await portfolioDb.from('holdings').upsert(
      {
        account_id: accountId,
        security_id: security.id,
        quantity: holding.holdings,
        average_cost: holding.costPrice,
      },
      { onConflict: 'account_id,security_id' },
    )
    if (error) throw error
    await savePrice(
      accountId,
      security.id,
      holding.latestPrice,
      holding.currency,
      holding.updatedAt || new Date().toISOString(),
    )
  }

  // Retain the original payload as a rollback copy; the marker only prevents
  // repeated imports after the database cutover succeeds.
  localStorage.setItem(migrationMarker(userId), new Date().toISOString())
  return legacy.length
}

export function useHoldings(userId: string) {
  const [accountId, setAccountId] = useState<string | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  const clearMessages = useCallback(() => { setError(null); setStatus(null) }, [])

  const reload = useCallback(async (id: string) => {
    const rows = await fetchHoldings(id)
    setHoldings(rows)
    return rows
  }, [])

  useEffect(() => {
    let active = true
    const boot = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const id = await ensurePortfolioAccount(userId)
        let rows = await fetchHoldings(id)
        let imported = 0
        if (rows.length === 0) {
          imported = await importLegacyHoldings(id, userId)
          if (imported) rows = await fetchHoldings(id)
        }
        if (!active) return
        setAccountId(id)
        setHoldings(rows)
        if (imported) setStatus(`Imported ${imported} browser holding${imported === 1 ? '' : 's'} into Supabase.`)
      } catch (bootError) {
        if (!active) return
        setError(readableError(bootError, 'Could not load portfolio'))
      } finally {
        if (active) setIsLoading(false)
      }
    }
    void boot()
    return () => { active = false }
  }, [userId])

  const addHolding = useCallback(async (isin: string, quantity: number, costPrice: number) => {
    if (!accountId) throw new Error('Portfolio account is not ready')
    clearMessages(); setIsLoading(true)
    try {
      const lookup = await lookupSecurity(isin)
      if (holdings.some((holding) => (lookup.instrumentId && holding.instrumentId === lookup.instrumentId) || (!lookup.instrumentId && holding.isin === lookup.isin && holding.ticker === lookup.ticker))) throw new Error(`This listing is already held. Edit the existing row instead.`)
      const security = await saveSecurity(accountId, lookup)
      const { error: saveError } = await portfolioDb.from('holdings').insert({ account_id: accountId, security_id: security.id, quantity, average_cost: costPrice })
      if (saveError) throw saveError
      await savePrice(accountId, security.id, lookup.latestPrice, lookup.currency)
      await reload(accountId)
      setStatus(lookup.latestPrice > 0 ? `Saved ${lookup.securityName} (${lookup.ticker})` : `Saved ${lookup.securityName}. Latest market price unavailable — using cost price.`)
    } catch (saveError) {
      const message = readableError(saveError, 'Failed to save holding')
      setError(message); throw saveError
    } finally { setIsLoading(false) }
  }, [accountId, clearMessages, holdings, reload])

  const updateHolding = useCallback(async (id: string, updates: { isin?: string; holdings: number; costPrice: number }, options?: { refreshMarketData?: boolean }) => {
    if (!accountId) throw new Error('Portfolio account is not ready')
    clearMessages(); setIsLoading(true)
    try {
      const current = holdings.find((holding) => holding.id === id)
      if (!current) throw new Error('Holding not found')
      const nextIsin = (updates.isin || current.isin).trim().toUpperCase()
      const needsLookup = nextIsin !== current.isin || options?.refreshMarketData
      let securityId: string | undefined
      if (needsLookup) {
        const lookup = await lookupSecurity(nextIsin)
        if (holdings.some((holding) => holding.id !== id && ((lookup.instrumentId && holding.instrumentId === lookup.instrumentId) || (!lookup.instrumentId && holding.isin === lookup.isin && holding.ticker === lookup.ticker)))) throw new Error('Another holding already uses this listing')
        const security = await saveSecurity(accountId, lookup)
        securityId = security.id
        await savePrice(accountId, security.id, lookup.latestPrice, lookup.currency)
      }
      const values: Record<string, string | number> = { quantity: updates.holdings, average_cost: updates.costPrice }
      if (securityId) values.security_id = securityId
      const { error: updateError } = await portfolioDb.from('holdings').update(values).eq('id', id).eq('account_id', accountId)
      if (updateError) throw updateError
      const rows = await reload(accountId)
      setStatus(`Updated ${rows.find((holding) => holding.id === id)?.securityName || current.securityName}`)
    } catch (updateError) {
      const message = readableError(updateError, 'Failed to update holding')
      setError(message); throw updateError
    } finally { setIsLoading(false) }
  }, [accountId, clearMessages, holdings, reload])

  const deleteHolding = useCallback(async (id: string) => {
    if (!accountId) return
    clearMessages(); setIsLoading(true)
    try {
      const { error: deleteError } = await portfolioDb
        .from('holdings')
        .delete()
        .eq('id', id)
        .eq('account_id', accountId)
      if (deleteError) throw deleteError
      await reload(accountId); setStatus('Holding deleted')
    } catch (deleteError) {
      setError(readableError(deleteError, 'Failed to delete holding'))
    } finally { setIsLoading(false) }
  }, [accountId, clearMessages, reload])

  const refreshAllPrices = useCallback(async () => {
    if (!accountId || holdings.length === 0) return
    clearMessages(); setIsLoading(true)
    try {
      await Promise.all(holdings.map(async (holding) => {
        const quote = await refreshLatestPrice(holding.ticker)
        if (!quote) return
        const security = await saveSecurity(accountId, { isin: holding.isin, securityName: holding.securityName, ticker: holding.ticker, latestPrice: quote.latestPrice, currency: quote.currency })
        await savePrice(accountId, security.id, quote.latestPrice, quote.currency)
      }))
      await reload(accountId); setStatus('Latest prices refreshed')
    } catch (refreshError) {
      setError(readableError(refreshError, 'Failed to refresh prices'))
    } finally { setIsLoading(false) }
  }, [accountId, clearMessages, holdings, reload])

  const summary = useMemo(() => {
    const totalCost = holdings.reduce((sum, holding) => sum + holding.holdings * holding.costPrice, 0)
    const totalMarket = holdings.reduce((sum, holding) => sum + holding.holdings * holding.latestPrice, 0)
    const pnl = totalMarket - totalCost
    return { totalCost, totalMarket, pnl, pnlPct: totalCost > 0 ? (pnl / totalCost) * 100 : 0, count: holdings.length }
  }, [holdings])

  return { holdings, isLoading, error, status, summary, addHolding, updateHolding, deleteHolding, refreshAllPrices, clearMessages }
}

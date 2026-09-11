import { referenceDb } from '../lib/supabase'
import type { InstrumentSearchResult, SecurityLookupResult } from '../types'

interface OpenFigiMapping {
  name?: string
  ticker?: string
  exchCode?: string
  securityType?: string
  marketSector?: string
  compositeFIGI?: string
}

interface OpenFigiResponseItem {
  data?: OpenFigiMapping[]
  error?: string
  warning?: string
}

interface YahooChartMeta {
  symbol?: string
  currency?: string
  regularMarketPrice?: number
  previousClose?: number
  shortName?: string
  longName?: string
  exchangeName?: string
}

function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase()
}

function isValidIsin(isin: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)
}

async function parseJsonResponse<T>(response: Response, label: string): Promise<T> {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!contentType.includes('application/json')) {
    throw new Error(
      `${label} returned non-JSON (${response.status}). ` +
        'The API proxy may be missing in this deployment.',
    )
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`${label} returned invalid JSON (${response.status})`)
  }
}

async function mapIsinWithOpenFigi(isin: string): Promise<OpenFigiMapping> {
  const response = await fetch('/api/openfigi/v3/mapping', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([{ idType: 'ID_ISIN', idValue: isin }]),
  })

  if (!response.ok) {
    throw new Error(`OpenFIGI lookup failed (${response.status})`)
  }

  const payload = await parseJsonResponse<OpenFigiResponseItem[]>(response, 'OpenFIGI')
  const first = payload[0]

  if (!first || first.error || !first.data?.length) {
    throw new Error(first?.error || 'No security found for this ISIN')
  }

  // Prefer equity-like listings with a ticker
  const preferred =
    first.data.find((item) => item.ticker && item.marketSector === 'Equity') ||
    first.data.find((item) => item.ticker) ||
    first.data[0]

  if (!preferred?.name) {
    throw new Error('Security name not available for this ISIN')
  }

  return preferred
}

function buildYahooSymbols(mapping: OpenFigiMapping): string[] {
  const ticker = mapping.ticker?.trim()
  if (!ticker) return []

  const exchange = (mapping.exchCode || '').toUpperCase()
  const symbols = new Set<string>([ticker])

  // Common Yahoo Finance exchange suffixes
  const suffixByExchange: Record<string, string> = {
    LN: '.L',
    L: '.L',
    GY: '.DE',
    GR: '.DE',
    FP: '.PA',
    PA: '.PA',
    NA: '.AS',
    AS: '.AS',
    SW: '.SW',
    VX: '.SW',
    IM: '.MI',
    MI: '.MI',
    SM: '.MC',
    MC: '.MC',
    HK: '.HK',
    JT: '.T',
    T: '.T',
    AU: '.AX',
    AX: '.AX',
    TO: '.TO',
    CN: '.TO',
    SS: '.SS',
    SZ: '.SZ',
    KS: '.KS',
    KQ: '.KQ',
    TW: '.TW',
    TWO: '.TWO',
  }

  const suffix = suffixByExchange[exchange]
  if (suffix && !ticker.includes('.')) {
    symbols.add(`${ticker}${suffix}`)
  }

  // US listings often work with bare ticker
  if (['US', 'UW', 'UN', 'UQ', 'UA', 'NY', 'NS'].includes(exchange)) {
    symbols.add(ticker)
  }

  return Array.from(symbols)
}

async function fetchYahooQuote(symbol: string): Promise<YahooChartMeta | null> {
  const url = `/api/yahoo/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`
  const response = await fetch(url)

  if (!response.ok) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    const payload = await response.json()
    const result = payload?.chart?.result?.[0]
    if (!result?.meta) {
      return null
    }
    return result.meta as YahooChartMeta
  } catch {
    return null
  }
}

async function resolveLatestPrice(
  mapping: OpenFigiMapping,
): Promise<{ latestPrice: number; currency: string; resolvedTicker: string }> {
  const candidates = buildYahooSymbols(mapping)

  for (const symbol of candidates) {
    const meta = await fetchYahooQuote(symbol)
    const price = meta?.regularMarketPrice ?? meta?.previousClose

    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      return {
        latestPrice: price,
        currency: meta?.currency || 'USD',
        resolvedTicker: meta?.symbol || symbol,
      }
    }
  }

  // Price unavailable — still allow saving with name from OpenFIGI
  return {
    latestPrice: 0,
    currency: 'USD',
    resolvedTicker: mapping.ticker || mapping.name || 'N/A',
  }
}

export async function searchInstruments(query: string, limit = 12): Promise<InstrumentSearchResult[]> {
  const term = query.trim()
  if (term.length < 2) return []
  const pattern = `%${term.replace(/[%_]/g, '')}%`
  const { data, error } = await referenceDb.from('instruments')
    .select('id,symbol,name,isin,exchange_code,exchange_name,currency_code,country,sector,industry_group,industry,asset_type,cusip,figi,composite_figi,shareclass_figi,source')
    .or(`symbol.ilike.${pattern},name.ilike.${pattern},isin.ilike.${pattern}`)
    .order('name').limit(limit)
  if (error) throw error
  return ((data || []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id), symbol: String(row.symbol), name: String(row.name),
    isin: str(row.isin) ?? null, exchangeCode: str(row.exchange_code) ?? null, currency: str(row.currency_code) ?? null,
    country: str(row.country), sector: str(row.sector), exchangeName: str(row.exchange_name),
    industryGroup: str(row.industry_group), industry: str(row.industry), assetType: str(row.asset_type),
    cusip: str(row.cusip), figi: str(row.figi), compositeFigi: str(row.composite_figi),
    shareclassFigi: str(row.shareclass_figi), instrumentSource: str(row.source),
  }))
}

function str(value: unknown): string | undefined {
  return value === null || value === undefined || value === '' ? undefined : String(value)
}

async function lookupFromReference(query: string): Promise<SecurityLookupResult | null> {
  let rows: InstrumentSearchResult[]
  try { rows = await searchInstruments(query, 15) } catch { return null }
  // The catalogue lists one row per exchange and only ~27% of listings carry an
  // ISIN, so prefer an exact symbol/ISIN match that has one instead of blindly
  // taking the first name match (which may be unrelated, or ISIN-less).
  const term = query.trim().toUpperCase()
  const withIsin = rows.filter(
    (candidate): candidate is InstrumentSearchResult & { isin: string } => Boolean(candidate.isin),
  )
  if (!withIsin.length) return null
  const row =
    withIsin.find((candidate) => candidate.symbol.toUpperCase() === term) ||
    withIsin.find((candidate) => candidate.isin?.toUpperCase() === term) ||
    withIsin[0]
  const quote = await resolveLatestPrice({ name: row.name, ticker: row.symbol, exchCode: row.exchangeCode || undefined })
  return {
    instrumentId: row.id,
    isin: row.isin.toUpperCase(),
    securityName: row.name,
    ticker: quote.resolvedTicker || row.symbol,
    exchangeCode: row.exchangeCode || undefined,
    latestPrice: quote.latestPrice,
    currency: quote.currency || row.currency || 'USD',
    assetType: row.assetType || undefined,
    sector: row.sector || undefined,
    industryGroup: row.industryGroup || undefined,
    industry: row.industry || undefined,
    country: row.country || undefined,
    exchangeName: row.exchangeName || undefined,
    cusip: row.cusip || undefined,
    figi: row.figi || undefined,
    compositeFigi: row.compositeFigi || undefined,
    shareclassFigi: row.shareclassFigi || undefined,
    instrumentSource: row.instrumentSource || 'financedatabase',
  }
}

export async function lookupSecurity(query: string): Promise<SecurityLookupResult> {
  return (await lookupFromReference(query)) || lookupSecurityByIsin(query)
}

export async function lookupSecurityByIsin(rawIsin: string): Promise<SecurityLookupResult> {
  const isin = normalizeIsin(rawIsin)

  if (!isValidIsin(isin)) {
    throw new Error('Invalid ISIN format. Expected 12 characters (e.g. US0378331005).')
  }

  const mapping = await mapIsinWithOpenFigi(isin)
  const quote = await resolveLatestPrice(mapping)

  return {
    isin,
    securityName: mapping.name || 'Unknown Security',
    ticker: quote.resolvedTicker,
    exchangeCode: mapping.exchCode,
    latestPrice: quote.latestPrice,
    currency: quote.currency,
  }
}

export async function refreshLatestPrice(
  ticker: string,
): Promise<{ latestPrice: number; currency: string } | null> {
  if (!ticker || ticker === 'N/A') return null

  const meta = await fetchYahooQuote(ticker)
  const price = meta?.regularMarketPrice ?? meta?.previousClose

  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null
  }

  return {
    latestPrice: price,
    currency: meta?.currency || 'USD',
  }
}

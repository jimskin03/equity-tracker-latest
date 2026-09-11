import type { SecurityLookupResult } from '../types'

interface OpenFigiMapping {
  name?: string
  ticker?: string
  exchCode?: string
  securityType?: string
  marketSector?: string
  figi?: string
  compositeFIGI?: string
  shareClassFIGI?: string
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

export async function lookupSecurity(query: string): Promise<SecurityLookupResult> {
  return lookupSecurityByIsin(query)
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
    // Identifiers come from OpenFIGI directly, so a holding carries its FIGI
    // even when nothing is cached in the instrument master.
    assetType: mapping.marketSector ? mapping.marketSector.toLowerCase() : 'equity',
    figi: mapping.figi,
    compositeFigi: mapping.compositeFIGI,
    shareclassFigi: mapping.shareClassFIGI,
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

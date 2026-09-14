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
  chartPreviousClose?: number
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

  if (response.status === 429) {
    throw new Error('OpenFIGI rate limit reached. Wait a few seconds and try again — an OpenFIGI API key raises the limit.')
  }

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
    MK: '.KL',
    KL: '.KL',
    MY: '.KL',
    KLS: '.KL',
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
): Promise<{ latestPrice: number; previousClose?: number; currency: string; resolvedTicker: string }> {
  const candidates = buildYahooSymbols(mapping)

  for (const symbol of candidates) {
    const meta = await fetchYahooQuote(symbol)
    const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? meta?.previousClose

    if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
      return {
        latestPrice: price,
        previousClose: meta?.chartPreviousClose ?? meta?.previousClose,
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

interface OpenFigiSearchResponse {
  data?: OpenFigiMapping[]
  error?: string
}

// OpenFIGI's search endpoint takes a free-text ticker or company name. It never
// returns an ISIN — only FIGIs — so a result resolved this way is identified by
// figi. Rate limits are tighter than /v3/mapping (a handful of calls a minute
// without an API key), which is why the ISIN path stays the precise one.
async function searchOpenFigi(query: string, exchCode?: string): Promise<OpenFigiMapping[]> {
  const body: Record<string, string> = { query }
  if (exchCode) body.exchCode = exchCode

  const response = await fetch('/api/openfigi/v3/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (response.status === 429) {
    throw new Error('OpenFIGI rate limit reached. Wait a few seconds and try again — an OpenFIGI API key raises the limit.')
  }

  if (!response.ok) {
    throw new Error(`OpenFIGI search failed (${response.status})`)
  }

  const payload = await parseJsonResponse<OpenFigiSearchResponse>(response, 'OpenFIGI search')
  if (payload.error) throw new Error(payload.error)
  return payload.data || []
}

async function lookupSecurityByQuery(term: string): Promise<SecurityLookupResult> {
  const usable = (items: OpenFigiMapping[]) => items.filter((item) => item.ticker && item.figi)

  // An unfiltered search for a company name returns a page flooded with foreign
  // cross-listings (searching "microsoft" leads with Frankfurt rows), so a bare
  // ticker or name is tried against the US listing first. An explicit exchange
  // suffix such as PTX.AX or VOD.L means the caller knows which listing they
  // want, and falls straight through to the unfiltered search.
  let matches: OpenFigiMapping[] = []
  if (!term.includes('.')) {
    try {
      matches = usable(await searchOpenFigi(term, 'US'))
    } catch {
      matches = []
    }
  }
  if (!matches.length) matches = usable(await searchOpenFigi(term))

  if (!matches.length) {
    throw new Error(`No security found for "${term}". Try a ticker like AAPL or the full company name.`)
  }

  const upper = term.toUpperCase()
  const composite = (item: OpenFigiMapping) => Boolean(item.figi && item.figi === item.compositeFIGI)
  // Prefer the primary listing: OpenFIGI returns one row per exchange, and the
  // row whose FIGI equals its composite FIGI is the composite/primary one.
  const preferred =
    matches.find((item) => item.ticker?.toUpperCase() === upper && composite(item)) ||
    matches.find((item) => item.ticker?.toUpperCase() === upper) ||
    matches.find(composite) ||
    matches.find((item) => item.marketSector === 'Equity') ||
    matches[0]

  const quote = await resolveLatestPrice(preferred)

  return {
    securityName: preferred.name || 'Unknown Security',
    ticker: quote.resolvedTicker || preferred.ticker || 'N/A',
    exchangeCode: preferred.exchCode,
    latestPrice: quote.latestPrice,
    previousClose: quote.previousClose,
    currency: quote.currency,
    assetType: preferred.marketSector ? preferred.marketSector.toLowerCase() : 'equity',
    figi: preferred.figi,
    compositeFigi: preferred.compositeFIGI,
    shareclassFigi: preferred.shareClassFIGI,
  }
}

// Well-known Bursa stock names mapping for common numeric codes
const BURSA_NAMES: Record<string, string> = {
  '1155': 'Maybank',
  '1023': 'CIMB Group',
  '1295': 'Public Bank',
  '5347': 'Tenaga Nasional',
  '5211': 'Sunway',
  '5249': 'Capital A (AirAsia)',
  '4677': 'YTL Corporation',
  '1015': 'AMMB Holdings',
  '1066': 'RHB Bank',
  '8869': 'Press Metal',
  '6012': 'Maxis',
  '6888': 'Axiata Group',
  '5183': 'Petronas Chemicals',
  '5681': 'Petronas Dagangan',
  '4707': 'Nestle (Malaysia)',
  '3182': 'Genting',
  '4715': 'Genting Malaysia',
  '5819': 'Hong Leong Bank',
  '7084': 'QL Resources',
  '2445': 'KL Kepong',
  '1961': 'IOI Corporation',
}

async function lookupBursaStock(code: string): Promise<SecurityLookupResult | null> {
  const cleanCode = code.replace(/\.KL$/i, '').trim()
  const yahooSymbol = `${cleanCode}.KL`
  const meta = await fetchYahooQuote(yahooSymbol)
  if (!meta) return null

  const price = meta.regularMarketPrice ?? meta.chartPreviousClose ?? meta.previousClose ?? 0
  if (price <= 0) return null

  const prev = meta.chartPreviousClose ?? meta.previousClose
  const fallbackName = BURSA_NAMES[cleanCode] || `Bursa ${cleanCode}`
  const name = meta.shortName || meta.longName || fallbackName

  return {
    securityName: name,
    ticker: yahooSymbol,
    exchangeCode: 'KLS',
    latestPrice: price,
    previousClose: prev,
    currency: meta.currency || 'MYR',
    assetType: 'equity',
    figi: `BURSA_${cleanCode}`,
    compositeFigi: `BURSA_${cleanCode}`,
  }
}

export async function lookupSecurity(query: string): Promise<SecurityLookupResult> {
  const term = query.trim()
  if (!term) throw new Error('Enter a ticker, a company name, or an ISIN.')

  // Check for 4-to-6 digit Bursa numeric code (e.g. 1155, 1023, 1295, 5347) or explicit .KL
  if (/^\d{4,6}(\.KL)?$/i.test(term)) {
    try {
      const bursa = await lookupBursaStock(term)
      if (bursa && bursa.latestPrice > 0) return bursa
    } catch (err) {
      console.warn('[bursa direct lookup error]', err)
    }
  }

  const maybeIsin = normalizeIsin(term)
  if (isValidIsin(maybeIsin)) return lookupSecurityByIsin(maybeIsin)
  return lookupSecurityByQuery(term)
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
    previousClose: quote.previousClose,
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
): Promise<{ latestPrice: number; previousClose?: number; currency: string } | null> {
  if (!ticker || ticker === 'N/A') return null

  const meta = await fetchYahooQuote(ticker)
  const price = meta?.regularMarketPrice ?? meta?.chartPreviousClose ?? meta?.previousClose

  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) {
    return null
  }

  return {
    latestPrice: price,
    previousClose: meta?.chartPreviousClose ?? meta?.previousClose,
    currency: meta?.currency || 'USD',
  }
}

export interface Holding {
  id: string
  instrumentId?: string
  isin: string
  securityName: string
  ticker: string
  holdings: number
  costPrice: number
  latestPrice: number
  currency: string
  updatedAt: string
}

export interface HoldingFormData {
  isin: string
  holdings: string
  costPrice: string
}

export interface SecurityLookupResult {
  instrumentId?: string
  isin: string
  securityName: string
  ticker: string
  exchangeCode?: string
  latestPrice: number
  currency: string
}

export interface InstrumentSearchResult {
  id: string
  symbol: string
  name: string
  isin: string | null
  exchangeCode: string | null
  currency: string | null
  country: string | null
  sector: string | null
}

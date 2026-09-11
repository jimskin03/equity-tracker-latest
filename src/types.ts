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

export interface SecurityMetadata {
  assetType?: string
  sector?: string
  industryGroup?: string
  industry?: string
  country?: string
  exchangeName?: string
  cusip?: string
  figi?: string
  compositeFigi?: string
  shareclassFigi?: string
  instrumentSource?: string
}

export interface SecurityLookupResult extends SecurityMetadata {
  instrumentId?: string
  isin: string
  securityName: string
  ticker: string
  exchangeCode?: string
  latestPrice: number
  currency: string
}

export interface InstrumentSearchResult extends SecurityMetadata {
  id: string
  symbol: string
  name: string
  isin: string | null
  exchangeCode: string | null
  currency: string | null
}

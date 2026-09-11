export interface Holding {
  id: string
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
}

export interface SecurityLookupResult extends SecurityMetadata {
  isin: string
  securityName: string
  ticker: string
  exchangeCode?: string
  latestPrice: number
  currency: string
}

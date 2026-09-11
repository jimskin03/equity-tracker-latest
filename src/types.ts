export interface Holding {
  id: string
  securityId: string
  isin?: string
  figi?: string
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
  /** Absent for a listing OpenFIGI identifies only by FIGI. */
  isin?: string
  securityName: string
  ticker: string
  exchangeCode?: string
  latestPrice: number
  currency: string
}

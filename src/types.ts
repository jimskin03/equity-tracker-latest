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

export interface SecurityLookupResult {
  isin: string
  securityName: string
  ticker: string
  exchangeCode?: string
  latestPrice: number
  currency: string
}

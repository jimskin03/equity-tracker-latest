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
  previousClose?: number
  currency: string
  updatedAt: string
  baseCostPrice?: number
  baseLatestPrice?: number
  baseCostValue?: number
  baseMarketValue?: number
  basePnl?: number
  basePnlPct?: number
  fxRateToMyr?: number
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
  previousClose?: number
  currency: string
}

export interface MalaysiaOverview {
  klci: { price: number; change: number; changePercent: number; name: string }
  opr: { rate: number; change: number; status: string }
  myor: { rate: number; term: string; change: number }
  fx: Array<{ pair: string; currency: string; rate: number; change: number }>
  gold: { name: string; buy: number; sell: number; change: number }
  gainers: Array<{ code: string; name: string; changePercent: number }>
  asOf: string
}

export interface RecentActivityItem {
  id: string
  type: 'buy' | 'sell' | 'deposit' | 'expense' | 'income' | 'transfer'
  title: string
  subtitle: string
  amount: string
  date: string
  timestamp: number
}

export interface PortfolioPerformancePoint {
  date: string
  portfolioReturn: number
  klciReturn: number
}

export interface PortfolioAnalyticsMetrics {
  totalCost: number
  totalMarket: number
  totalReturn: number
  totalReturnPct: number
  annualizedReturn: number
  volatility: number
  maxDrawdown: number
  sharpeRatio: number
  klciReturn: number
  alpha: number
}


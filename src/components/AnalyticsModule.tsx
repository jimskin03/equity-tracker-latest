import { useEffect, useState } from 'react'
import type { PortfolioPerformancePoint } from '../types'
import { useHoldings } from '../hooks/useHoldings'
import { buildPerformanceSeries } from '../api/marketHistory'
import { calculatePortfolioAnalytics } from '../lib/portfolioAnalytics'
import { convertToBase, formatCurrency } from '../lib/fxService'
import { PerformanceChart } from './dashboard/PerformanceChart'

interface AnalyticsModuleProps {
  userId: string
}

export function AnalyticsModule({ userId }: AnalyticsModuleProps) {
  const { holdings } = useHoldings(userId)
  const [series, setSeries] = useState<PortfolioPerformancePoint[]>([])
  const [_isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    setIsLoading(true)

    buildPerformanceSeries(holdings, '1Y')
      .then((pts) => {
        if (active) {
          setSeries(pts)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        console.warn('[AnalyticsModule] series fetch error:', err)
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [holdings])

  const metrics = calculatePortfolioAnalytics(holdings, series, 2.75)

  // Asset allocation by currency
  const currencyMap = new Map<string, number>()
  for (const h of holdings) {
    const val = h.holdings * h.latestPrice
    const cur = h.currency || 'MYR'
    currencyMap.set(cur, (currencyMap.get(cur) || 0) + val)
  }

  return (
    <section className="module-stack" aria-label="Portfolio Analytics">
      <header className="app-header">
        <div>
          <p className="eyebrow">Quantitative Risk & Return</p>
          <h1>Portfolio Analytics</h1>
          <p className="muted header-copy">
            Risk-adjusted performance metrics, volatility modeling, maximum drawdown, and benchmark comparison against the FBM KLCI.
          </p>
        </div>
        <div className="header-badge">
          <span>Risk-free benchmark</span>
          <strong>BNM OPR (2.75%)</strong>
        </div>
      </header>

      {/* Metrics Row */}
      <div className="analytics-metrics-grid">
        <article className="kpi-card">
          <span className="kpi-title">Total Return</span>
          <div className={`kpi-value ${metrics.totalReturn >= 0 ? 'pos' : 'neg'}`}>
            {metrics.totalReturn >= 0 ? '+' : ''}{metrics.totalReturnPct.toFixed(2)}%
          </div>
          <span className="kpi-trend neutral">All-time unrealized</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-title">Annualized Return (CAGR)</span>
          <div className="kpi-value pos">
            +{metrics.annualizedReturn.toFixed(2)}%
          </div>
          <span className="kpi-trend neutral">Compound growth rate</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-title">Sharpe Ratio</span>
          <div className="kpi-value">
            {metrics.sharpeRatio.toFixed(2)}
          </div>
          <span className="kpi-trend pos">
            {metrics.sharpeRatio >= 1.0 ? 'Strong risk-adjusted' : 'Moderate'}
          </span>
        </article>

        <article className="kpi-card">
          <span className="kpi-title">Annualized Volatility</span>
          <div className="kpi-value">
            {metrics.volatility.toFixed(2)}%
          </div>
          <span className="kpi-trend neutral">Std dev of periodic returns</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-title">Maximum Drawdown</span>
          <div className="kpi-value neg">
            {metrics.maxDrawdown.toFixed(2)}%
          </div>
          <span className="kpi-trend neg">Peak-to-trough decline</span>
        </article>

        <article className="kpi-card">
          <span className="kpi-title">FBM KLCI Benchmark Return</span>
          <div className="kpi-value">
            +{metrics.klciReturn.toFixed(2)}%
          </div>
          <span className={`kpi-trend ${metrics.alpha >= 0 ? 'pos' : 'neg'}`}>
            Alpha: {metrics.alpha >= 0 ? '+' : ''}{metrics.alpha.toFixed(2)}%
          </span>
        </article>
      </div>

      {/* Chart Section */}
      <div className="analytics-chart-section">
        <PerformanceChart holdings={holdings} />
      </div>

      {/* Allocation breakdown */}
      <div className="analytics-details-grid">
        <article className="malaysia-panel">
          <h2 className="panel-title">Asset Allocation (Holdings)</h2>
          {holdings.length === 0 ? (
            <p className="muted small">No active holdings recorded. Add positions in the Portfolio tab.</p>
          ) : (
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Weight</th>
                  <th className="num-col">Market Value</th>
                  <th className="num-col">Return</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => {
                  const baseVal = h.baseMarketValue ?? (h.holdings * convertToBase(h.latestPrice, h.currency))
                  const weight = metrics.totalMarket > 0 ? (baseVal / metrics.totalMarket) * 100 : 0
                  const cost = h.holdings * h.costPrice
                  const val = h.holdings * h.latestPrice
                  const pnl = cost > 0 ? ((val - cost) / cost) * 100 : 0
                  return (
                    <tr key={h.id}>
                      <td>
                        <strong>{h.ticker.replace(/\.KL$/i, '')}</strong>
                        <small className="muted" style={{ display: 'block' }}>{h.securityName}</small>
                      </td>
                      <td>{weight.toFixed(1)}%</td>
                      <td className="num-col">
                        <div>{formatCurrency(baseVal, 'MYR')}</div>
                        {h.currency !== 'MYR' && (
                          <small className="muted" style={{ display: 'block', fontSize: '0.75rem' }}>
                            ({formatCurrency(val, h.currency)})
                          </small>
                        )}
                      </td>
                      <td className={`num-col ${pnl >= 0 ? 'pos' : 'neg'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(1)}%
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </article>

        <article className="malaysia-panel">
          <h2 className="panel-title">Risk Assessment Summary</h2>
          <div className="risk-summary-content">
            <div className="risk-item">
              <strong>Beta against KLCI</strong>
              <p className="muted small">
                Measures portfolio sensitivity relative to the Malaysian benchmark. Current beta reflects equity beta adjusted for regional diversification.
              </p>
            </div>
            <div className="risk-item">
              <strong>Benchmark Outperformance (Alpha)</strong>
              <p className="muted small">
                {metrics.alpha >= 0
                  ? `Your portfolio has outperformed the FBM KLCI by +${metrics.alpha.toFixed(2)}% over the measured timeframe.`
                  : `Your portfolio trailed the FBM KLCI by ${metrics.alpha.toFixed(2)}% over the measured timeframe.`}
              </p>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}

import { formatCurrency } from '../lib/fxService'

interface PortfolioSummaryProps {
  count: number
  totalCost: number
  totalMarket: number
  pnl: number
  pnlPct: number
  onRefreshAll: () => void
  isLoading: boolean
}

export function PortfolioSummary({
  count,
  totalCost,
  totalMarket,
  pnl,
  pnlPct,
  onRefreshAll,
  isLoading,
}: PortfolioSummaryProps) {
  const positive = pnl >= 0

  return (
    <section className="summary-grid">
      <article className="stat-card">
        <span className="stat-label">Positions</span>
        <strong className="stat-value">{count}</strong>
      </article>

      <article className="stat-card">
        <span className="stat-label">Total cost</span>
        <strong className="stat-value">{formatCurrency(totalCost, 'MYR')}</strong>
        <span className="stat-hint">Denominated in MYR (BNM FX converted)</span>
      </article>

      <article className="stat-card">
        <span className="stat-label">Market value</span>
        <strong className="stat-value">{formatCurrency(totalMarket, 'MYR')}</strong>
        <span className="stat-hint">Denominated in MYR</span>
      </article>

      <article className="stat-card accent">
        <div className="stat-top">
          <span className="stat-label">Unrealized P/L</span>
          <button
            type="button"
            className="btn small ghost"
            onClick={onRefreshAll}
            disabled={isLoading || count === 0}
          >
            Refresh prices
          </button>
        </div>
        <strong className={`stat-value ${positive ? 'up' : 'down'}`}>
          {positive ? '+' : '-'}{formatCurrency(Math.abs(pnl), 'MYR')}
        </strong>
        <span className={positive ? 'up' : 'down'}>
          {positive ? '+' : ''}
          {pnlPct.toFixed(2)}%
        </span>
      </article>
    </section>
  )
}

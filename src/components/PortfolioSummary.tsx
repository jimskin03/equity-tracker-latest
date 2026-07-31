interface PortfolioSummaryProps {
  count: number
  totalCost: number
  totalMarket: number
  pnl: number
  pnlPct: number
  onRefreshAll: () => void
  isLoading: boolean
}

function formatUsdLike(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
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
        <strong className="stat-value">{formatUsdLike(totalCost)}</strong>
        <span className="stat-hint">Sum of qty × cost (mixed FX shown as raw sum)</span>
      </article>

      <article className="stat-card">
        <span className="stat-label">Market value</span>
        <strong className="stat-value">{formatUsdLike(totalMarket)}</strong>
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
          {formatUsdLike(pnl)}
        </strong>
        <span className={positive ? 'up' : 'down'}>
          {positive ? '+' : ''}
          {pnlPct.toFixed(2)}%
        </span>
      </article>
    </section>
  )
}

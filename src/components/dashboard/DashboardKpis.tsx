interface DashboardKpisProps {
  portfolioValue: number
  totalCost: number
  totalPnl: number
  totalPnlPct: number
  todayChange: number
  todayChangePct: number
  cashBalance: number
}

function formatCurrency(val: number, prefix: string = 'RM '): string {
  const abs = Math.abs(val).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${prefix}${abs}`
}

export function DashboardKpis({
  portfolioValue,
  totalPnl,
  totalPnlPct,
  todayChange,
  todayChangePct,
  cashBalance,
}: DashboardKpisProps) {
  // If no live holdings yet, show reference mock default values
  const displayVal = portfolioValue > 0 ? portfolioValue : 58240.20
  const displayPnl = portfolioValue > 0 ? totalPnl : 4518.20
  const displayPnlPct = portfolioValue > 0 ? totalPnlPct : 8.42
  const displayTodayChange = portfolioValue > 0 ? todayChange : 342.80
  const displayTodayChangePct = portfolioValue > 0 ? todayChangePct : 0.59
  const displayCash = cashBalance > 0 ? cashBalance : 2150.00

  const isTodayPositive = displayTodayChange >= 0
  const isPnlPositive = displayPnl >= 0

  return (
    <section className="kpi-grid" aria-label="Portfolio and financial summary">
      {/* 1. Portfolio Value */}
      <article className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-title">Portfolio Value</span>
          <span className="kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
              <path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
              <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
            </svg>
          </span>
        </div>
        <div className="kpi-value">{formatCurrency(displayVal)}</div>
        <div className={`kpi-trend ${isPnlPositive ? 'pos' : 'neg'}`}>
          <span className="trend-arrow">{isPnlPositive ? '?' : '?'}</span>
          <span>
            {isPnlPositive ? '+' : ''}{displayPnlPct.toFixed(2)}% ({isPnlPositive ? '+RM ' : '-RM '}{Math.abs(displayPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
          </span>
        </div>
      </article>

      {/* 2. Today's Change */}
      <article className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-title">Today's Change</span>
          <span className="kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
              <polyline points="17 6 23 6 23 12" />
            </svg>
          </span>
        </div>
        <div className={`kpi-value ${isTodayPositive ? 'pos' : 'neg'}`}>
          {isTodayPositive ? '+RM ' : '-RM '}{Math.abs(displayTodayChange).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div className={`kpi-trend ${isTodayPositive ? 'pos' : 'neg'}`}>
          <span>{isTodayPositive ? '+' : ''}{displayTodayChangePct.toFixed(2)}%</span>
        </div>
      </article>

      {/* 3. Total Return */}
      <article className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-title">Total Return</span>
          <span className="kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
            </svg>
          </span>
        </div>
        <div className={`kpi-value ${isPnlPositive ? 'pos' : 'neg'}`}>
          {isPnlPositive ? '+' : ''}{displayPnlPct.toFixed(2)}%
        </div>
        <div className={`kpi-trend ${isPnlPositive ? 'pos' : 'neg'}`}>
          <span>({isPnlPositive ? '+RM ' : '-RM '}{Math.abs(displayPnl).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
        </div>
      </article>

      {/* 4. Cash Balance */}
      <article className="kpi-card">
        <div className="kpi-header">
          <span className="kpi-title">Cash Balance</span>
          <span className="kpi-icon-badge" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
          </span>
        </div>
        <div className="kpi-value">{formatCurrency(displayCash)}</div>
        <div className="kpi-trend neutral">
          <span>Expense ledger posted</span>
        </div>
      </article>
    </section>
  )
}

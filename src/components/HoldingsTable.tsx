import type { Holding } from '../types'

interface HoldingsTableProps {
  holdings: Holding[]
  editingId: string | null
  onEdit: (holding: Holding) => void
  onDelete: (id: string) => void
  onRefreshRow: (holding: Holding) => void
  isLoading: boolean
}

function formatMoney(value: number, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value)
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function HoldingsTable({
  holdings,
  editingId,
  onEdit,
  onDelete,
  onRefreshRow,
  isLoading,
}: HoldingsTableProps) {
  if (holdings.length === 0) {
    return (
      <div className="card empty-state">
        <h3>No holdings yet</h3>
        <p className="muted">Add an ISIN above to start tracking your equity portfolio.</p>
      </div>
    )
  }

  return (
    <div className="card table-card">
      <div className="card-header">
        <div>
          <h2>Holdings</h2>
          <p className="muted">Edit quantities and cost, or refresh market prices.</p>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Security</th>
              <th>ISIN</th>
              <th>Qty</th>
              <th>Cost</th>
              <th>Latest</th>
              <th>Market value</th>
              <th>P/L</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((holding) => {
              const costValue = holding.holdings * holding.costPrice
              const marketValue = holding.holdings * holding.latestPrice
              const pnl = marketValue - costValue
              const pnlPct = costValue > 0 ? (pnl / costValue) * 100 : 0
              const positive = pnl >= 0

              return (
                <tr key={holding.id} className={editingId === holding.id ? 'row-editing' : undefined}>
                  <td>
                    <div className="security-cell">
                      <strong>{holding.securityName}</strong>
                      <span className="muted">{holding.ticker}</span>
                    </div>
                  </td>
                  <td>
                    <code>{holding.isin || holding.figi || '—'}</code>
                  </td>
                  <td>{formatNumber(holding.holdings)}</td>
                  <td>{formatMoney(holding.costPrice, holding.currency)}</td>
                  <td>
                    {holding.latestPrice > 0
                      ? formatMoney(holding.latestPrice, holding.currency)
                      : '—'}
                  </td>
                  <td>{formatMoney(marketValue, holding.currency)}</td>
                  <td>
                    <span className={positive ? 'pnl up' : 'pnl down'}>
                      {formatMoney(pnl, holding.currency)}
                      <small>
                        {positive ? '+' : ''}
                        {pnlPct.toFixed(2)}%
                      </small>
                    </span>
                  </td>
                  <td className="muted nowrap">{formatDate(holding.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => onEdit(holding)}
                        disabled={isLoading}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn small ghost"
                        onClick={() => onRefreshRow(holding)}
                        disabled={isLoading}
                        title="Refresh latest price"
                      >
                        Refresh
                      </button>
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => {
                          if (window.confirm(`Delete ${holding.securityName}?`)) {
                            onDelete(holding.id)
                          }
                        }}
                        disabled={isLoading}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

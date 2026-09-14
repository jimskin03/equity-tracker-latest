import type { Holding } from '../../types'
import { convertToBase, formatCurrency } from '../../lib/fxService'

interface TopHoldingsProps {
  holdings: Holding[]
  onViewAll: () => void
}

interface DisplayHoldingRow {
  symbol: string
  company: string
  price: string
  qty: string
  value: string
  returnPct: number
}

const MOCK_HOLDINGS_ROWS: DisplayHoldingRow[] = [
  { symbol: '1155', company: 'Maybank', price: 'RM 9.74', qty: '1,000', value: 'RM 9,740', returnPct: 12.4 },
  { symbol: '1023', company: 'CIMB', price: 'RM 6.52', qty: '800', value: 'RM 5,216', returnPct: 8.1 },
  { symbol: '1295', company: 'Public Bank', price: 'RM 4.38', qty: '1,500', value: 'RM 6,570', returnPct: -3.2 },
  { symbol: '5347', company: 'Tenaga Nasional', price: 'RM 13.08', qty: '400', value: 'RM 5,232', returnPct: 6.7 },
  { symbol: 'AAPL', company: 'Apple Inc.', price: 'US$ 226.21', qty: '10', value: 'RM 10,320', returnPct: 15.3 },
]

export function TopHoldings({ holdings, onViewAll }: TopHoldingsProps) {
  const displayRows: DisplayHoldingRow[] =
    holdings.length > 0
      ? holdings.slice(0, 5).map((h) => {
          const cleanSymbol = h.ticker.replace(/\.KL$/i, '')
          const totalVal = h.holdings * h.latestPrice
          const totalBaseVal = h.baseMarketValue ?? (h.holdings * convertToBase(h.latestPrice, h.currency))
          const totalCost = h.holdings * h.costPrice
          const pnlPct = totalCost > 0 ? ((totalVal - totalCost) / totalCost) * 100 : 0

          return {
            symbol: cleanSymbol,
            company: h.securityName,
            price: formatCurrency(h.latestPrice, h.currency),
            qty: Number(h.holdings).toLocaleString(),
            value: formatCurrency(totalBaseVal, 'MYR'),
            returnPct: Number(pnlPct.toFixed(1)),
          }
        })
      : MOCK_HOLDINGS_ROWS

  return (
    <article className="bottom-card top-holdings-card">
      <div className="card-top-bar">
        <h2 className="card-title">Top Holdings</h2>
        <button type="button" className="view-link" onClick={onViewAll}>
          View All &rarr;
        </button>
      </div>

      <div className="table-responsive">
        <table className="dashboard-table">
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Company</th>
              <th className="num-col">Price</th>
              <th className="num-col">Qty</th>
              <th className="num-col">Value</th>
              <th className="num-col">Return</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, idx) => {
              const isPos = row.returnPct >= 0
              return (
                <tr key={`${row.symbol}-${idx}`}>
                  <td>
                    <strong className="symbol-cell">{row.symbol}</strong>
                  </td>
                  <td className="company-cell" title={row.company}>
                    {row.company}
                  </td>
                  <td className="num-col price-cell">{row.price}</td>
                  <td className="num-col qty-cell">{row.qty}</td>
                  <td className="num-col value-cell">{row.value}</td>
                  <td className={`num-col return-cell ${isPos ? 'pos' : 'neg'}`}>
                    {isPos ? '+' : ''}{row.returnPct.toFixed(1)}%
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </article>
  )
}

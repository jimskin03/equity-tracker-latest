import { useEffect, useState } from 'react'
import type { MalaysiaOverview } from '../types'
import { fetchMalaysiaOverview } from '../api/malaysia'

interface MalaysiaModuleProps {
  onNavigateToPortfolio: () => void
}

export function MalaysiaModule({ onNavigateToPortfolio }: MalaysiaModuleProps) {
  const [data, setData] = useState<MalaysiaOverview | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    setIsLoading(true)
    fetchMalaysiaOverview()
      .then((res) => {
        if (active) {
          setData(res)
          setIsLoading(false)
        }
      })
      .catch((err) => {
        console.warn('[MalaysiaModule] failed to fetch overview:', err)
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [])

  if (isLoading || !data) {
    return <section className="module-stack"><div className="loading-indicator">Loading Bank Negara Malaysia & Bursa data...</div></section>
  }

  const { klci, opr, myor, fx, gold, gainers } = data

  return (
    <section className="module-stack" aria-label="Malaysia Macro & Bursa">
      <header className="app-header">
        <div>
          <p className="eyebrow">Macroeconomic & Exchange Data</p>
          <h1>Bank Negara Malaysia & Bursa Malaysia</h1>
          <p className="muted header-copy">
            Official monetary policy rates, interbank benchmark rates (MYOR), exchange board, Kijang Emas gold, and Bursa securities.
          </p>
        </div>
        <div className="header-badge">
          <span>Source</span>
          <strong>BNM Open API + Yahoo</strong>
        </div>
      </header>

      <div className="malaysia-page-grid">
        {/* Row 1: Macro Cards */}
        <div className="macro-cards-row">
          <article className="macro-tile">
            <span className="macro-tile-label muted">FTSE Bursa Malaysia KLCI</span>
            <div className="macro-tile-val">{klci.price.toFixed(2)}</div>
            <span className={`macro-tile-trend ${klci.change >= 0 ? 'pos' : 'neg'}`}>
              {klci.change >= 0 ? '+' : ''}{klci.change.toFixed(2)} ({klci.changePercent.toFixed(2)}%)
            </span>
          </article>

          <article className="macro-tile">
            <span className="macro-tile-label muted">Overnight Policy Rate (OPR)</span>
            <div className="macro-tile-val">{opr.rate.toFixed(2)}%</div>
            <span className="macro-tile-sub muted">Status: {opr.status}</span>
          </article>

          <article className="macro-tile">
            <span className="macro-tile-label muted">MYOR Benchmark (3-Month)</span>
            <div className="macro-tile-val">{myor.rate.toFixed(2)}%</div>
            <span className={`macro-tile-trend ${myor.change >= 0 ? 'pos' : 'neg'}`}>
              {myor.change >= 0 ? '+' : ''}{myor.change.toFixed(2)}%
            </span>
          </article>

          <article className="macro-tile">
            <span className="macro-tile-label muted">{gold.name}</span>
            <div className="macro-tile-val">RM {gold.buy.toFixed(2)}</div>
            <span className="macro-tile-sub muted">Sell: RM {gold.sell.toFixed(2)} (+{gold.change.toFixed(2)})</span>
          </article>
        </div>

        {/* Row 2: FX Board and Bursa Gainers */}
        <div className="malaysia-split-row">
          {/* FX Board */}
          <article className="malaysia-panel">
            <h2 className="panel-title">BNM Official Exchange Rates (vs MYR)</h2>
            <div className="fx-full-table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Currency Pair</th>
                    <th className="num-col">Middle Rate</th>
                    <th className="num-col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {fx.map((row) => {
                    const isPos = row.change >= 0
                    return (
                      <tr key={row.pair}>
                        <td><strong>{row.pair}</strong></td>
                        <td className="num-col">{row.rate.toFixed(4)}</td>
                        <td className={`num-col ${isPos ? 'pos' : 'neg'}`}>
                          {isPos ? '+' : ''}{row.change.toFixed(4)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </article>

          {/* Bursa Gainers & Action */}
          <article className="malaysia-panel">
            <h2 className="panel-title">Top Bursa Movers & Shortcuts</h2>
            <div className="gainers-table-wrapper">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Security Name</th>
                    <th className="num-col">Day Change</th>
                  </tr>
                </thead>
                <tbody>
                  {gainers.map((stk) => (
                    <tr key={stk.code}>
                      <td><strong>{stk.code}</strong></td>
                      <td>{stk.name}</td>
                      <td className="num-col pos">+{stk.changePercent.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bursa-action-box">
              <p className="muted small">
                Add any Bursa stock using its 4-digit code (e.g. <code>1155</code> for Maybank, <code>1023</code> for CIMB).
              </p>
              <button
                type="button"
                className="btn small primary"
                onClick={onNavigateToPortfolio}
              >
                Go to Portfolio
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

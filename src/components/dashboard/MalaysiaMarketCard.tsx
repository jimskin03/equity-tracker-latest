import type { MalaysiaOverview } from '../../types'

interface MalaysiaMarketCardProps {
  overview: MalaysiaOverview
  onViewMore: () => void
}

export function MalaysiaMarketCard({ overview, onViewMore }: MalaysiaMarketCardProps) {
  const { klci, opr, myor, fx, gold, gainers } = overview

  const isKlciPositive = klci.change >= 0

  return (
    <article className="malaysia-card">
      <div className="card-top-bar">
        <div className="card-top-left">
          <h2 className="card-title">Malaysia Market</h2>
        </div>
        <button type="button" className="view-link" onClick={onViewMore}>
          View More &rarr;
        </button>
      </div>

      <div className="malaysia-grid">
        {/* Left Column: KLCI, Rates, FX */}
        <div className="malaysia-col left-col">
          {/* FBM KLCI */}
          <div className="klci-row">
            <div className="klci-title">
              <span className="my-flag" role="img" aria-label="Malaysia flag">????</span>
              <strong>FBM KLCI</strong>
            </div>
            <div className="klci-val-box">
              <span className="klci-price">{klci.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`klci-change ${isKlciPositive ? 'pos' : 'neg'}`}>
                {isKlciPositive ? '+' : ''}{klci.change.toFixed(2)} ({isKlciPositive ? '+' : ''}{klci.changePercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          {/* OPR */}
          <div className="macro-row">
            <div className="macro-label">
              <span className="macro-icon">??</span>
              <div>
                <strong>OPR</strong>
                <small className="muted"> (Overnight Policy Rate)</small>
              </div>
            </div>
            <div className="macro-val">
              <strong className="rate-num">{opr.rate.toFixed(2)}%</strong>
              <small className="rate-status muted">({opr.status})</small>
            </div>
          </div>

          {/* MYOR */}
          <div className="macro-row">
            <div className="macro-label">
              <span className="macro-icon">??</span>
              <div>
                <strong>MYOR</strong>
                <small className="muted"> (3-Month)</small>
              </div>
            </div>
            <div className="macro-val">
              <strong className="rate-num">{myor.rate.toFixed(2)}%</strong>
              <small className={`rate-change ${myor.change >= 0 ? 'pos' : 'neg'}`}>
                {myor.change >= 0 ? '+' : ''}{myor.change.toFixed(2)}%
              </small>
            </div>
          </div>

          {/* FX Rates vs MYR */}
          <div className="fx-section">
            <div className="section-label muted">FX Rates (vs MYR)</div>
            <div className="fx-list">
              {fx.map((item) => {
                const isPos = item.change >= 0
                return (
                  <div key={item.pair} className="fx-row">
                    <span className="fx-pair">{item.pair}</span>
                    <div className="fx-nums">
                      <span className="fx-rate">{item.rate.toFixed(4)}</span>
                      <span className={`fx-change ${isPos ? 'pos' : 'neg'}`}>
                        {isPos ? '+' : ''}{item.change.toFixed(4)}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Kijang Emas Gold & Top Gainers */}
        <div className="malaysia-col right-col">
          {/* Kijang Emas */}
          <div className="gold-card">
            <div className="gold-icon-title">
              <span className="gold-bar-icon">??</span>
              <div>
                <strong>{gold.name}</strong>
              </div>
            </div>
            <div className="gold-prices">
              <div className="gold-row">
                <span className="muted">Buy</span>
                <strong>RM {gold.buy.toFixed(2)}</strong>
                <span className="pos gold-change">+{gold.change.toFixed(2)}</span>
              </div>
              <div className="gold-row">
                <span className="muted">Sell</span>
                <strong>RM {gold.sell.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {/* Top Gainers Bursa */}
          <div className="gainers-section">
            <div className="section-label muted">Top Gainers (Bursa)</div>
            <div className="gainers-list">
              {gainers.map((stock) => (
                <div key={stock.code} className="gainer-row">
                  <span className="stock-code">{stock.code}</span>
                  <span className="stock-name">{stock.name}</span>
                  <span className="pos stock-pct">+{stock.changePercent.toFixed(2)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}

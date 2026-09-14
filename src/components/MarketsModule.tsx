import { useEffect, useState } from 'react'

interface MarketIndexItem {
  symbol: string
  name: string
  region: string
  price: number
  change: number
  changePercent: number
}

const DEFAULT_INDICES: MarketIndexItem[] = [
  { symbol: '^KLSE', name: 'FTSE Bursa Malaysia KLCI', region: 'Malaysia', price: 1628.54, change: 12.36, changePercent: 0.76 },
  { symbol: '^GSPC', name: 'S&P 500', region: 'US', price: 5626.02, change: 24.15, changePercent: 0.43 },
  { symbol: '^IXIC', name: 'Nasdaq Composite', region: 'US', price: 17683.98, change: 114.28, changePercent: 0.65 },
  { symbol: '^DJI', name: 'Dow Jones Industrial', region: 'US', price: 40834.97, change: -12.44, changePercent: -0.03 },
  { symbol: '^FTSE', name: 'FTSE 100', region: 'Europe', price: 8273.09, change: 18.22, changePercent: 0.22 },
  { symbol: '^N225', name: 'Nikkei 225', region: 'Japan', price: 36581.76, change: -251.51, changePercent: -0.68 },
  { symbol: '^HSI', name: 'Hang Seng Index', region: 'Hong Kong', price: 17422.12, change: 53.18, changePercent: 0.31 },
  { symbol: '^STI', name: 'Straits Times Index', region: 'Singapore', price: 3512.67, change: 8.44, changePercent: 0.24 },
]

export function MarketsModule() {
  const [indices, setIndices] = useState<MarketIndexItem[]>(DEFAULT_INDICES)
  const [isLoading, setIsLoading] = useState(false)
  const [lastRefreshed, setLastRefreshed] = useState<string>(new Date().toLocaleTimeString())

  const refreshMarkets = async () => {
    setIsLoading(true)
    try {
      const updated = await Promise.all(
        indices.map(async (item) => {
          try {
            const res = await fetch(`/api/yahoo/v8/finance/chart/${encodeURIComponent(item.symbol)}?interval=1d&range=2d`)
            if (!res.ok) return item
            const json = await res.json()
            const meta = json?.chart?.result?.[0]?.meta
            if (!meta) return item

            const price = meta.regularMarketPrice ?? item.price
            const prev = meta.chartPreviousClose ?? meta.previousClose ?? price
            const change = Number((price - prev).toFixed(2))
            const changePercent = Number(((change / (prev || 1)) * 100).toFixed(2))

            return {
              ...item,
              price,
              change,
              changePercent,
            }
          } catch {
            return item
          }
        })
      )
      setIndices(updated)
      setLastRefreshed(new Date().toLocaleTimeString())
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void refreshMarkets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <section className="module-stack" aria-label="Global Markets">
      <header className="app-header">
        <div>
          <p className="eyebrow">Global and Regional Benchmarks</p>
          <h1>Markets Overview</h1>
          <p className="muted header-copy">
            Live quotes for Asian, US, and European major indices with currency and commodity reference data.
          </p>
        </div>
        <div className="header-badge">
          <span>Refreshed: {lastRefreshed}</span>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => void refreshMarkets()}
            disabled={isLoading}
          >
            {isLoading ? 'Refreshing�' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="markets-grid">
        {indices.map((item) => {
          const isPos = item.change >= 0
          return (
            <article key={item.symbol} className="market-card">
              <div className="market-card-top">
                <span className="market-region-tag muted">{item.region}</span>
                <span className="market-symbol muted">{item.symbol}</span>
              </div>
              <strong className="market-name">{item.name}</strong>
              <div className="market-price-row">
                <span className="market-price-val">
                  {item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className={`market-change-badge ${isPos ? 'pos' : 'neg'}`}>
                  {isPos ? '+' : ''}{item.change.toFixed(2)} ({isPos ? '+' : ''}{item.changePercent.toFixed(2)}%)
                </span>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

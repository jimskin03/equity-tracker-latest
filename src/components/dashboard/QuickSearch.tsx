import { useState } from 'react'
import { lookupSecurity } from '../../api/marketData'
import { formatCurrency, convertToBase } from '../../lib/fxService'
import type { SecurityLookupResult } from '../../types'

interface QuickSearchProps {
  onSelectSecurity?: (security: SecurityLookupResult) => void
  onNavigateToPortfolio: () => void
}

const POPULAR_MALAYSIAN = ['1155', '1023', '1295', '5347', '5211']
const POPULAR_GLOBAL = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN']

export function QuickSearch({ onSelectSecurity, onNavigateToPortfolio }: QuickSearchProps) {
  const [query, setQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<SecurityLookupResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)

  const handleSearch = async (searchTerm: string) => {
    const term = searchTerm.trim()
    if (!term) return

    setQuery(term)
    setIsLoading(true)
    setSearchError(null)
    setResult(null)

    try {
      const res = await lookupSecurity(term)
      setResult(res)
      if (onSelectSecurity) {
        onSelectSecurity(res)
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Security not found')
    } finally {
      setIsLoading(false)
    }
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void handleSearch(query)
  }

  return (
    <article className="bottom-card quick-search-card">
      <div className="card-top-bar">
        <h2 className="card-title">Quick Search</h2>
      </div>

      <form className="quick-search-form" onSubmit={onSubmit}>
        <div className="quick-search-input-wrapper">
          <input
            type="text"
            className="quick-search-input"
            placeholder="Search stocks, indices, or ETFs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="search-icon-btn" aria-label="Search" disabled={isLoading}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </form>

      {isLoading && <div className="quick-search-status muted">Looking up security...</div>}
      {searchError && <div className="quick-search-error">{searchError}</div>}

      {result && (
        <div className="quick-search-result">
          <div className="result-info">
            <strong>{result.ticker}</strong>
            <span className="result-name muted">{result.securityName}</span>
          </div>
          <div className="result-actions">
            <div className="result-price-box" style={{ textAlign: 'right' }}>
              <span className="result-price">
                {formatCurrency(result.latestPrice, result.currency)}
              </span>
              {(result.currency || 'MYR').toUpperCase() !== 'MYR' && (
                <small className="muted" style={{ display: 'block', fontSize: '0.78rem' }}>
                  ≈ {formatCurrency(convertToBase(result.latestPrice, result.currency), 'MYR')}
                </small>
              )}
            </div>
            <button
              type="button"
              className="btn small primary"
              onClick={() => onNavigateToPortfolio()}
            >
              Add to Portfolio
            </button>
          </div>
        </div>
      )}

      <div className="popular-section">
        <div className="popular-label muted">Popular Malaysian Stocks</div>
        <div className="popular-pills">
          {POPULAR_MALAYSIAN.map((code) => (
            <button
              key={code}
              type="button"
              className="stock-pill"
              onClick={() => void handleSearch(code)}
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      <div className="popular-section">
        <div className="popular-label muted">Popular Global Stocks</div>
        <div className="popular-pills">
          {POPULAR_GLOBAL.map((ticker) => (
            <button
              key={ticker}
              type="button"
              className="stock-pill"
              onClick={() => void handleSearch(ticker)}
            >
              {ticker}
            </button>
          ))}
        </div>
      </div>
    </article>
  )
}

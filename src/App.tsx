import { useState } from 'react'
import { HoldingForm } from './components/HoldingForm'
import { HoldingsTable } from './components/HoldingsTable'
import { PortfolioSummary } from './components/PortfolioSummary'
import { useHoldings } from './hooks/useHoldings'
import type { Holding, HoldingFormData } from './types'
import './App.css'

function App() {
  const {
    holdings,
    isLoading,
    error,
    status,
    summary,
    addHolding,
    updateHolding,
    deleteHolding,
    refreshAllPrices,
    clearMessages,
  } = useHoldings()

  const [editing, setEditing] = useState<Holding | null>(null)

  const handleCreate = async (data: HoldingFormData) => {
    await addHolding(data.isin, Number(data.holdings), Number(data.costPrice))
  }

  const handleUpdate = async (data: HoldingFormData) => {
    if (!editing) return

    await updateHolding(
      editing.id,
      {
        isin: data.isin,
        holdings: Number(data.holdings),
        costPrice: Number(data.costPrice),
      },
      { refreshMarketData: data.isin.trim().toUpperCase() !== editing.isin },
    )

    setEditing(null)
  }

  const handleRefreshRow = async (holding: Holding) => {
    await updateHolding(
      holding.id,
      {
        isin: holding.isin,
        holdings: holding.holdings,
        costPrice: holding.costPrice,
      },
      { refreshMarketData: true },
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Portfolio</p>
          <h1>Equity Tracker</h1>
          <p className="muted header-copy">
            Track holdings by ISIN. Security names come from OpenFIGI; latest prices from Yahoo
            Finance. Data is saved in your browser.
          </p>
        </div>
        <div className="header-badge">
          <span>Free APIs</span>
          <strong>OpenFIGI + Yahoo</strong>
        </div>
      </header>

      {(error || status) && (
        <div className={`banner ${error ? 'error' : 'success'}`} role="status">
          <span>{error || status}</span>
          <button type="button" className="banner-close" onClick={clearMessages} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <PortfolioSummary
        count={summary.count}
        totalCost={summary.totalCost}
        totalMarket={summary.totalMarket}
        pnl={summary.pnl}
        pnlPct={summary.pnlPct}
        onRefreshAll={refreshAllPrices}
        isLoading={isLoading}
      />

      {editing ? (
        <HoldingForm
          mode="edit"
          initial={editing}
          isLoading={isLoading}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <HoldingForm mode="create" isLoading={isLoading} onSubmit={handleCreate} />
      )}

      <HoldingsTable
        holdings={holdings}
        editingId={editing?.id ?? null}
        onEdit={setEditing}
        onDelete={deleteHolding}
        onRefreshRow={handleRefreshRow}
        isLoading={isLoading}
      />

      <footer className="app-footer muted">
        <p>
          ISIN mapping via{' '}
          <a href="https://www.openfigi.com/api" target="_blank" rel="noreferrer">
            OpenFIGI
          </a>
          . Market prices via Yahoo Finance chart API (no key). Records persist in localStorage.
        </p>
      </footer>
    </div>
  )
}

export default App

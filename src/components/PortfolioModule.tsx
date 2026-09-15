import { useState } from 'react'
import { HoldingForm } from './HoldingForm'
import { HoldingsTable } from './HoldingsTable'
import { PortfolioSummary } from './PortfolioSummary'
import { useHoldings } from '../hooks/useHoldings'
import type { Holding, HoldingFormData } from '../types'

interface PortfolioModuleProps {
  userId: string
  holdingsHook?: ReturnType<typeof useHoldings>
}

export function PortfolioModule({ userId, holdingsHook }: PortfolioModuleProps) {
  const fallbackHook = useHoldings(userId)
  const { holdings, isLoading, error, status, summary, addHolding, updateHolding, deleteHolding, refreshAllPrices, clearMessages } = holdingsHook || fallbackHook
  const [editing, setEditing] = useState<Holding | null>(null)

  const handleCreate = async (data: HoldingFormData) => addHolding(data.isin, Number(data.holdings), Number(data.costPrice)).then(() => undefined)
  const handleUpdate = async (data: HoldingFormData) => {
    if (!editing) return
    await updateHolding(editing.id, { isin: data.isin, holdings: Number(data.holdings), costPrice: Number(data.costPrice) }, { refreshMarketData: data.isin.trim().toUpperCase() !== editing.isin })
    setEditing(null)
  }
  const handleRefreshRow = async (holding: Holding) => {
    await updateHolding(holding.id, { isin: holding.isin, holdings: holding.holdings, costPrice: holding.costPrice }, { refreshMarketData: true })
  }

  return (
    <section className="portfolio-stack">
      <header className="app-header">
        <div><p className="eyebrow">Portfolio</p><h1>Equity Tracker</h1><p className="muted header-copy">Discover instruments by ticker, name, or ISIN. OpenFIGI supplies identifiers and Yahoo Finance supplies current prices.</p></div>
        <div className="header-badge"><span>Storage</span><strong>Supabase + RLS</strong></div>
      </header>
      {(error || status) && <div className={`banner ${error ? 'error' : 'success'}`} role="status"><span>{error || status}</span><button type="button" className="banner-close" onClick={clearMessages} aria-label="Dismiss">×</button></div>}
      <PortfolioSummary {...summary} onRefreshAll={refreshAllPrices} isLoading={isLoading} />
      {editing ? <HoldingForm key={editing.id} mode="edit" initial={editing} isLoading={isLoading} onSubmit={handleUpdate} onCancel={() => setEditing(null)} /> : <HoldingForm key="create" mode="create" isLoading={isLoading} onSubmit={handleCreate} />}
      <HoldingsTable holdings={holdings} editingId={editing?.id ?? null} onEdit={setEditing} onDelete={(id) => void deleteHolding(id)} onRefreshRow={(holding) => void handleRefreshRow(holding)} isLoading={isLoading} />
      <footer className="app-footer muted">Portfolio records are account-scoped under the same CryptGreg Supabase Auth user. The original browser payload is retained locally as a rollback copy after migration.</footer>
    </section>
  )
}

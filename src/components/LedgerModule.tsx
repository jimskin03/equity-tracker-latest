interface LedgerModuleProps { userId: string }

export function LedgerModule({ userId }: LedgerModuleProps) {
  return (
    <section className="module-frame-card">
      <div className="module-intro">
        <div><p className="eyebrow">Ledger</p><h1>Income and expense ledger</h1><p className="muted">The existing ledger UI and data contract are preserved inside the unified workspace.</p></div>
        <span className="preserved-badge">Canonical ledger preserved</span>
      </div>
      <iframe key={userId} className="ledger-frame" src="/ledger/index.html" title="CryptGreg expense ledger" />
    </section>
  )
}

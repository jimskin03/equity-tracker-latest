interface DashboardProps {
  email: string
  onNavigate: (view: 'ledger' | 'portfolio') => void
}
export function Dashboard({ email, onNavigate }: DashboardProps) {
  return (
    <section className="dashboard-stack">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Finance workspace</p>
          <h1>Welcome back</h1>
          <p className="muted">{email}</p>
        </div>
        <div className="session-chip"><span className="session-dot" />Shared session active</div>
      </header>
      <div className="module-grid">
        <article className="module-card ledger-module-card">
          <p className="eyebrow">Cash flow</p><h2>Ledger</h2>
          <p>Income, expenses, recurring payments, receipts, transfers, reversals, and the complete account-scoped audit trail.</p>
          <button className="btn primary" type="button" onClick={() => onNavigate('ledger')}>Open Ledger</button>
        </article>
        <article className="module-card portfolio-module-card">
          <p className="eyebrow">Investments</p><h2>Portfolio</h2>
          <p>Supabase-synced holdings with ISIN lookup, current market prices, cost basis, and unrealized performance.</p>
          <button className="btn primary" type="button" onClick={() => onNavigate('portfolio')}>Open Portfolio</button>
        </article>
      </div>
      <aside className="card architecture-note">
        <strong>One identity, separated financial domains</strong>
        <span className="muted">Ledger and Portfolio share your Supabase Auth user while each service keeps its own account-scoped schema and row-level security policies.</span>
      </aside>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { AuthGate } from './components/AuthGate'
import { Dashboard } from './components/Dashboard'
import { LedgerModule } from './components/LedgerModule'
import { PortfolioModule } from './components/PortfolioModule'
import { MarketsModule } from './components/MarketsModule'
import { MalaysiaModule } from './components/MalaysiaModule'
import { AnalyticsModule } from './components/AnalyticsModule'
import { useAuth } from './hooks/useAuth'
import './App.css'

type View = 'dashboard' | 'ledger' | 'portfolio' | 'markets' | 'malaysia' | 'analytics'

const NAV_ITEMS: Array<{ id: View; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'ledger', label: 'Ledger', icon: '≋' },
  { id: 'portfolio', label: 'Portfolio', icon: '↗' },
  { id: 'markets', label: 'Markets', icon: 'ılı' },
  { id: 'malaysia', label: 'Malaysia', icon: '🇲🇾' },
  { id: 'analytics', label: 'Analytics', icon: '◷' },
]

function viewFromHash(): View {
  const value = window.location.hash.replace(/^#\/?/, '').toLowerCase() as View
  const valid: View[] = ['dashboard', 'ledger', 'portfolio', 'markets', 'malaysia', 'analytics']
  return valid.includes(value) ? value : 'dashboard'
}

function App() {
  const { session, isLoading, error, signIn, signOut } = useAuth()
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (next: View) => {
    window.location.hash = next === 'dashboard' ? '' : `/${next}`
    setView(next)
  }

  if (!session) {
    return <main className="app-shell signed-out-shell"><AuthGate isLoading={isLoading} error={error} onSignIn={signIn} /></main>
  }

  return (
    <div className="workspace-shell">
      <aside className="workspace-sidebar">
        <button className="brand-button" type="button" onClick={() => navigate('dashboard')}>
          <span className="brand-mark">CG</span>
          <span><strong>CryptGreg</strong><small>Finance</small></span>
        </button>
        <nav aria-label="Finance modules">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={view === item.id ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          <span className="muted">Signed in</span>
          <strong title={session.user.email}>{session.user.email || 'CryptGreg user'}</strong>
          <button className="btn small ghost" type="button" onClick={() => void signOut()}>Sign out</button>
        </div>
      </aside>
      <main className="workspace-main">
        {error && <div className="banner error auth-error">{error}</div>}
        {view === 'dashboard' && (
          <Dashboard
            email={session.user.email || 'CryptGreg user'}
            userId={session.user.id}
            onNavigate={(next) => navigate(next)}
          />
        )}
        {view === 'ledger' && <LedgerModule userId={session.user.id} />}
        {view === 'portfolio' && <PortfolioModule userId={session.user.id} />}
        {view === 'markets' && <MarketsModule />}
        {view === 'malaysia' && (
          <MalaysiaModule onNavigateToPortfolio={() => navigate('portfolio')} />
        )}
        {view === 'analytics' && <AnalyticsModule userId={session.user.id} />}
      </main>
    </div>
  )
}

export default App

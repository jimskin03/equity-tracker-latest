import { useEffect, useState } from 'react'
import { AuthGate } from './components/AuthGate'
import { Dashboard } from './components/Dashboard'
import { LedgerModule } from './components/LedgerModule'
import { PortfolioModule } from './components/PortfolioModule'
import { useAuth } from './hooks/useAuth'
import './App.css'

type View = 'dashboard' | 'ledger' | 'portfolio'

function viewFromHash(): View {
  const value = window.location.hash.replace(/^#\/?/, '')
  return value === 'ledger' || value === 'portfolio' ? value : 'dashboard'
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
          {(['dashboard', 'ledger', 'portfolio'] as const).map((item) => (
            <button key={item} type="button" className={view === item ? 'nav-item active' : 'nav-item'} onClick={() => navigate(item)}>
              <span className="nav-icon">{item === 'dashboard' ? '⌂' : item === 'ledger' ? '≋' : '↗'}</span>
              {item[0].toUpperCase() + item.slice(1)}
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
        {view === 'dashboard' && <Dashboard email={session.user.email || 'CryptGreg user'} onNavigate={(next) => navigate(next)} />}
        {view === 'ledger' && <LedgerModule userId={session.user.id} />}
        {view === 'portfolio' && <PortfolioModule userId={session.user.id} />}
      </main>
    </div>
  )
}

export default App

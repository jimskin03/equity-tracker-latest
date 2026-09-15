import { useEffect, useMemo, useState } from 'react'
import { AuthGate } from './components/AuthGate'
import { Dashboard } from './components/Dashboard'
import { LedgerModule } from './components/LedgerModule'
import { PortfolioModule } from './components/PortfolioModule'
import { MarketsModule } from './components/MarketsModule'
import { MalaysiaModule } from './components/MalaysiaModule'
import { AnalyticsModule } from './components/AnalyticsModule'
import { SettingsModule } from './components/SettingsModule'
import { ChangePasswordModal } from './components/ChangePasswordModal'
import { AgentCopilot } from './components/agent/AgentCopilot'
import { useAuth } from './hooks/useAuth'
import { useHoldings } from './hooks/useHoldings'
import { useCashBalance } from './hooks/useCashBalance'
import { useRecentActivity } from './hooks/useRecentActivity'
import type { PortalContext } from './lib/agent/agentService'
import './App.css'

type View = 'dashboard' | 'ledger' | 'portfolio' | 'markets' | 'malaysia' | 'analytics' | 'settings'

const NAV_ITEMS: Array<{ id: View; label: string; icon: string }> = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'ledger', label: 'Ledger', icon: '≋' },
  { id: 'portfolio', label: 'Portfolio', icon: '↗' },
  { id: 'markets', label: 'Markets', icon: 'ılı' },
  { id: 'malaysia', label: 'Malaysia', icon: '🇲🇾' },
  { id: 'analytics', label: 'Analytics', icon: '◷' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

function viewFromHash(): View {
  const value = window.location.hash.replace(/^#\/?/, '').toLowerCase() as View
  const valid: View[] = ['dashboard', 'ledger', 'portfolio', 'markets', 'malaysia', 'analytics', 'settings']
  return valid.includes(value) ? value : 'dashboard'
}

function App() {
  const {
    session,
    isLoading,
    error,
    isPasswordRecovery,
    setIsPasswordRecovery,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
  } = useAuth()
  const [view, setView] = useState<View>(viewFromHash)
  const [isCopilotOpen, setIsCopilotOpen] = useState(false)
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false)

  const userId = session?.user?.id || ''
  const holdingsHook = useHoldings(userId)
  const { balance: cashBalance } = useCashBalance(userId)
  const { activities } = useRecentActivity(userId)

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = (next: View) => {
    window.location.hash = next === 'dashboard' ? '' : `/${next}`
    setView(next)
  }

  const portalContext: PortalContext = useMemo(
    () => ({
      userId,
      currentView: view,
      onNavigate: (next: string) => navigate(next as View),
      holdings: holdingsHook.holdings,
      summary: holdingsHook.summary,
      cashBalance,
      activities,
      addHolding: (isinOrTicker, qty, cost) => holdingsHook.addHolding(isinOrTicker, qty, cost),
      updateHolding: (id, updates, opts) => holdingsHook.updateHolding(id, updates, opts),
      deleteHolding: (id) => holdingsHook.deleteHolding(id),
      refreshAllPrices: () => holdingsHook.refreshAllPrices(),
    }),
    [userId, view, holdingsHook, cashBalance, activities]
  )

  if (!session || isPasswordRecovery) {
    return (
      <main className="app-shell signed-out-shell">
        <AuthGate
          isLoading={isLoading}
          error={error}
          onSignIn={signIn}
          onResetPassword={resetPassword}
          onUpdatePassword={updatePassword}
          isPasswordRecovery={isPasswordRecovery}
          onCancelRecovery={() => setIsPasswordRecovery(false)}
        />
      </main>
    )
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

        <div className="sidebar-copilot-trigger">
          <button
            type="button"
            className={`btn small sidebar-copilot-btn ${isCopilotOpen ? 'active' : ''}`}
            onClick={() => setIsCopilotOpen(!isCopilotOpen)}
          >
            <span>🤖</span>
            <span>Agent Copilot</span>
          </button>
        </div>

        <div className="sidebar-account">
          <span className="muted">Signed in</span>
          <strong title={session.user.email}>{session.user.email || 'CryptGreg user'}</strong>
          <div className="sidebar-account-actions">
            <button
              className="btn small ghost sidebar-password-btn"
              type="button"
              onClick={() => setIsChangePasswordOpen(true)}
              title="Change your account password"
            >
              Change password
            </button>
            <button
              className="btn small ghost sidebar-signout-btn"
              type="button"
              onClick={() => void signOut()}
            >
              Sign out
            </button>
          </div>
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
        {view === 'portfolio' && <PortfolioModule userId={session.user.id} holdingsHook={holdingsHook} />}
        {view === 'markets' && <MarketsModule />}
        {view === 'malaysia' && (
          <MalaysiaModule onNavigateToPortfolio={() => navigate('portfolio')} />
        )}
        {view === 'analytics' && <AnalyticsModule userId={session.user.id} />}
        {view === 'settings' && (
          <SettingsModule
            onOpenCopilot={() => setIsCopilotOpen(true)}
            userEmail={session.user.email}
            onUpdatePassword={updatePassword}
          />
        )}
      </main>

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        userEmail={session.user.email}
        onUpdatePassword={updatePassword}
      />

      {/* Persistent Agent Copilot Drawer */}
      <AgentCopilot
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        portalContext={portalContext}
      />

      {/* Floating Copilot Launcher Button */}
      <button
        type="button"
        className={`floating-copilot-btn ${isCopilotOpen ? 'active' : ''}`}
        onClick={() => setIsCopilotOpen(!isCopilotOpen)}
        title="Toggle AI Agent Copilot"
        aria-label="Toggle AI Agent Copilot"
      >
        <span className="copilot-sparkle">⚡</span>
        <span className="copilot-label">Agent Copilot</span>
      </button>
    </div>
  )
}

export default App

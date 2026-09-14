import { useEffect, useState } from 'react'
import type { MalaysiaOverview } from '../types'
import { fetchMalaysiaOverview } from '../api/malaysia'
import { useHoldings } from '../hooks/useHoldings'
import { useCashBalance } from '../hooks/useCashBalance'
import { useRecentActivity } from '../hooks/useRecentActivity'
import { DashboardKpis } from './dashboard/DashboardKpis'
import { PerformanceChart } from './dashboard/PerformanceChart'
import { MalaysiaMarketCard } from './dashboard/MalaysiaMarketCard'
import { TopHoldings } from './dashboard/TopHoldings'
import { RecentActivity } from './dashboard/RecentActivity'
import { QuickSearch } from './dashboard/QuickSearch'

interface DashboardProps {
  email: string
  userId: string
  onNavigate: (view: 'dashboard' | 'ledger' | 'portfolio' | 'markets' | 'malaysia' | 'analytics') => void
}

export function Dashboard({ userId, onNavigate }: DashboardProps) {
  const { holdings, summary } = useHoldings(userId)
  const { balance: cashBalance } = useCashBalance(userId)
  const { activities } = useRecentActivity(userId)

  const [malaysiaData, setMalaysiaData] = useState<MalaysiaOverview | null>(null)
  const [currentDateTime, setCurrentDateTime] = useState('')

  useEffect(() => {
    // Format live date & time like "Tue, 3 Sep 2024 10:24 AM"
    const updateTime = () => {
      const now = new Date()
      const formatted = now.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }) + ' ' + now.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      })
      setCurrentDateTime(formatted)
    }

    updateTime()
    const timer = setInterval(updateTime, 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    fetchMalaysiaOverview().then((res) => {
      if (active) setMalaysiaData(res)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <section className="dashboard-root" aria-label="Finance Dashboard">
      {/* Top Welcome Header matching mock */}
      <header className="dashboard-top-header">
        <div className="header-greeting">
          <span className="workspace-eyebrow">FINANCIAL WORKSPACE</span>
          <h1 className="welcome-heading">Welcome back</h1>
          <p className="welcome-subhead muted">Here's your portfolio and market overview.</p>
        </div>

        <div className="header-meta">
          <div className="malaysia-status-badge">
            <span className="flag-icon" role="img" aria-label="Malaysia">????</span>
            <div className="badge-text-group">
              <strong className="badge-title">Malaysia Market</strong>
              <span className="badge-subtitle muted">Live data</span>
            </div>
          </div>

          <div className="header-right-col">
            <span className="live-clock muted">{currentDateTime}</span>
            <div className="system-status-chip">
              <span className="status-dot-green" />
              <span>All systems online</span>
            </div>
          </div>
        </div>
      </header>

      {/* 1. Top KPI Cards Row */}
      <DashboardKpis
        portfolioValue={summary.totalMarket}
        totalCost={summary.totalCost}
        totalPnl={summary.pnl}
        totalPnlPct={summary.pnlPct}
        todayChange={summary.todayChange || 0}
        todayChangePct={summary.todayChangePct || 0}
        cashBalance={cashBalance}
      />

      {/* 2. Middle Row: Performance Chart + Malaysia Market Card */}
      <section className="dashboard-middle-grid" aria-label="Charts and Macro indicators">
        <div className="performance-col">
          <PerformanceChart holdings={holdings} />
        </div>

        <div className="malaysia-col-wrapper">
          {malaysiaData ? (
            <MalaysiaMarketCard
              overview={malaysiaData}
              onViewMore={() => onNavigate('malaysia')}
            />
          ) : (
            <div className="loading-card-placeholder">Loading market overview�</div>
          )}
        </div>
      </section>

      {/* 3. Bottom Row: Top Holdings + Recent Activity + Quick Search */}
      <section className="dashboard-bottom-grid" aria-label="Holdings, Activity and Quick Search">
        <div className="bottom-col">
          <TopHoldings
            holdings={holdings}
            onViewAll={() => onNavigate('portfolio')}
          />
        </div>

        <div className="bottom-col">
          <RecentActivity
            activities={activities}
            onViewAll={() => onNavigate('ledger')}
          />
        </div>

        <div className="bottom-col">
          <QuickSearch
            onNavigateToPortfolio={() => onNavigate('portfolio')}
          />
        </div>
      </section>
    </section>
  )
}

import { useEffect, useState } from 'react'
import { expenseDb, portfolioDb } from '../lib/supabase'
import type { RecentActivityItem } from '../types'

const MOCK_ACTIVITIES: RecentActivityItem[] = [
  {
    id: 'act-1',
    type: 'buy',
    title: 'Buy 1155',
    subtitle: 'Maybank',
    amount: '1,000 shares',
    date: '28 Aug 2024',
    timestamp: new Date('2024-08-28').getTime(),
  },
  {
    id: 'act-2',
    type: 'buy',
    title: 'Buy AAPL',
    subtitle: 'Apple Inc.',
    amount: '10 shares',
    date: '15 Aug 2024',
    timestamp: new Date('2024-08-15').getTime(),
  },
  {
    id: 'act-3',
    type: 'sell',
    title: 'Sell 1295',
    subtitle: 'Public Bank',
    amount: '500 shares',
    date: '2 Aug 2024',
    timestamp: new Date('2024-08-02').getTime(),
  },
  {
    id: 'act-4',
    type: 'buy',
    title: 'Buy 1023',
    subtitle: 'CIMB',
    amount: '800 shares',
    date: '18 Jul 2024',
    timestamp: new Date('2024-07-18').getTime(),
  },
  {
    id: 'act-5',
    type: 'deposit',
    title: 'Deposit',
    subtitle: 'Cash Deposit',
    amount: 'RM 5,000',
    date: '10 Jul 2024',
    timestamp: new Date('2024-07-10').getTime(),
  },
]

export function useRecentActivity(userId: string) {
  const [activities, setActivities] = useState<RecentActivityItem[]>(MOCK_ACTIVITIES)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadActivities() {
      setIsLoading(true)

      try {
        const merged: RecentActivityItem[] = []

        // 1. Load recent transactions from expense.transactions
        const { data: expAcc } = await expenseDb
          .from('accounts')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (expAcc) {
          const { data: txs } = await expenseDb
            .from('transactions')
            .select('id, type, description, amount, signed_amount, record_date, created_at')
            .eq('account_id', expAcc.id)
            .order('record_date', { ascending: false })
            .limit(10)

          if (txs) {
            for (const tx of txs) {
              const type = tx.type === 'income' ? 'deposit' : tx.type === 'transfer' ? 'transfer' : 'expense'
              const dateStr = new Date(tx.record_date).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
              merged.push({
                id: `exp-${tx.id}`,
                type,
                title: tx.type === 'income' ? 'Deposit' : tx.type[0].toUpperCase() + tx.type.slice(1),
                subtitle: tx.description || 'Ledger transaction',
                amount: `RM ${Number(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                date: dateStr,
                timestamp: new Date(tx.record_date).getTime(),
              })
            }
          }
        }

        // 2. Load recent portfolio holdings
        const { data: portAcc } = await portfolioDb
          .from('accounts')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (portAcc) {
          const { data: holdings } = await portfolioDb
            .from('holdings')
            .select('id, quantity, updated_at, security_id')
            .eq('account_id', portAcc.id)
            .order('updated_at', { ascending: false })
            .limit(5)

          if (holdings && holdings.length > 0) {
            const secIds = holdings.map((h) => h.security_id)
            const { data: secs } = await portfolioDb
              .from('securities')
              .select('id, ticker, security_name')
              .in('id', secIds)

            const secMap = new Map((secs || []).map((s) => [s.id, s]))

            for (const h of holdings) {
              const s = secMap.get(h.security_id)
              const ticker = s?.ticker ? s.ticker.replace(/\.KL$/i, '') : 'Stock'
              const dateStr = new Date(h.updated_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
              merged.push({
                id: `hold-${h.id}`,
                type: 'buy',
                title: `Buy ${ticker}`,
                subtitle: s?.security_name || 'Holding updated',
                amount: `${Number(h.quantity).toLocaleString()} shares`,
                date: dateStr,
                timestamp: new Date(h.updated_at).getTime(),
              })
            }
          }
        }

        if (active) {
          if (merged.length > 0) {
            merged.sort((a, b) => b.timestamp - a.timestamp)
            setActivities(merged.slice(0, 8))
          } else {
            setActivities(MOCK_ACTIVITIES)
          }
        }
      } catch (err) {
        console.warn('[useRecentActivity] fallback to sample activity feed:', err)
        if (active) setActivities(MOCK_ACTIVITIES)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    if (userId) {
      void loadActivities()
    }

    return () => {
      active = false
    }
  }, [userId])

  return { activities, isLoading }
}

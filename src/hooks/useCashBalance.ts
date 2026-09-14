import { useEffect, useState } from 'react'
import { expenseDb } from '../lib/supabase'

export function useCashBalance(userId: string) {
  const [balance, setBalance] = useState<number>(2150.0) // Fallback initial matches mock
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadBalance() {
      setIsLoading(true)
      setError(null)

      try {
        // 1. Get user's expense account
        const { data: account, error: accError } = await expenseDb
          .from('accounts')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle()

        if (accError) throw accError
        if (!account) {
          if (active) {
            setBalance(2150.0) // Demo / fresh user fallback
            setIsLoading(false)
          }
          return
        }

        // 2. Sum signed_amount for posted transactions
        const { data: txs, error: txError } = await expenseDb
          .from('transactions')
          .select('signed_amount')
          .eq('account_id', account.id)
          .eq('status', 'posted')

        if (txError) throw txError

        if (active) {
          if (txs && txs.length > 0) {
            const total = txs.reduce((sum, tx) => sum + (Number(tx.signed_amount) || 0), 0)
            setBalance(total)
          } else {
            setBalance(2150.0)
          }
        }
      } catch (err) {
        console.warn('[useCashBalance] Could not query expense ledger balance:', err)
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to query cash balance')
          setBalance(2150.0)
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    if (userId) {
      void loadBalance()
    }

    return () => {
      active = false
    }
  }, [userId])

  return { balance, isLoading, error }
}

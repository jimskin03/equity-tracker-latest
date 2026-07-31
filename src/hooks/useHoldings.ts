import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Holding } from '../types'
import { lookupSecurityByIsin, refreshLatestPrice } from '../api/marketData'

const STORAGE_KEY = 'equity-tracker-holdings-v1'

function loadHoldings(): Holding[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Holding[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistHoldings(holdings: Holding[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings))
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `h_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>(() => loadHoldings())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    persistHoldings(holdings)
  }, [holdings])

  const clearMessages = useCallback(() => {
    setError(null)
    setStatus(null)
  }, [])

  const addHolding = useCallback(
    async (isin: string, quantity: number, costPrice: number) => {
      clearMessages()
      setIsLoading(true)

      try {
        const lookup = await lookupSecurityByIsin(isin)
        const existing = holdings.find((h) => h.isin === lookup.isin)

        if (existing) {
          throw new Error(
            `A holding for ${lookup.isin} already exists. Edit the existing row instead.`,
          )
        }

        const next: Holding = {
          id: createId(),
          isin: lookup.isin,
          securityName: lookup.securityName,
          ticker: lookup.ticker,
          holdings: quantity,
          costPrice,
          latestPrice: lookup.latestPrice || costPrice,
          currency: lookup.currency,
          updatedAt: new Date().toISOString(),
        }

        setHoldings((prev) => [next, ...prev])
        setStatus(
          lookup.latestPrice > 0
            ? `Saved ${lookup.securityName} (${lookup.ticker})`
            : `Saved ${lookup.securityName}. Latest market price unavailable — using cost price.`,
        )
        return next
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save holding'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [clearMessages, holdings],
  )

  const updateHolding = useCallback(
    async (
      id: string,
      updates: { isin?: string; holdings: number; costPrice: number },
      options?: { refreshMarketData?: boolean },
    ) => {
      clearMessages()
      setIsLoading(true)

      try {
        const current = holdings.find((h) => h.id === id)
        if (!current) {
          throw new Error('Holding not found')
        }

        let next: Holding = {
          ...current,
          holdings: updates.holdings,
          costPrice: updates.costPrice,
          updatedAt: new Date().toISOString(),
        }

        const isinChanged =
          updates.isin && updates.isin.trim().toUpperCase() !== current.isin

        if (isinChanged || options?.refreshMarketData) {
          const lookup = await lookupSecurityByIsin(updates.isin || current.isin)

          // Prevent duplicate ISIN on another row
          const clash = holdings.find((h) => h.id !== id && h.isin === lookup.isin)
          if (clash) {
            throw new Error(`Another holding already uses ISIN ${lookup.isin}`)
          }

          next = {
            ...next,
            isin: lookup.isin,
            securityName: lookup.securityName,
            ticker: lookup.ticker,
            latestPrice: lookup.latestPrice || next.costPrice,
            currency: lookup.currency,
          }
        }

        setHoldings((prev) => prev.map((h) => (h.id === id ? next : h)))
        setStatus(`Updated ${next.securityName}`)
        return next
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to update holding'
        setError(message)
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [clearMessages, holdings],
  )

  const deleteHolding = useCallback(
    (id: string) => {
      clearMessages()
      setHoldings((prev) => prev.filter((h) => h.id !== id))
      setStatus('Holding deleted')
    },
    [clearMessages],
  )

  const refreshAllPrices = useCallback(async () => {
    if (holdings.length === 0) return

    clearMessages()
    setIsLoading(true)

    try {
      const refreshed = await Promise.all(
        holdings.map(async (holding) => {
          const quote = await refreshLatestPrice(holding.ticker)
          if (!quote) return holding

          return {
            ...holding,
            latestPrice: quote.latestPrice,
            currency: quote.currency || holding.currency,
            updatedAt: new Date().toISOString(),
          }
        }),
      )

      setHoldings(refreshed)
      setStatus('Latest prices refreshed')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to refresh prices'
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [clearMessages, holdings])

  const summary = useMemo(() => {
    const totalCost = holdings.reduce((sum, h) => sum + h.holdings * h.costPrice, 0)
    const totalMarket = holdings.reduce((sum, h) => sum + h.holdings * h.latestPrice, 0)
    const pnl = totalMarket - totalCost
    const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0

    return { totalCost, totalMarket, pnl, pnlPct, count: holdings.length }
  }, [holdings])

  return {
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
  }
}

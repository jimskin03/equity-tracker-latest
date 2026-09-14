import type { MalaysiaOverview } from '../types'

const FALLBACK_OVERVIEW: MalaysiaOverview = {
  klci: {
    price: 1628.54,
    change: 12.36,
    changePercent: 0.76,
    name: 'FBM KLCI',
  },
  opr: {
    rate: 2.75,
    change: 0,
    status: 'unchanged',
  },
  myor: {
    rate: 3.54,
    term: '3-Month',
    change: -0.02,
  },
  fx: [
    { pair: 'USD / MYR', currency: 'USD', rate: 4.709, change: 0.006 },
    { pair: 'SGD / MYR', currency: 'SGD', rate: 3.4821, change: -0.0023 },
    { pair: 'CNY / MYR', currency: 'CNY', rate: 0.6521, change: 0.0011 },
    { pair: 'JPY / MYR', currency: 'JPY', rate: 0.0316, change: 0.0001 },
    { pair: 'EUR / MYR', currency: 'EUR', rate: 5.1332, change: 0.0084 },
  ],
  gold: {
    name: 'Kijang Emas (1 gram)',
    buy: 356.0,
    sell: 384.0,
    change: 1.0,
  },
  gainers: [
    { code: '5249', name: 'AIRASIA', changePercent: 4.21 },
    { code: '1155', name: 'MAYBANK', changePercent: 2.67 },
    { code: '4677', name: 'YTL', changePercent: 2.33 },
    { code: '1295', name: 'PUBLIC BANK', changePercent: 1.98 },
    { code: '5211', name: 'TENAGA', changePercent: 1.45 },
  ],
  asOf: new Date().toISOString(),
}

export async function fetchMalaysiaOverview(): Promise<MalaysiaOverview> {
  try {
    const res = await fetch('/api/malaysia/overview')
    if (!res.ok) throw new Error(`Overview fetch failed: ${res.status}`)
    const data = (await res.json()) as MalaysiaOverview
    return data
  } catch (err) {
    console.warn('[malaysia overview] Using fallback overview data:', err)
    return FALLBACK_OVERVIEW
  }
}

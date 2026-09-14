// Central Foreign Exchange (FX) conversion service for CryptGreg Finance.
// Converts all foreign securities into the platform-wide base currency (MYR / RM)
// using official Bank Negara Malaysia (BNM) exchange rates.

export const BASE_CURRENCY = 'MYR'

// Default reference rates vs MYR (fallback / offline)
const defaultRatesToMyr: Record<string, number> = {
  MYR: 1.0,
  USD: 4.709,   // 1 USD = ~4.709 MYR
  SGD: 3.4821,  // 1 SGD = ~3.4821 MYR
  CNY: 0.6521,  // 1 CNY = ~0.6521 MYR
  JPY: 0.0316,  // 1 JPY = ~0.0316 MYR (or 100 JPY = 3.16 MYR)
  EUR: 5.1332,  // 1 EUR = ~5.1332 MYR
  GBP: 6.152,   // 1 GBP = ~6.1520 MYR
  AUD: 3.148,   // 1 AUD = ~3.1480 MYR
  HKD: 0.603,   // 1 HKD = ~0.6030 MYR
}

const currentRates: Record<string, number> = { ...defaultRatesToMyr }
let lastFetchedTime = 0

export function updateFxRates(rates: Record<string, number>): void {
  for (const [currency, rate] of Object.entries(rates)) {
    if (typeof rate === 'number' && rate > 0) {
      currentRates[currency.toUpperCase()] = rate
    }
  }
  lastFetchedTime = Date.now()
}

export function getFxRateToMyr(currency: string): number {
  const code = (currency || 'MYR').toUpperCase()
  return currentRates[code] ?? defaultRatesToMyr[code] ?? 1.0
}

export function convertToBase(amount: number, fromCurrency: string, _toCurrency: string = BASE_CURRENCY): number {
  if (!Number.isFinite(amount) || amount === 0) return 0
  const rate = getFxRateToMyr(fromCurrency)
  return amount * rate
}

export function formatCurrency(value: number, currency: string = BASE_CURRENCY): string {
  const code = (currency || BASE_CURRENCY).toUpperCase()
  const absVal = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  const prefix =
    code === 'MYR'
      ? 'RM '
      : code === 'USD'
      ? 'US$ '
      : code === 'SGD'
      ? 'S$ '
      : code === 'GBP'
      ? '£ '
      : code === 'EUR'
      ? '€ '
      : `${code} `

  return `${prefix}${absVal}`
}

export async function syncLiveFxRates(): Promise<void> {
  // Only refresh every 15 minutes
  if (Date.now() - lastFetchedTime < 15 * 60 * 1000 && lastFetchedTime > 0) return

  try {
    const res = await fetch('/api/malaysia/overview')
    if (!res.ok) return
    const data = await res.json()
    if (data?.fx && Array.isArray(data.fx)) {
      const newRates: Record<string, number> = {}
      for (const item of data.fx) {
        if (item.currency && item.rate) {
          newRates[item.currency] = Number(item.rate)
        }
      }
      updateFxRates(newRates)
    }
  } catch (err) {
    console.warn('[fxService] using fallback exchange rates:', err)
  }
}

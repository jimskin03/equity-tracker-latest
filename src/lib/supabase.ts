import { createClient } from '@supabase/supabase-js'

const DEFAULT_SUPABASE_URL = 'https://vlnocfdiexkqcnfbjhqt.supabase.co'
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_ys0Cl98LLqAdNEiNY1f7Mg_lddIzr6F'
const ROOT_DOMAIN = 'cryptgregresearch.org'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY

function sharedCookieDomain(): string {
  const hostname = window.location.hostname
  return hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`)
    ? `; Domain=${ROOT_DOMAIN}`
    : ''
}

// Supabase auth storage is shared at the root domain in production. The
// localStorage mirror preserves the existing Ledger contract and supports
// local HTTP development, where Secure cookies are unavailable.
const sharedCookieStorage = {
  getItem(key: string): string | null {
    const cookie = document.cookie
      .split('; ')
      .find((item) => item.startsWith(`${key}=`))
    if (cookie) return decodeURIComponent(cookie.slice(key.length + 1))
    const legacy = localStorage.getItem(key)
    if (legacy) this.setItem(key, legacy)
    return legacy
  },
  setItem(key: string, value: string): void {
    const domain = sharedCookieDomain()
    document.cookie = `${key}=; Max-Age=0; Path=/; Secure; SameSite=Lax`
    document.cookie = `${key}=${encodeURIComponent(value)}; Max-Age=31536000; Path=/${domain}; Secure; SameSite=Lax`
    localStorage.setItem(key, value)
  },
  removeItem(key: string): void {
    const domain = sharedCookieDomain()
    document.cookie = `${key}=; Max-Age=0; Path=/; Secure; SameSite=Lax`
    document.cookie = `${key}=; Max-Age=0; Path=/${domain}; Secure; SameSite=Lax`
    localStorage.removeItem(key)
  },
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: sharedCookieStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const portfolioDb = supabase.schema('portfolio')
export const expenseDb = supabase.schema('expense')

import { useState } from 'react'
import type { FormEvent } from 'react'

interface AuthGateProps {
  isLoading: boolean
  error: string | null
  onSignIn: (email: string, password: string) => Promise<void>
}
export function AuthGate({ isLoading, error, onSignIn }: AuthGateProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsSubmitting(true)
    try {
      await onSignIn(email.trim(), password)
      setPassword('')
    } catch {
      // The shared auth hook surfaces the error.
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) return <div className="auth-state card">Restoring your CryptGreg session…</div>

  return (
    <section className="auth-card card">
      <div>
        <p className="eyebrow">Shared account</p>
        <h1>Sign in once for your full finance workspace</h1>
        <p className="muted">
          This uses the same CryptGreg Supabase identity as cryptgregresearch.org, Ledger, and
          Portfolio. Your session is shared across the finance subdomains.
        </p>
      </div>
      <form onSubmit={submit} className="auth-form">
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
        </label>
        {error && <div className="banner error">{error}</div>}
        <button className="btn primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}

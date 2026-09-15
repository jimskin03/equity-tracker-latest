import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'

interface AuthGateProps {
  isLoading: boolean
  error: string | null
  onSignIn: (email: string, password: string) => Promise<void>
  onResetPassword?: (email: string) => Promise<void>
  onUpdatePassword?: (newPassword: string) => Promise<void>
  isPasswordRecovery?: boolean
  onCancelRecovery?: () => void
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

export function AuthGate({
  isLoading,
  error,
  onSignIn,
  onResetPassword,
  onUpdatePassword,
  isPasswordRecovery = false,
  onCancelRecovery,
}: AuthGateProps) {
  const [mode, setMode] = useState<'signin' | 'forgot'>(isPasswordRecovery ? 'signin' : 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)
  const [recoverySuccess, setRecoverySuccess] = useState(false)

  useEffect(() => {
    setLocalError(null)
  }, [mode, isPasswordRecovery])

  const handleSignIn = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)
    setIsSubmitting(true)
    try {
      await onSignIn(email.trim(), password)
      setPassword('')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleForgotSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim()) {
      setLocalError('Please enter your email address.')
      return
    }
    setLocalError(null)
    setIsSubmitting(true)
    try {
      if (onResetPassword) {
        await onResetPassword(email.trim())
      }
      setResetSent(true)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRecoverySubmit = async (event: FormEvent) => {
    event.preventDefault()
    setLocalError(null)

    if (newPassword.length < 6) {
      setLocalError('Password must be at least 6 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setLocalError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    try {
      if (onUpdatePassword) {
        await onUpdatePassword(newPassword)
      }
      setRecoverySuccess(true)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return <div className="auth-state card">Restoring your CryptGreg session…</div>
  }

  // View: Recovery / Set New Password
  if (isPasswordRecovery) {
    return (
      <section className="auth-card card" aria-label="Set New Password">
        <div>
          <p className="eyebrow">Account Recovery</p>
          <h1>Set your new password</h1>
          <p className="muted">
            Choose a strong new password for your CryptGreg Finance account. Once updated, you will be
            signed in immediately.
          </p>
        </div>

        {recoverySuccess ? (
          <div className="auth-form">
            <div className="banner success">
              ✓ Password updated successfully! Redirecting to your workspace...
            </div>
          </div>
        ) : (
          <form onSubmit={handleRecoverySubmit} className="auth-form">
            <label className="field">
              <span>New Password</span>
              <div className="auth-input-wrapper">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="auth-eye-btn"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  <EyeIcon open={showNewPassword} />
                </button>
              </div>
            </label>

            <label className="field">
              <span>Confirm New Password</span>
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat new password"
                autoComplete="new-password"
                required
              />
            </label>

            {(localError || error) && (
              <div className="banner error">{localError || error}</div>
            )}

            <button className="btn primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating password…' : 'Save New Password'}
            </button>

            {onCancelRecovery && (
              <button
                type="button"
                className="auth-text-link"
                onClick={onCancelRecovery}
              >
                Cancel & return to Sign In
              </button>
            )}
          </form>
        )}
      </section>
    )
  }

  // View: Forgot Password Form
  if (mode === 'forgot') {
    return (
      <section className="auth-card card" aria-label="Forgot Password">
        <div>
          <p className="eyebrow">Password Recovery</p>
          <h1>Reset your CryptGreg password</h1>
          <p className="muted">
            Enter your account email address below. We'll send you a secure link to reset your password.
          </p>
        </div>

        {resetSent ? (
          <div className="auth-form">
            <div className="banner success">
              <strong>Check your inbox!</strong>
              <p style={{ margin: '0.4rem 0 0', fontSize: '0.86rem' }}>
                We sent a password reset link to <strong>{email}</strong>. Click the link in the email to set your new password.
              </p>
            </div>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                setResetSent(false)
                setMode('signin')
              }}
            >
              ← Back to Sign In
            </button>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="auth-form">
            <label className="field">
              <span>Account Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                placeholder="name@example.com"
                required
              />
            </label>

            {(localError || error) && (
              <div className="banner error">{localError || error}</div>
            )}

            <button className="btn primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Sending instructions…' : 'Send Reset Link'}
            </button>

            <button
              type="button"
              className="auth-text-link"
              onClick={() => {
                setLocalError(null)
                setMode('signin')
              }}
            >
              ← Back to Sign In
            </button>
          </form>
        )}
      </section>
    )
  }

  // View: Standard Sign In
  return (
    <section className="auth-card card" aria-label="Sign In">
      <div>
        <p className="eyebrow">Shared account</p>
        <h1>Sign in once for your full finance workspace</h1>
        <p className="muted">
          This uses the same CryptGreg Supabase identity as cryptgregresearch.org, Ledger, and
          Portfolio. Your session is shared across the finance subdomains.
        </p>
      </div>

      <form onSubmit={handleSignIn} className="auth-form">
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="name@example.com"
            required
          />
        </label>

        <label className="field">
          <div className="field-label-row">
            <span>Password</span>
            <button
              type="button"
              className="auth-forgot-link"
              onClick={() => {
                setLocalError(null)
                setMode('forgot')
              }}
            >
              Forgot password?
            </button>
          </div>
          <div className="auth-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="auth-eye-btn"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Hide password' : 'Show password'}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <EyeIcon open={showPassword} />
            </button>
          </div>
        </label>

        {(localError || error) && (
          <div className="banner error">{localError || error}</div>
        )}

        <button className="btn primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </section>
  )
}

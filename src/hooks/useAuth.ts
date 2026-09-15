import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.location.hash.includes('type=recovery')
    }
    return false
  })

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return
      setSession(data.session)
      setError(sessionError?.message || null)
      setIsLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true)
      }
      setError(null)
      setIsLoading(false)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      setError(signInError.message)
      throw signInError
    }
  }, [])

  const signOut = useCallback(async () => {
    setError(null)
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(signOutError.message)
      throw signOutError
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    setError(null)
    const redirectUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : undefined
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    })
    if (resetError) {
      setError(resetError.message)
      throw resetError
    }
  }, [])

  const updatePassword = useCallback(async (newPassword: string) => {
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setError(updateError.message)
      throw updateError
    }
    setIsPasswordRecovery(false)
    if (typeof window !== 'undefined' && window.location.hash.includes('type=recovery')) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  }, [])

  return {
    session,
    isLoading,
    error,
    isPasswordRecovery,
    setIsPasswordRecovery,
    signIn,
    signOut,
    resetPassword,
    updatePassword,
  }
}

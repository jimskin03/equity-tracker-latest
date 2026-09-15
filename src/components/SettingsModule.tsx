import { useState, useEffect, useId, useMemo } from 'react'
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  fetchAvailableModels,
  getCachedModels,
  computeEndpointPreview,
  type AiSettings,
  type AiModelInfo,
} from '../lib/aiSettings'

interface SettingsModuleProps {
  onOpenCopilot?: () => void
  userEmail?: string
  onUpdatePassword?: (newPassword: string) => Promise<void>
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

const FALLBACK_MODELS = [
  { id: 'gpt-4o-mini', isFree: false },
  { id: 'gpt-4o', isFree: false },
  { id: 'google/gemma-4-26b-a4b-it:free', isFree: true },
  { id: 'nvidia/nemotron-3.5-lightning:free', isFree: true },
  { id: 'deepseek-chat', isFree: false },
]

export function SettingsModule({ onOpenCopilot, userEmail, onUpdatePassword }: SettingsModuleProps) {
  const [settings, setSettings] = useState<AiSettings>(getAiSettings)
  const [showPassword, setShowPassword] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saveBanner, setSaveBanner] = useState<string | null>(null)

  // Account password change state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [passwordFeedback, setPasswordFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  // Dynamic models state
  const [models, setModels] = useState<AiModelInfo[]>(getCachedModels)
  const [isFetchingModels, setIsFetchingModels] = useState(false)
  const [modelSearch, setModelSearch] = useState('')
  const [onlyFreeFilter, setOnlyFreeFilter] = useState(false)

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordFeedback(null)
    if (!onUpdatePassword) return

    if (newPassword.length < 6) {
      setPasswordFeedback({ ok: false, message: 'Password must be at least 6 characters long.' })
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ ok: false, message: 'Passwords do not match.' })
      return
    }

    setIsUpdatingPassword(true)
    try {
      await onUpdatePassword(newPassword)
      setPasswordFeedback({ ok: true, message: 'Password updated successfully!' })
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setPasswordFeedback(null), 4000)
    } catch (err) {
      setPasswordFeedback({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      })
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const apiKeyInputId = useId()
  const apiHostInputId = useId()
  const modelInputId = useId()
  const modelSearchId = useId()

  useEffect(() => {
    const s = getAiSettings()
    setSettings(s)
    const cached = getCachedModels()
    if (cached.length > 0) {
      setModels(cached)
      if (cached.some((m) => m.isFree) && s.apiHost.includes('openrouter')) {
        setOnlyFreeFilter(true)
      }
    }
  }, [])

  const handleOAuthClick = () => {
    const nextOAuth = !settings.useOAuth
    const updated = saveAiSettings({ useOAuth: nextOAuth })
    setSettings(updated)
    setSaveBanner(
      nextOAuth
        ? 'OAuth Login enabled: requests now use Responses transport.'
        : 'OAuth Login disabled: requests now use standard Chat Completions transport.'
    )
    setTimeout(() => setSaveBanner(null), 4000)
  }

  const handleApiKeyChange = (val: string) => {
    const updated = saveAiSettings({ apiKey: val })
    setSettings(updated)
    setCheckResult(null)
  }

  const handleHostChange = (val: string) => {
    const updated = saveAiSettings({ apiHost: val })
    setSettings(updated)
    setCheckResult(null)
  }

  const handleModelSelect = (val: string) => {
    const updated = saveAiSettings({ model: val })
    setSettings(updated)
    setSaveBanner(`Selected model: ${val}`)
    setTimeout(() => setSaveBanner(null), 2500)
  }

  const handleCheckConnection = async () => {
    setIsChecking(true)
    setCheckResult(null)
    try {
      const res = await testAiConnection(settings.apiHost, settings.apiKey)
      setCheckResult(res)
      if (res.ok && res.models.length > 0) {
        setModels(res.models)
        if (res.models.some((m) => m.isFree)) {
          setOnlyFreeFilter(true)
        }
      }
    } finally {
      setIsChecking(false)
    }
  }

  const handleFetchModels = async () => {
    setIsFetchingModels(true)
    try {
      const res = await fetchAvailableModels(settings.apiHost, settings.apiKey)
      if (res.ok && res.models.length > 0) {
        setModels(res.models)
        const hasFree = res.models.some((m) => m.isFree)
        if (hasFree) setOnlyFreeFilter(true)
        setSaveBanner(`Successfully fetched ${res.models.length} models!`)
      } else {
        setSaveBanner(res.message || 'Failed to fetch models.')
      }
      setTimeout(() => setSaveBanner(null), 3500)
    } finally {
      setIsFetchingModels(false)
    }
  }

  const handleReset = () => {
    const resetSettings = saveAiSettings({
      apiKey: '',
      apiHost: 'https://api.openai.com',
      model: 'gpt-4o-mini',
      useOAuth: false,
      transport: 'chat_completions',
    })
    setSettings(resetSettings)
    setCheckResult(null)
    setSaveBanner('Settings reset to defaults.')
    setTimeout(() => setSaveBanner(null), 3000)
  }

  const previewUrl = computeEndpointPreview(settings.apiHost, settings.transport)

  // Filtered models for dropdown / list
  const filteredModels = useMemo(() => {
    return models.filter((m) => {
      if (onlyFreeFilter && !m.isFree) return false
      if (!modelSearch.trim()) return true
      const q = modelSearch.toLowerCase()
      return m.id.toLowerCase().includes(q) || (m.name && m.name.toLowerCase().includes(q))
    })
  }, [models, onlyFreeFilter, modelSearch])

  const freeCount = useMemo(() => models.filter((m) => m.isFree).length, [models])

  // Top free models for quick pick chips
  const topFreeChips = useMemo(() => {
    const freeModels = models.filter((m) => m.isFree)
    if (freeModels.length > 0) return freeModels.slice(0, 6)
    return FALLBACK_MODELS
  }, [models])

  return (
    <section className="module-stack settings-view" aria-label="Settings and AI Configuration">
      <header className="app-header">
        <div>
          <p className="eyebrow">WORKSPACE PREFERENCES</p>
          <h1>Settings</h1>
          <p className="muted header-copy">
            Manage your AI model integrations, OpenAI-compatible credentials, and autonomous portal capabilities.
          </p>
        </div>
        <div className="header-badge">
          <span>AI Engine</span>
          <strong>{settings.useOAuth ? 'OAuth / Responses' : 'OpenAI Compatible'}</strong>
        </div>
      </header>

      {saveBanner && (
        <div className="banner success" role="status">
          <span>{saveBanner}</span>
          <button type="button" className="banner-close" onClick={() => setSaveBanner(null)}>×</button>
        </div>
      )}

      {/* Account & Security Card */}
      <div className="settings-card account-security-card" id="account-security">
        <div className="settings-section">
          <div className="account-header-row">
            <div>
              <h2 className="settings-section-title">Account & Security</h2>
              <p className="settings-helper-text">
                Signed in as <strong>{userEmail || 'CryptGreg User'}</strong>. Manage your login password across the finance workspace.
              </p>
            </div>
            <span className="account-status-badge">✓ Active Session</span>
          </div>

          {passwordFeedback && (
            <div className={`banner ${passwordFeedback.ok ? 'success' : 'error'}`} role="alert">
              {passwordFeedback.message}
            </div>
          )}

          <form onSubmit={handlePasswordChange} className="account-password-form">
            <div className="account-password-grid">
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
                    disabled={isUpdatingPassword}
                  />
                  <button
                    type="button"
                    className="auth-eye-btn"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    title={showNewPassword ? 'Hide password' : 'Show password'}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
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
                  disabled={isUpdatingPassword}
                />
              </label>
            </div>

            <div className="account-form-actions">
              <button
                type="submit"
                className="btn primary small"
                disabled={isUpdatingPassword || !newPassword || !confirmPassword}
              >
                {isUpdatingPassword ? 'Updating Password…' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Main Settings Panel */}
      <div className="settings-card">
        {/* 1. Authentication */}
        <div className="settings-section">
          <h2 className="settings-section-title">Authentication</h2>
          <div className="settings-field-group">
            <button
              type="button"
              className={`oauth-login-button ${settings.useOAuth ? 'active' : ''}`}
              onClick={handleOAuthClick}
            >
              <svg
                className="oauth-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <span>{settings.useOAuth ? 'OAuth Login Enabled' : 'Login with OAuth'}</span>
            </button>
            <p className="settings-helper-text">
              When OAuth Login is enabled, OpenAI requests use the Responses transport instead of the legacy Chat Completions transport.
            </p>
          </div>
        </div>

        {/* 2. API Key */}
        <div className="settings-section">
          <label htmlFor={apiKeyInputId} className="settings-label">API Key</label>
          <div className="api-key-row">
            <div className="input-with-icon-wrapper">
              <input
                id={apiKeyInputId}
                type={showPassword ? 'text' : 'password'}
                className="settings-input"
                placeholder="sk-... or sk-or-v1-..."
                value={settings.apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                autoComplete="off"
                spellCheck="false"
              />
              <button
                type="button"
                className="toggle-visibility-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide API key' : 'Show API key'}
                title={showPassword ? 'Hide API key' : 'Show API key'}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <button
              type="button"
              className="check-key-button"
              disabled={isChecking}
              onClick={() => void handleCheckConnection()}
            >
              {isChecking ? 'Checking...' : 'Check'}
            </button>
          </div>

          {checkResult && (
            <div className={`check-feedback-badge ${checkResult.ok ? 'success' : 'error'}`}>
              <span className="feedback-dot" />
              <span>{checkResult.message}</span>
            </div>
          )}
        </div>

        {/* 3. API Host */}
        <div className="settings-section">
          <label htmlFor={apiHostInputId} className="settings-label">API Host</label>
          <div className="settings-field-group">
            <input
              id={apiHostInputId}
              type="text"
              className="settings-input"
              value={settings.apiHost}
              onChange={(e) => handleHostChange(e.target.value)}
              placeholder="https://api.openai.com or https://openrouter.ai"
            />
            <p className="settings-preview-text">
              Preview: <code className="endpoint-preview-code">{previewUrl}</code>
            </p>
          </div>

          <div className="host-quick-chips">
            <button
              type="button"
              className="host-chip"
              onClick={() => handleHostChange('https://openrouter.ai')}
            >
              OpenRouter (openrouter.ai)
            </button>
            <button
              type="button"
              className="host-chip"
              onClick={() => handleHostChange('https://api.openai.com')}
            >
              OpenAI (api.openai.com)
            </button>
            <button
              type="button"
              className="host-chip"
              onClick={() => handleHostChange('http://localhost:11434')}
            >
              Ollama (localhost:11434)
            </button>
          </div>
        </div>

        {/* 4. Model Selection with Live Fetch */}
        <div className="settings-section model-section">
          <div className="model-section-header">
            <label htmlFor={modelInputId} className="settings-label">Model Selection</label>
            <button
              type="button"
              className="fetch-models-btn"
              disabled={isFetchingModels}
              onClick={() => void handleFetchModels()}
            >
              {isFetchingModels ? 'Fetching...' : '🔄 Fetch Available Models'}
            </button>
          </div>

          <div className="model-selection-row">
            <input
              id={modelInputId}
              type="text"
              className="settings-input model-input"
              value={settings.model}
              onChange={(e) => handleModelSelect(e.target.value)}
              placeholder="e.g. google/gemma-4-26b-a4b-it:free or gpt-4o-mini"
            />
          </div>

          {/* If models are loaded, provide interactive selector */}
          {models.length > 0 && (
            <div className="fetched-models-panel">
              <div className="models-filter-toolbar">
                <div className="models-stats-tag">
                  {models.length} models available
                  {freeCount > 0 && <span className="free-count-pill">{freeCount} free</span>}
                </div>

                <div className="filter-chips-group">
                  {freeCount > 0 && (
                    <button
                      type="button"
                      className={`filter-toggle-chip ${onlyFreeFilter ? 'active' : ''}`}
                      onClick={() => setOnlyFreeFilter(!onlyFreeFilter)}
                    >
                      {onlyFreeFilter ? '✓ Free Only' : 'Free Only'}
                    </button>
                  )}
                  <button
                    type="button"
                    className={`filter-toggle-chip ${!onlyFreeFilter ? 'active' : ''}`}
                    onClick={() => setOnlyFreeFilter(false)}
                  >
                    All Models
                  </button>
                </div>
              </div>

              <div className="models-search-row">
                <input
                  id={modelSearchId}
                  type="text"
                  className="settings-input search-models-input"
                  placeholder={`Search ${filteredModels.length} models (e.g. gemma, free, claude, deepseek)...`}
                  value={modelSearch}
                  onChange={(e) => setModelSearch(e.target.value)}
                />
              </div>

              <div className="models-select-container">
                <select
                  className="models-select-dropdown"
                  value={settings.model}
                  onChange={(e) => handleModelSelect(e.target.value)}
                  size={Math.min(filteredModels.length + 1, 8)}
                >
                  <option value="" disabled>-- Select a model ({filteredModels.length} shown) --</option>
                  {filteredModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.isFree ? '⭐ [FREE] ' : ''}{m.id} {m.name !== m.id ? `(${m.name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Quick Pick Chips */}
          <div className="model-chips-section">
            <span className="chips-row-label">
              {models.length > 0 && freeCount > 0 ? 'Popular Free Models:' : 'Popular Models:'}
            </span>
            <div className="model-quick-chips">
              {topFreeChips.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className={`model-chip ${settings.model === m.id ? 'active' : ''} ${m.isFree ? 'free-badge' : ''}`}
                  onClick={() => handleModelSelect(m.id)}
                  title={m.id}
                >
                  {m.isFree && <span className="chip-star">★ </span>}
                  {m.id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Controls Footer */}
        <div className="settings-footer-actions">
          <button
            type="button"
            className="btn ghost small"
            onClick={handleReset}
          >
            Reset to Defaults
          </button>
          {onOpenCopilot && (
            <button
              type="button"
              className="btn primary small"
              onClick={onOpenCopilot}
            >
              🤖 Open AI Copilot
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

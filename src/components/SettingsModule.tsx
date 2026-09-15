import { useState, useEffect, useId } from 'react'
import {
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  computeEndpointPreview,
  type AiSettings,
} from '../lib/aiSettings'

interface SettingsModuleProps {
  onOpenCopilot?: () => void
}

const COMMON_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'o1-mini',
  'deepseek-chat',
  'claude-3-5-sonnet',
  'llama-3.3-70b',
]

export function SettingsModule({ onOpenCopilot }: SettingsModuleProps) {
  const [settings, setSettings] = useState<AiSettings>(getAiSettings)
  const [showPassword, setShowPassword] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saveBanner, setSaveBanner] = useState<string | null>(null)

  const apiKeyInputId = useId()
  const apiHostInputId = useId()
  const modelInputId = useId()

  useEffect(() => {
    setSettings(getAiSettings())
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

  const handleModelChange = (val: string) => {
    const updated = saveAiSettings({ model: val })
    setSettings(updated)
  }

  const handleCheckConnection = async () => {
    setIsChecking(true)
    setCheckResult(null)
    try {
      const res = await testAiConnection(settings.apiHost, settings.apiKey)
      setCheckResult(res)
    } finally {
      setIsChecking(false)
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
                placeholder="sk-..."
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
              placeholder="https://api.openai.com"
            />
            <p className="settings-preview-text">
              Preview: <code className="endpoint-preview-code">{previewUrl}</code>
            </p>
          </div>
        </div>

        {/* 4. Model Selection */}
        <div className="settings-section">
          <label htmlFor={modelInputId} className="settings-label">Model Name</label>
          <div className="model-selection-row">
            <input
              id={modelInputId}
              type="text"
              className="settings-input"
              value={settings.model}
              onChange={(e) => handleModelChange(e.target.value)}
              placeholder="gpt-4o-mini"
              list="common-models-list"
            />
            <datalist id="common-models-list">
              {COMMON_MODELS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="model-quick-chips">
            {COMMON_MODELS.slice(0, 4).map((m) => (
              <button
                key={m}
                type="button"
                className={`model-chip ${settings.model === m ? 'active' : ''}`}
                onClick={() => handleModelChange(m)}
              >
                {m}
              </button>
            ))}
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

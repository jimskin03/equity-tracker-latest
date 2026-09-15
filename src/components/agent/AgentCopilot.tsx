import { useState, useRef, useEffect } from 'react'
import {
  runAgentConversation,
  type ChatMessage,
  type PortalContext,
  type ToolExecutionStep,
} from '../../lib/agent/agentService'
import { getAiSettings } from '../../lib/aiSettings'

interface AgentCopilotProps {
  isOpen: boolean
  onClose: () => void
  portalContext: PortalContext
}

const QUICK_PROMPTS = [
  '📊 Summarize my portfolio performance',
  '👉 Navigate to the Ledger tab',
  '🇲🇾 What is the BNM OPR and KLCI status?',
  '📈 Calculate quantitative risk metrics',
  '🔄 Refresh all latest stock prices',
  '💰 Log lunch expense: RM 17.20',
]

const NAV_LINKS = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'ledger', label: 'Ledger', icon: '≋' },
  { id: 'portfolio', label: 'Portfolio', icon: '↗' },
  { id: 'markets', label: 'Markets', icon: 'ılı' },
  { id: 'malaysia', label: 'Malaysia', icon: '🇲🇾' },
  { id: 'analytics', label: 'Analytics', icon: '◷' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

function getNavigationSuggestions(text: string): Array<{ id: string; label: string }> {
  const lower = text.toLowerCase()
  const results: Array<{ id: string; label: string }> = []
  if (lower.includes('ledger')) results.push({ id: 'ledger', label: 'Ledger' })
  if (lower.includes('portfolio')) results.push({ id: 'portfolio', label: 'Portfolio' })
  if (lower.includes('malaysia')) results.push({ id: 'malaysia', label: 'Malaysia Market' })
  if (lower.includes('market') && !lower.includes('malaysia')) results.push({ id: 'markets', label: 'Markets' })
  if (lower.includes('analytics')) results.push({ id: 'analytics', label: 'Analytics' })
  if (lower.includes('dashboard')) results.push({ id: 'dashboard', label: 'Dashboard' })
  if (lower.includes('setting')) results.push({ id: 'settings', label: 'Settings' })
  return results
}

export function AgentCopilot({ isOpen, onClose, portalContext }: AgentCopilotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [activeSteps, setActiveSteps] = useState<ToolExecutionStep[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const settings = getAiSettings()
  const isConfigured = Boolean(settings.apiKey || settings.useOAuth)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activeSteps, isLoading])

  const handleSend = async (userPrompt?: string) => {
    const text = (userPrompt || input).trim()
    if (!text || isLoading) return

    setInput('')
    setErrorMessage(null)

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }

    const updatedHistory = [...messages, userMsg]
    setMessages(updatedHistory)
    setIsLoading(true)
    setActiveSteps([])

    try {
      const response = await runAgentConversation(
        updatedHistory,
        portalContext,
        (step) => {
          setActiveSteps((prev) => {
            const idx = prev.findIndex((s) => s.toolCallId === step.toolCallId)
            if (idx >= 0) {
              const copy = [...prev]
              copy[idx] = step
              return copy
            }
            return [...prev, step]
          })
        }
      )

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: response.reply,
        toolSteps: response.toolSteps,
        createdAt: Date.now(),
      }

      setMessages((prev) => [...prev, assistantMsg])
      setActiveSteps([])
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearHistory = () => {
    setMessages([])
    setActiveSteps([])
    setErrorMessage(null)
  }

  if (!isOpen) return null

  return (
    <aside className="agent-copilot-drawer" aria-label="AI Copilot Assistant">
      {/* Header */}
      <header className="copilot-header">
        <div className="copilot-header-left">
          <span className="copilot-bot-badge">🤖</span>
          <div>
            <strong className="copilot-title">CryptGreg Agent</strong>
            <small className="copilot-subtitle">
              {isConfigured ? `${settings.model} (${settings.transport})` : 'Not Configured'}
            </small>
          </div>
        </div>

        <div className="copilot-header-actions">
          {messages.length > 0 && (
            <button
              type="button"
              className="copilot-clear-btn"
              onClick={handleClearHistory}
              title="Clear conversation"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="copilot-close-btn"
            onClick={onClose}
            aria-label="Close Agent Drawer"
          >
            ×
          </button>
        </div>
      </header>

      {/* Quick Portal Navigation Strip */}
      <div className="copilot-nav-strip">
        <span className="nav-strip-label">Portal:</span>
        <div className="nav-strip-items">
          {NAV_LINKS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-strip-btn ${portalContext.currentView === item.id ? 'active' : ''}`}
              onClick={() => portalContext.onNavigate(item.id)}
              title={`Switch to ${item.label}`}
            >
              <span className="strip-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Warning banner if not configured */}
      {!isConfigured && (
        <div className="copilot-unconfigured-banner">
          <p>⚠️ OpenAI or OpenRouter API key is required for autonomous agent execution.</p>
          <button
            type="button"
            className="btn small primary"
            onClick={() => {
              portalContext.onNavigate('settings')
              onClose()
            }}
          >
            Go to Settings
          </button>
        </div>
      )}

      {/* Message Feed */}
      <div className="copilot-feed">
        {messages.length === 0 ? (
          <div className="copilot-welcome-box">
            <div className="welcome-avatar">⚡</div>
            <h3>Autonomous Financial Agent</h3>
            <p className="muted small">
              I can navigate between views, browse your portfolio, record ledger expenses, analyze Bank Negara Malaysia indicators, and execute live actions.
            </p>

            <div className="quick-prompt-chips-grid">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="quick-prompt-chip"
                  onClick={() => void handleSend(prompt)}
                  disabled={isLoading || !isConfigured}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`copilot-bubble-group ${msg.role}`}>
              {/* Tool Execution Steps performed by assistant */}
              {msg.toolSteps && msg.toolSteps.length > 0 && (
                <div className="tool-steps-container">
                  {msg.toolSteps.map((step) => (
                    <details key={step.toolCallId} className="tool-step-card">
                      <summary className="tool-step-summary">
                        <span className="tool-step-icon">
                          {step.status === 'success' ? '✓' : step.status === 'error' ? '✕' : '⏳'}
                        </span>
                        <code className="tool-name">{step.toolName}</code>
                        <span className="tool-status-tag">{step.status}</span>
                      </summary>
                      <div className="tool-step-details">
                        {step.args && Object.keys(step.args).length > 0 && (
                          <div className="step-param-block">
                            <span className="detail-label">Arguments:</span>
                            <pre>{JSON.stringify(step.args, null, 2)}</pre>
                          </div>
                        )}
                        {step.result && (
                          <div className="step-param-block">
                            <span className="detail-label">Result:</span>
                            <pre>{step.result}</pre>
                          </div>
                        )}
                      </div>
                    </details>
                  ))}
                </div>
              )}

              {/* Message Content */}
              {msg.role === 'assistant' ? (
                <>
                  <div className={`copilot-bubble ${msg.role}`}>
                    {msg.content}
                  </div>
                  {getNavigationSuggestions(msg.content).length > 0 && (
                    <div className="bubble-nav-actions">
                      {getNavigationSuggestions(msg.content).map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          className="bubble-nav-btn"
                          onClick={() => portalContext.onNavigate(target.id)}
                        >
                          👉 Switch to {target.label} View
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className={`copilot-bubble ${msg.role}`}>
                  {msg.content}
                </div>
              )}
            </div>
          ))
        )}

        {/* Live executing steps */}
        {isLoading && activeSteps.length > 0 && (
          <div className="tool-steps-container active-steps">
            {activeSteps.map((step) => (
              <div key={step.toolCallId} className="tool-step-card running">
                <div className="tool-step-summary">
                  <span className="tool-step-icon spinner">⚡</span>
                  <code className="tool-name">Executing {step.toolName}...</code>
                  <span className="tool-status-tag">running</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Thinking Indicator */}
        {isLoading && activeSteps.length === 0 && (
          <div className="copilot-bubble-group assistant">
            <div className="copilot-bubble assistant thinking">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="copilot-error-box">
            <span>{errorMessage}</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Box */}
      <form
        className="copilot-input-form"
        onSubmit={(e) => {
          e.preventDefault()
          void handleSend()
        }}
      >
        <input
          type="text"
          className="copilot-input"
          placeholder={isConfigured ? 'Ask agent to browse, execute, or navigate...' : 'Configure API key in Settings first...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading || !isConfigured}
        />
        <button
          type="submit"
          className="copilot-send-btn"
          disabled={isLoading || !input.trim() || !isConfigured}
          aria-label="Send prompt"
        >
          {isLoading ? '...' : '→'}
        </button>
      </form>
    </aside>
  )
}

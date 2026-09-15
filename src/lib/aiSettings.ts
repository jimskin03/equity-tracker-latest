export interface AiSettings {
  apiKey: string
  apiHost: string
  model: string
  useOAuth: boolean
  transport: 'chat_completions' | 'responses'
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiKey: '',
  apiHost: 'https://api.openai.com',
  model: 'gpt-4o-mini',
  useOAuth: false,
  transport: 'chat_completions',
}

export const AI_SETTINGS_STORAGE_KEY = 'cryptgreg_ai_settings_v1'
export const AI_SETTINGS_CHANGED_EVENT = 'cryptgreg_ai_settings_changed'

export function normalizeHost(host: string): string {
  const trimmed = host.trim()
  if (!trimmed) return 'https://api.openai.com'
  return trimmed.replace(/\/+$/, '')
}

export function computeEndpointPreview(host: string, transport: 'chat_completions' | 'responses' = 'chat_completions'): string {
  const cleanHost = normalizeHost(host)
  if (transport === 'responses') {
    return cleanHost.endsWith('/v1') ? `${cleanHost}/responses` : `${cleanHost}/v1/responses`
  }
  return cleanHost.endsWith('/v1') ? `${cleanHost}/chat/completions` : `${cleanHost}/v1/chat/completions`
}

export function getAiSettings(): AiSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_AI_SETTINGS }
  try {
    const raw = localStorage.getItem(AI_SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AI_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<AiSettings>
    return {
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : DEFAULT_AI_SETTINGS.apiKey,
      apiHost: typeof parsed.apiHost === 'string' ? parsed.apiHost : DEFAULT_AI_SETTINGS.apiHost,
      model: typeof parsed.model === 'string' ? parsed.model : DEFAULT_AI_SETTINGS.model,
      useOAuth: Boolean(parsed.useOAuth),
      transport: parsed.useOAuth ? 'responses' : (parsed.transport === 'responses' ? 'responses' : 'chat_completions'),
    }
  } catch {
    return { ...DEFAULT_AI_SETTINGS }
  }
}

export function saveAiSettings(partial: Partial<AiSettings>): AiSettings {
  const current = getAiSettings()
  const updated: AiSettings = {
    ...current,
    ...partial,
  }
  // If useOAuth changed, automatically align transport as described in user spec
  if ('useOAuth' in partial) {
    updated.transport = partial.useOAuth ? 'responses' : 'chat_completions'
  }
  try {
    localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(updated))
    window.dispatchEvent(new CustomEvent(AI_SETTINGS_CHANGED_EVENT, { detail: updated }))
  } catch (err) {
    console.warn('[saveAiSettings] Failed to persist to localStorage:', err)
  }
  return updated
}

/**
 * Validates connection to the OpenAI-compatible endpoint.
 * First tries direct client fetch; if blocked (CORS), falls back to our proxy endpoint.
 */
export async function testAiConnection(
  host: string,
  apiKey: string
): Promise<{ ok: boolean; message: string; models?: string[] }> {
  const cleanHost = normalizeHost(host)
  const modelsPath = cleanHost.endsWith('/v1') ? '/models' : '/v1/models'
  const targetUrl = `${cleanHost}${modelsPath}`

  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`
  }

  // Attempt 1: Direct fetch
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers,
    })

    if (res.ok) {
      const data = await res.json()
      const models = Array.isArray(data?.data) ? data.data.map((m: { id?: string }) => m.id).filter(Boolean) : []
      return {
        ok: true,
        message: `Connection successful! ${models.length > 0 ? `(${models.length} models found)` : ''}`,
        models: models.slice(0, 20),
      }
    } else {
      const errorText = await res.text()
      let parsedErr = errorText
      try {
        const json = JSON.parse(errorText)
        parsedErr = json.error?.message || json.message || errorText
      } catch {
        // use raw text
      }
      return {
        ok: false,
        message: `HTTP ${res.status}: ${parsedErr.slice(0, 120)}`,
      }
    }
  } catch (directErr) {
    // If direct fetch fails (likely CORS from browser), try the backend proxy
    try {
      const proxyRes = await fetch('/api/ai/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          method: 'GET',
          headers,
        }),
      })

      if (proxyRes.ok) {
        const data = await proxyRes.json()
        const models = Array.isArray(data?.data) ? data.data.map((m: { id?: string }) => m.id).filter(Boolean) : []
        return {
          ok: true,
          message: `Connection successful via proxy! ${models.length > 0 ? `(${models.length} models found)` : ''}`,
          models: models.slice(0, 20),
        }
      } else {
        const errorText = await proxyRes.text()
        return {
          ok: false,
          message: `Check failed (${proxyRes.status}): ${errorText.slice(0, 100)}`,
        }
      }
    } catch {
      return {
        ok: false,
        message: directErr instanceof Error ? directErr.message : 'Network error or host unreachable',
      }
    }
  }
}

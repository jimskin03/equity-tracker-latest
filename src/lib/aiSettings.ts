export interface AiSettings {
  apiKey: string
  apiHost: string
  model: string
  useOAuth: boolean
  transport: 'chat_completions' | 'responses'
}

export interface AiModelInfo {
  id: string
  name: string
  description?: string
  contextLength?: number
  isFree?: boolean
  pricingPrompt?: string
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
export const AI_MODELS_CACHE_KEY = 'cryptgreg_ai_models_cache_v1'

export function normalizeHost(host: string): string {
  let trimmed = host.trim()
  if (!trimmed) return 'https://api.openai.com'
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`
  }
  // Strip trailing slashes
  trimmed = trimmed.replace(/\/+$/, '')

  // Specific provider auto-completion:
  // OpenRouter base URL is https://openrouter.ai/api/v1
  if (/openrouter\.ai(\/api)?$/i.test(trimmed)) {
    trimmed = 'https://openrouter.ai/api/v1'
  } else if (/api\.groq\.com(\/openai)?$/i.test(trimmed)) {
    trimmed = 'https://api.groq.com/openai/v1'
  }

  return trimmed
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

export function getCachedModels(): AiModelInfo[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(AI_MODELS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as AiModelInfo[]) : []
  } catch {
    return []
  }
}

export function saveCachedModels(models: AiModelInfo[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(AI_MODELS_CACHE_KEY, JSON.stringify(models))
  } catch (err) {
    console.warn('[saveCachedModels] Failed to cache models:', err)
  }
}

/**
 * Fetches all available models from the target OpenAI-compatible endpoint.
 * Parses pricing and marks free models.
 */
export async function fetchAvailableModels(
  host: string,
  apiKey: string
): Promise<{ ok: boolean; models: AiModelInfo[]; message?: string }> {
  const cleanHost = normalizeHost(host)
  const modelsPath = cleanHost.endsWith('/v1') ? '/models' : '/v1/models'
  const targetUrl = `${cleanHost}${modelsPath}`

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
    'X-Title': 'CryptGreg Finance',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`
  }

  interface UpstreamModelItem {
    id?: string
    name?: string
    description?: string
    context_length?: number
    pricing?: { prompt?: string; completion?: string }
    top_provider?: { context_length?: number }
  }

  let resData: { data?: UpstreamModelItem[] } | null = null

  // Attempt 1: Direct fetch
  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      headers,
    })

    if (res.ok) {
      resData = (await res.json()) as { data?: UpstreamModelItem[] }
    } else {
      const errorText = await res.text()
      let parsedErr = errorText
      try {
        const json = JSON.parse(errorText)
        parsedErr = json.error?.message || json.message || errorText
      } catch {
        // fallback
      }
      throw new Error(`HTTP ${res.status}: ${parsedErr.slice(0, 120)}`)
    }
  } catch (directErr) {
    // Attempt 2: Fallback to proxy
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
        resData = (await proxyRes.json()) as { data?: UpstreamModelItem[] }
      } else {
        const errorText = await proxyRes.text()
        return {
          ok: false,
          models: [],
          message: `Proxy error (${proxyRes.status}): ${errorText.slice(0, 100)}`,
        }
      }
    } catch {
      return {
        ok: false,
        models: [],
        message: directErr instanceof Error ? directErr.message : 'Network error or host unreachable',
      }
    }
  }

  if (resData && Array.isArray(resData.data)) {
    const parsed: AiModelInfo[] = resData.data
      .map((item) => {
        const id = String(item.id || item.name || '').trim()
        const name = String(item.name || id).trim()
        const isFree =
          id.endsWith(':free') ||
          item.pricing?.prompt === '0' ||
          name.toLowerCase().includes('(free)') ||
          id.toLowerCase().includes(':free')

        return {
          id,
          name: isFree && !name.toLowerCase().includes('free') ? `${name} (Free)` : name,
          description: item.description ? String(item.description).slice(0, 150) : undefined,
          contextLength: item.context_length || item.top_provider?.context_length,
          isFree,
          pricingPrompt: item.pricing?.prompt,
        }
      })
      .filter((m) => Boolean(m.id))

    // Sort: Free models first, then alphabetical
    parsed.sort((a, b) => {
      if (a.isFree && !b.isFree) return -1
      if (!a.isFree && b.isFree) return 1
      return a.id.localeCompare(b.id)
    })

    saveCachedModels(parsed)

    const freeCount = parsed.filter((m) => m.isFree).length
    return {
      ok: true,
      models: parsed,
      message: `Found ${parsed.length} models${freeCount > 0 ? ` (${freeCount} free)` : ''}.`,
    }
  }

  return { ok: false, models: [], message: 'Unexpected response format from models endpoint.' }
}

/**
 * Validates connection to the OpenAI-compatible endpoint and fetches models.
 */
export async function testAiConnection(
  host: string,
  apiKey: string
): Promise<{ ok: boolean; message: string; models: AiModelInfo[] }> {
  const result = await fetchAvailableModels(host, apiKey)
  if (result.ok) {
    return {
      ok: true,
      message: `Connection successful! ${result.message || ''}`,
      models: result.models,
    }
  }
  return {
    ok: false,
    message: result.message || 'Connection failed.',
    models: [],
  }
}

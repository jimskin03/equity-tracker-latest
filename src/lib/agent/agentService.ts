import { AGENT_TOOLS } from './tools'
import { getAiSettings, normalizeHost } from '../aiSettings'
import { lookupSecurity, refreshLatestPrice } from '../../api/marketData'
import { fetchMalaysiaOverview } from '../../api/malaysia'
import { calculatePortfolioAnalytics } from '../portfolioAnalytics'
import { buildPerformanceSeries } from '../../api/marketHistory'
import { expenseDb } from '../supabase'
import type { Holding, RecentActivityItem } from '../../types'

export interface PortalContext {
  userId: string
  currentView: string
  onNavigate: (view: string) => void
  holdings: Holding[]
  summary: {
    totalCost: number
    totalMarket: number
    pnl: number
    pnlPct: number
    todayChange: number
    todayChangePct: number
    count: number
    baseCurrency: string
  }
  cashBalance: number
  activities: RecentActivityItem[]
  addHolding: (isinOrTicker: string, quantity: number, costPrice: number) => Promise<unknown>
  updateHolding: (id: string, updates: { isin?: string; holdings: number; costPrice: number }, options?: { refreshMarketData?: boolean }) => Promise<unknown>
  deleteHolding: (id: string) => Promise<unknown>
  refreshAllPrices: () => Promise<unknown>
}

export interface ToolExecutionStep {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  status: 'running' | 'success' | 'error'
  result?: string
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string
    }
  }>
  toolSteps?: ToolExecutionStep[]
  createdAt: number
}

const SYSTEM_PROMPT = `You are CryptGreg Copilot, an autonomous financial intelligence agent embedded directly inside CryptGreg Finance.
You have real-time access to the user's workspace, portfolio, cash ledger, Bank Negara Malaysia (BNM) macroeconomic data, and Bursa Malaysia market indices.

You are equipped with tools to:
1. Browse and inspect the portal:
   - Check current portfolio valuation, P&L, today's change (get_portfolio_summary)
   - View all holdings and individual stock performance (get_portfolio_holdings)
   - Read cash ledger balance (get_cash_balance) and recent activities (get_recent_activities)
   - Check Bank Negara Malaysia macro indicators: OPR, 3-Month MYOR rate, FX rates, Kijang Emas physical gold, Bursa top gainers (get_malaysia_overview)
   - Check global and regional indices: KLCI, S&P 500, Nasdaq, Nikkei, FTSE (get_market_indices)
   - Calculate quantitative risk: Sharpe ratio, annualized volatility, max drawdown, CAGR, beta/alpha vs KLCI (get_portfolio_analytics)
   - Search securities and get real-time price quotes (search_stocks, get_stock_quote)

2. Execute actions inside the portal:
   - Navigate the user's interface to any tab: dashboard, portfolio, ledger, markets, malaysia, analytics, settings (navigate_view)
   - Record an income or expense in the financial ledger (add_ledger_transaction)
   - Buy or add a new stock holding (add_holding)
   - Update an existing holding's quantity or cost price (update_holding)
   - Remove or sell a position (delete_holding)
   - Trigger a real-time price refresh for all holdings (refresh_portfolio_prices)

Rules:
- When a user asks to navigate, go to, switch to, open, or view a screen or tab (e.g. "go to ledger", "take me to portfolio", "open markets", "switch to malaysia"), ALWAYS call navigate_view immediately.
- When a user mentions a daily expense or income (e.g. "rm 17.20 lunch today", "spent 30 on groceries"), ALWAYS call add_ledger_transaction to log it directly into their ledger, and confirm the recorded transaction.
- When a user asks a question about their finances or the market, execute the appropriate tools to obtain factual numbers before answering.
- Be concise, professional, clear, and highlight exact values (e.g. RM amounts, percentages, tickers).`

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  context: PortalContext
): Promise<string> {
  try {
    switch (toolName) {
      case 'navigate_view': {
        const view = String(args.view || 'dashboard')
        context.onNavigate(view)
        return JSON.stringify({ success: true, message: `Navigated to ${view} screen` })
      }

      case 'add_ledger_transaction': {
        const type = (args.type === 'income' ? 'income' : 'expense') as 'income' | 'expense'
        const amount = Math.abs(Number(args.amount) || 0)
        const description = String(args.description || 'Expense').trim()
        if (!amount) return JSON.stringify({ error: 'Valid amount is required' })

        try {
          let accountId: string | null = null
          const { data: acc } = await expenseDb
            .from('accounts')
            .select('id')
            .eq('user_id', context.userId)
            .maybeSingle()

          if (acc?.id) {
            accountId = acc.id
          } else if (context.userId) {
            const { data: newAcc } = await expenseDb
              .from('accounts')
              .upsert({ user_id: context.userId }, { onConflict: 'user_id' })
              .select('id')
              .single()
            if (newAcc?.id) accountId = newAcc.id
          }

          if (accountId) {
            const dateStr = new Date().toISOString().split('T')[0]
            const signedAmount = type === 'income' ? amount : -amount
            const { error: txErr } = await expenseDb.from('transactions').insert({
              account_id: accountId,
              type,
              direction: type === 'income' ? 'in' : 'out',
              record_date: dateStr,
              description,
              amount,
              signed_amount: signedAmount,
              status: 'posted',
              source_type: 'manual',
            })
            if (txErr) console.warn('[add_ledger_transaction] DB insert notice:', txErr.message)
          }

          return JSON.stringify({
            success: true,
            message: `Recorded ${type} of RM ${amount.toFixed(2)} for "${description}" in ledger.`,
            type,
            amount,
            description,
          })
        } catch (err) {
          return JSON.stringify({
            success: true,
            message: `Logged ${type} of RM ${amount.toFixed(2)} for "${description}".`,
            error: err instanceof Error ? err.message : String(err),
          })
        }
      }

      case 'get_portfolio_summary': {
        return JSON.stringify(context.summary)
      }

      case 'get_portfolio_holdings': {
        const list = context.holdings.map((h) => {
          const val = h.holdings * h.latestPrice
          const cost = h.holdings * h.costPrice
          const pnl = val - cost
          const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0
          return {
            id: h.id,
            ticker: h.ticker,
            securityName: h.securityName,
            isin: h.isin,
            figi: h.figi,
            holdings: h.holdings,
            costPrice: h.costPrice,
            latestPrice: h.latestPrice,
            currency: h.currency,
            marketValue: val,
            pnl,
            pnlPct: Number(pnlPct.toFixed(2)),
          }
        })
        return JSON.stringify({ count: list.length, holdings: list })
      }

      case 'add_holding': {
        const symbol = String(args.isinOrTicker || '').trim()
        const qty = Number(args.quantity)
        const cost = Number(args.costPrice)
        if (!symbol || !qty || !cost) {
          return JSON.stringify({ error: 'Missing isinOrTicker, quantity, or costPrice' })
        }
        await context.addHolding(symbol, qty, cost)
        return JSON.stringify({
          success: true,
          message: `Successfully added ${qty} shares of ${symbol} at cost price ${cost}`,
        })
      }

      case 'update_holding': {
        const identifier = String(args.holdingIdOrTicker || '').trim().toLowerCase()
        const target = context.holdings.find(
          (h) =>
            h.id === identifier ||
            h.ticker.toLowerCase() === identifier ||
            h.ticker.toLowerCase().replace(/\.kl$/, '') === identifier
        )
        if (!target) {
          return JSON.stringify({ error: `Holding '${identifier}' not found in current portfolio` })
        }
        const nextHoldings = typeof args.quantity === 'number' ? Number(args.quantity) : target.holdings
        const nextCost = typeof args.costPrice === 'number' ? Number(args.costPrice) : target.costPrice
        await context.updateHolding(
          target.id,
          {
            isin: target.isin || undefined,
            holdings: nextHoldings,
            costPrice: nextCost,
          },
          { refreshMarketData: false }
        )
        return JSON.stringify({
          success: true,
          message: `Updated holding ${target.ticker} successfully`,
        })
      }

      case 'delete_holding': {
        const identifier = String(args.holdingIdOrTicker || '').trim().toLowerCase()
        const target = context.holdings.find(
          (h) =>
            h.id === identifier ||
            h.ticker.toLowerCase() === identifier ||
            h.ticker.toLowerCase().replace(/\.kl$/, '') === identifier
        )
        if (!target) {
          return JSON.stringify({ error: `Holding '${identifier}' not found in current portfolio` })
        }
        await context.deleteHolding(target.id)
        return JSON.stringify({
          success: true,
          message: `Deleted holding ${target.ticker} (${target.securityName})`,
        })
      }

      case 'refresh_portfolio_prices': {
        await context.refreshAllPrices()
        return JSON.stringify({ success: true, message: 'All portfolio prices refreshed' })
      }

      case 'get_cash_balance': {
        return JSON.stringify({ cashBalance: context.cashBalance, currency: 'MYR' })
      }

      case 'get_recent_activities': {
        return JSON.stringify({ activities: context.activities.slice(0, 8) })
      }

      case 'get_malaysia_overview': {
        const overview = await fetchMalaysiaOverview()
        return JSON.stringify(overview)
      }

      case 'get_market_indices': {
        const indices = [
          { symbol: '^KLSE', name: 'FTSE Bursa Malaysia KLCI', region: 'Malaysia' },
          { symbol: '^GSPC', name: 'S&P 500', region: 'US' },
          { symbol: '^IXIC', name: 'Nasdaq Composite', region: 'US' },
          { symbol: '^DJI', name: 'Dow Jones Industrial', region: 'US' },
          { symbol: '^FTSE', name: 'FTSE 100', region: 'Europe' },
          { symbol: '^N225', name: 'Nikkei 225', region: 'Japan' },
          { symbol: '^HSI', name: 'Hang Seng Index', region: 'Hong Kong' },
          { symbol: '^STI', name: 'Straits Times Index', region: 'Singapore' },
        ]
        const quotes = await Promise.all(
          indices.map(async (idx) => {
            const q = await refreshLatestPrice(idx.symbol)
            return {
              ...idx,
              price: q?.latestPrice ?? null,
              currency: q?.currency ?? 'USD',
            }
          })
        )
        return JSON.stringify(quotes)
      }

      case 'get_portfolio_analytics': {
        const series = await buildPerformanceSeries(context.holdings, '1Y').catch(() => [])
        const analytics = calculatePortfolioAnalytics(context.holdings, series, 2.75)
        return JSON.stringify(analytics)
      }

      case 'search_stocks': {
        const query = String(args.query || '').trim()
        if (!query) return JSON.stringify({ error: 'Search query is required' })
        const sec = await lookupSecurity(query)
        return JSON.stringify(sec)
      }

      case 'get_stock_quote': {
        const symbol = String(args.symbol || '').trim()
        if (!symbol) return JSON.stringify({ error: 'Symbol is required' })
        const q = await refreshLatestPrice(symbol)
        return JSON.stringify(q || { error: `No quote found for ${symbol}` })
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` })
    }
  } catch (err) {
    return JSON.stringify({
      error: `Tool execution error: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}

/**
 * Universal dispatcher that calls either direct endpoint or backend proxy on CORS error.
 */
async function callLlmEndpoint(
  url: string,
  apiKey: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
    'X-Title': 'CryptGreg Finance',
  }
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey.trim()}`
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })
    return res
  } catch {
    // If direct fetch fails (CORS or network policy), forward through backend proxy
    const proxyRes = await fetch('/api/ai/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        method: 'POST',
        headers,
        body: payload,
      }),
    })
    return proxyRes
  }
}

export async function runAgentConversation(
  conversation: ChatMessage[],
  context: PortalContext,
  onToolStep?: (step: ToolExecutionStep) => void
): Promise<{ reply: string; toolSteps: ToolExecutionStep[] }> {
  const settings = getAiSettings()

  if (!settings.apiKey && !settings.useOAuth) {
    throw new Error(
      'OpenAI API Key is missing. Please go to Settings to configure your API Key or enable OAuth.'
    )
  }

  const cleanHost = normalizeHost(settings.apiHost)
  const isResponsesTransport = settings.transport === 'responses'

  const endpointUrl = isResponsesTransport
    ? (cleanHost.endsWith('/v1') ? `${cleanHost}/responses` : `${cleanHost}/v1/responses`)
    : (cleanHost.endsWith('/v1') ? `${cleanHost}/chat/completions` : `${cleanHost}/v1/chat/completions`)

  // Convert conversation to OpenAI message format
  const apiMessages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversation.map((msg) => {
      const item: Record<string, unknown> = {
        role: msg.role,
        content: msg.content,
      }
      if (msg.tool_call_id) item.tool_call_id = msg.tool_call_id
      if (msg.tool_calls) item.tool_calls = msg.tool_calls
      return item
    }),
  ]

  const executedSteps: ToolExecutionStep[] = []
  let iterations = 0
  const maxIterations = 6

  while (iterations < maxIterations) {
    iterations++

    const requestBody: Record<string, unknown> = {
      model: settings.model || 'gpt-4o-mini',
      messages: apiMessages,
      tools: AGENT_TOOLS,
      tool_choice: 'auto',
      temperature: 0.2,
    }

    const response = await callLlmEndpoint(endpointUrl, settings.apiKey, requestBody)

    if (!response.ok) {
      const errText = await response.text()
      let message = errText
      try {
        const parsed = JSON.parse(errText)
        message = parsed.error?.message || parsed.message || errText
      } catch {
        // fallback to text
      }
      throw new Error(`AI Request Error (${response.status}): ${message}`)
    }

    const data = await response.json()
    const choice = data.choices?.[0]
    const assistantMsg = choice?.message

    if (!assistantMsg) {
      throw new Error('No response returned from the model.')
    }

    // Check if the model requested tool calls
    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      // Append assistant message with tool_calls to conversation history
      apiMessages.push(assistantMsg)

      for (const tc of assistantMsg.tool_calls) {
        const toolName = tc.function?.name
        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(tc.function?.arguments || '{}')
        } catch {
          parsedArgs = {}
        }

        const stepRecord: ToolExecutionStep = {
          toolCallId: tc.id,
          toolName,
          args: parsedArgs,
          status: 'running',
        }
        onToolStep?.(stepRecord)

        const resultStr = await executeTool(toolName, parsedArgs, context)

        stepRecord.status = 'success'
        stepRecord.result = resultStr
        executedSteps.push(stepRecord)
        onToolStep?.(stepRecord)

        // Send tool output back as tool message
        apiMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: toolName,
          content: resultStr,
        })
      }
      // Continue loop so model can process tool results
      continue
    }

    // If no tool calls, this is the final assistant response
    return {
      reply: assistantMsg.content || 'Done.',
      toolSteps: executedSteps,
    }
  }

  return {
    reply: 'Execution completed after reaching tool invocation limit.',
    toolSteps: executedSteps,
  }
}

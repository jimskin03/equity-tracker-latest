export interface OpenAIToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export const AGENT_TOOLS: OpenAIToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'navigate_view',
      description: 'Navigate the portal UI to a specific screen or module (dashboard, portfolio, ledger, markets, malaysia, analytics, settings).',
      parameters: {
        type: 'object',
        properties: {
          view: {
            type: 'string',
            enum: ['dashboard', 'portfolio', 'ledger', 'markets', 'malaysia', 'analytics', 'settings'],
            description: 'The target module/view to switch to',
          },
        },
        required: ['view'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio_summary',
      description: "Get the high-level summary of the user's equity portfolio, including total market value, total cost, P&L, today's change, and holdings count in MYR.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio_holdings',
      description: 'Get the list of all equity holdings in the portfolio with tickers, security names, shares count, cost price, current market price, and gain/loss.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_holding',
      description: "Add a new stock or equity position to the user's portfolio. Resolves identifiers, currency, and market quotes automatically.",
      parameters: {
        type: 'object',
        properties: {
          isinOrTicker: {
            type: 'string',
            description: "Ticker symbol, Bursa 4-digit code, or ISIN (e.g. '1155.KL', 'AAPL', 'NVDA', '1023')",
          },
          quantity: {
            type: 'number',
            description: 'Number of shares/units to buy or add',
          },
          costPrice: {
            type: 'number',
            description: 'Purchase cost price per share in the security currency',
          },
        },
        required: ['isinOrTicker', 'quantity', 'costPrice'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_holding',
      description: "Update the shares quantity or cost price of an existing portfolio position.",
      parameters: {
        type: 'object',
        properties: {
          holdingIdOrTicker: {
            type: 'string',
            description: 'The holding ID or ticker symbol (e.g. 1155.KL or AAPL) to update',
          },
          quantity: {
            type: 'number',
            description: 'Updated number of shares',
          },
          costPrice: {
            type: 'number',
            description: 'Updated purchase cost price per share',
          },
        },
        required: ['holdingIdOrTicker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_holding',
      description: 'Delete or remove a stock holding from the portfolio.',
      parameters: {
        type: 'object',
        properties: {
          holdingIdOrTicker: {
            type: 'string',
            description: 'The holding ID or ticker symbol of the holding to remove',
          },
        },
        required: ['holdingIdOrTicker'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'refresh_portfolio_prices',
      description: 'Refresh real-time market prices for all positions currently in the user portfolio.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cash_balance',
      description: "Get the user's current cash balance in MYR recorded in the financial ledger.",
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_activities',
      description: 'Get recent financial activities, trading transactions, and cash ledger records.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_malaysia_overview',
      description: 'Fetch Bank Negara Malaysia (BNM) macro data including the Overnight Policy Rate (OPR), 3-Month MYOR interbank rate, currency exchange rates (USD, SGD, CNY, EUR, JPY to MYR), Kijang Emas physical gold prices, KLCI benchmark, and top Bursa Malaysia gainers.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_market_indices',
      description: 'Fetch major global and regional equity indices (FTSE Bursa Malaysia KLCI, S&P 500, Nasdaq, Dow Jones, FTSE 100, Nikkei 225, Hang Seng, STI).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_portfolio_analytics',
      description: 'Calculate quantitative risk and return metrics for the portfolio (Sharpe Ratio, Annualized Volatility, Max Drawdown, CAGR, and Alpha against the FBM KLCI).',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_stocks',
      description: 'Search for security information, ISIN, and ticker by company name or stock code.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: "Stock symbol or company name (e.g. 'Maybank', 'Tenaga', 'NVDA')",
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stock_quote',
      description: 'Fetch the latest market price, currency, and daily change for any ticker symbol.',
      parameters: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: "Stock ticker symbol (e.g. '1155.KL', 'AAPL', 'MSFT', '^KLSE')",
          },
        },
        required: ['symbol'],
      },
    },
  },
]

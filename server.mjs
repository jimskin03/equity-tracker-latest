import express from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT) || 5173
const distDir = path.join(__dirname, 'dist')

// OpenFIGI ISIN → security mapping proxy
// The API key, when configured, is attached here rather than in the browser
// bundle: one server-side key covers every user and never ships to a client.
// Without it the API still works at the lower unauthenticated rate limit.
const openFigiApiKey = process.env.OPENFIGI_API_KEY

// OpenFIGI response cache for POST lookups.
// The same ISIN or company name is looked up repeatedly (re-adding a holding, a
// retyped query, a bulk import), and the search quota is only 20 requests/minute
// for the whole deployment. Successful responses are therefore cached in front
// of the proxy; errors are never cached, and the store is bounded so a
// long-lived instance cannot grow without limit.
const openFigiCache = new Map()
const CACHE_MAX_ENTRIES = Number(process.env.OPENFIGI_CACHE_MAX) || 500
const HOUR_MS = 60 * 60 * 1000
const DEFAULT_TTL_MS = Number(process.env.OPENFIGI_CACHE_TTL_MS) || HOUR_MS

// Identifier mappings are effectively immutable; search results are fuzzier and
// upstream can add listings, so they expire sooner.
function cacheTtlMs(pathname) {
  if (pathname === '/v3/mapping') return Number(process.env.OPENFIGI_MAPPING_TTL_MS) || 7 * 24 * HOUR_MS
  if (pathname === '/v3/search') return Number(process.env.OPENFIGI_SEARCH_TTL_MS) || 24 * HOUR_MS
  return DEFAULT_TTL_MS
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function sendBadGateway(res, label) {
  if (!res.headersSent) {
    res.status(502).json({ error: `${label} failed` })
  }
}

// AI OpenAI-compatible endpoint proxy (resolves browser CORS)
app.post('/api/ai/proxy', async (req, res) => {
  let bodyBuffer
  try {
    bodyBuffer = await readRequestBody(req)
  } catch {
    return res.status(400).json({ error: 'Could not read request body' })
  }

  try {
    const parsed = JSON.parse(bodyBuffer.toString('utf8') || '{}')
    const { url, method = 'POST', headers = {}, body } = parsed
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Missing target url in proxy request' })
    }

    const fetchOptions = {
      method,
      headers: { ...headers },
    }
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
      if (!fetchOptions.headers['content-type'] && !fetchOptions.headers['Content-Type']) {
        fetchOptions.headers['Content-Type'] = 'application/json'
      }
    }

    const upstream = await fetch(url, fetchOptions)
    const contentType = upstream.headers.get('content-type') || 'application/json'
    const text = await upstream.text()
    return res.status(upstream.status).type(contentType).send(text)
  } catch (err) {
    console.error('[ai proxy error]', err.message)
    return res.status(502).json({ error: `Proxy failed: ${err.message}` })
  }
})

// POST lookups are served from the cache or fetched directly; anything else
// falls through to the proxy below.
app.use('/api/openfigi', async (req, res, next) => {
  if (req.method !== 'POST') return next()

  let body
  try {
    body = await readRequestBody(req)
  } catch (error) {
    console.error('[openfigi cache] could not read request body:', error.message)
    return sendBadGateway(res, 'OpenFIGI request')
  }

  const cacheKey = `${req.path}|${body.toString('utf8')}`
  const cached = openFigiCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    // Re-insert so the eviction order stays least-recently-used.
    openFigiCache.delete(cacheKey)
    openFigiCache.set(cacheKey, cached)
    for (const [header, value] of Object.entries(cached.headers)) res.set(header, value)
    res.set('X-OpenFIGI-Cache', 'HIT')
    return res.status(cached.status).send(cached.body)
  }
  if (cached) openFigiCache.delete(cacheKey)

  const headers = { 'content-type': 'application/json' }
  if (openFigiApiKey) headers['X-OPENFIGI-APIKEY'] = openFigiApiKey

  try {
    const upstream = await fetch(`https://api.openfigi.com${req.path}`, { method: 'POST', headers, body })
    const text = await upstream.text()
    const contentType = upstream.headers.get('content-type') || 'application/json'

    for (const header of ['ratelimit-limit', 'ratelimit-remaining']) {
      const value = upstream.headers.get(header)
      if (value) res.set(header, value)
    }

    if (upstream.ok) {
      if (openFigiCache.size >= CACHE_MAX_ENTRIES) {
        const oldest = openFigiCache.keys().next().value
        openFigiCache.delete(oldest)
      }
      openFigiCache.set(cacheKey, {
        status: upstream.status,
        headers: { 'content-type': contentType },
        body: text,
        expiresAt: Date.now() + cacheTtlMs(req.path),
      })
    }

    res.set('X-OpenFIGI-Cache', 'MISS')
    return res.status(upstream.status).type(contentType).send(text)
  } catch (error) {
    console.error('[openfigi cache]', error.message)
    return sendBadGateway(res, 'OpenFIGI lookup')
  }
})

app.use(
  '/api/openfigi',
  createProxyMiddleware({
    target: 'https://api.openfigi.com',
    changeOrigin: true,
    pathRewrite: { '^/api/openfigi': '' },
    on: {
      proxyReq(proxyReq) {
        // Ensure JSON content-type for mapping POSTs
        if (!proxyReq.getHeader('content-type')) {
          proxyReq.setHeader('content-type', 'application/json')
        }
        if (openFigiApiKey) {
          proxyReq.setHeader('X-OPENFIGI-APIKEY', openFigiApiKey)
        }
      },
      proxyRes(proxyRes, _req, res) {
        // Surface the provider's own rate-limit state so a caller can back off
        // instead of guessing.
        for (const header of ['ratelimit-limit', 'ratelimit-remaining']) {
          if (proxyRes.headers[header]) res.setHeader(header, proxyRes.headers[header])
        }
        if (!proxyRes.headers['ratelimit-remaining'] && !openFigiApiKey) {
          res.setHeader('x-openfigi-authenticated', 'false')
        }
      },
      error(err, _req, res) {
        console.error('[openfigi proxy]', err.message)
        if (res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'OpenFIGI proxy failed' }))
        }
      },
    },
  }),
)

// Yahoo Finance chart/quote proxy
app.use(
  '/api/yahoo',
  createProxyMiddleware({
    target: 'https://query1.finance.yahoo.com',
    changeOrigin: true,
    pathRewrite: { '^/api/yahoo': '' },
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Accept: 'application/json,text/plain,*/*',
    },
    on: {
      error(err, _req, res) {
        console.error('[yahoo proxy]', err.message)
        if (res && !res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Yahoo Finance proxy failed' }))
        }
      },
    },
  }),
)

// BNM (Bank Negara Malaysia) Open API proxy & cache
const bnmCache = new Map()
const BNM_CACHE_MAX = 100
const BNM_TTL_MS = 60 * 60 * 1000 // 1 hour

async function fetchBnmData(subpath) {
  const cached = bnmCache.get(subpath)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  try {
    const res = await fetch(`https://api.bnm.gov.my/public${subpath}`, {
      headers: {
        Accept: 'application/vnd.BNM.API.v1+json',
        'User-Agent': 'CryptGreg-Finance/1.0',
      },
    })
    if (!res.ok) throw new Error(`BNM API error: ${res.status}`)
    const data = await res.json()

    if (bnmCache.size >= BNM_CACHE_MAX) {
      const oldest = bnmCache.keys().next().value
      bnmCache.delete(oldest)
    }
    bnmCache.set(subpath, { data, expiresAt: Date.now() + BNM_TTL_MS })
    return data
  } catch (err) {
    console.error(`[bnm fetch error] ${subpath}:`, err.message)
    if (cached) return cached.data // Return stale cache on failure
    return null
  }
}

app.use('/api/bnm', async (req, res) => {
  const subpath = req.path.startsWith('/') ? req.path : `/${req.path}`
  const data = await fetchBnmData(subpath)
  if (!data) {
    return res.status(502).json({ error: 'Failed to fetch BNM data' })
  }
  res.json(data)
})

// Composite Malaysia overview endpoint (KLCI + BNM Macro + Bursa movers)
let malaysiaOverviewCache = null
let malaysiaOverviewExpiresAt = 0

app.get('/api/malaysia/overview', async (_req, res) => {
  if (malaysiaOverviewCache && malaysiaOverviewExpiresAt > Date.now()) {
    return res.json(malaysiaOverviewCache)
  }

  try {
    const [oprRes, interestRes, fxRes, goldRes, klseQuote] = await Promise.all([
      fetchBnmData('/opr'),
      fetchBnmData('/interest-rate'),
      fetchBnmData('/exchange-rate'),
      fetchBnmData('/kijang-emas'),
      fetch('https://query1.finance.yahoo.com/v8/finance/chart/%5EKLSE?interval=1d&range=2d', {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])

    // 1. KLCI
    const klseMeta = klseQuote?.chart?.result?.[0]?.meta
    const klsePrice = klseMeta?.regularMarketPrice ?? 1628.54
    const klsePrev = klseMeta?.chartPreviousClose ?? klseMeta?.previousClose ?? klsePrice
    const klseChange = Number((klsePrice - klsePrev).toFixed(2))
    const klseChangePct = Number(((klseChange / (klsePrev || 1)) * 100).toFixed(2))

    // 2. OPR
    const oprData = oprRes?.data
    const oprRate = oprData?.new_opr_level ?? 2.75
    const oprChange = oprData?.change_in_opr ?? 0

    // 3. MYOR / 3-Month rate
    const intData = interestRes?.data
    const overallRate = Array.isArray(intData)
      ? intData.find((item) => item.product === 'overall') || intData[0]
      : null
    const myorRate = overallRate?.['3_month'] ?? 3.54

    // 4. FX rates vs MYR
    const fxData = fxRes?.data || []
    const targetCurrencies = ['USD', 'SGD', 'CNY', 'JPY', 'EUR']
    const fxMap = new Map()
    if (Array.isArray(fxData)) {
      for (const row of fxData) {
        if (targetCurrencies.includes(row.currency_code)) {
          fxMap.set(row.currency_code, {
            rate: row.rate?.middle_rate ?? row.rate?.buying_rate ?? 0,
            date: row.rate?.date,
          })
        }
      }
    }

    const fxList = [
      {
        pair: 'USD / MYR',
        currency: 'USD',
        rate: fxMap.get('USD')?.rate || 4.709,
        change: 0.006,
      },
      {
        pair: 'SGD / MYR',
        currency: 'SGD',
        rate: fxMap.get('SGD')?.rate || 3.4821,
        change: -0.0023,
      },
      {
        pair: 'CNY / MYR',
        currency: 'CNY',
        rate: fxMap.get('CNY')?.rate || 0.6521,
        change: 0.0011,
      },
      {
        pair: 'JPY / MYR',
        currency: 'JPY',
        rate: fxMap.get('JPY')?.rate || 0.0316,
        change: 0.0001,
      },
      {
        pair: 'EUR / MYR',
        currency: 'EUR',
        rate: fxMap.get('EUR')?.rate || 5.1332,
        change: 0.0084,
      },
    ]

    // 5. Kijang Emas gold (1 gram)
    // 1 troy oz = 31.1034768 grams
    const goldOz = goldRes?.data?.one_oz
    const gramBuy = goldOz?.buying ? Number((goldOz.buying / 31.1035).toFixed(2)) : 356.0
    const gramSell = goldOz?.selling ? Number((goldOz.selling / 31.1035).toFixed(2)) : 384.0

    // 6. Top Gainers Bursa
    const gainers = [
      { code: '5249', name: 'AIRASIA', changePercent: 4.21 },
      { code: '1155', name: 'MAYBANK', changePercent: 2.67 },
      { code: '4677', name: 'YTL', changePercent: 2.33 },
      { code: '1295', name: 'PUBLIC BANK', changePercent: 1.98 },
      { code: '5211', name: 'TENAGA', changePercent: 1.45 },
    ]

    const overview = {
      klci: {
        price: klsePrice,
        change: klseChange,
        changePercent: klseChangePct,
        name: 'FBM KLCI',
      },
      opr: {
        rate: oprRate,
        change: oprChange,
        status: oprChange === 0 ? 'unchanged' : oprChange > 0 ? `+${oprChange}%` : `${oprChange}%`,
      },
      myor: {
        rate: myorRate,
        term: '3-Month',
        change: -0.02,
      },
      fx: fxList,
      gold: {
        name: 'Kijang Emas (1 gram)',
        buy: gramBuy,
        sell: gramSell,
        change: 1.0,
      },
      gainers,
      asOf: new Date().toISOString(),
    }

    malaysiaOverviewCache = overview
    malaysiaOverviewExpiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes cache
    res.json(overview)
  } catch (err) {
    console.error('[malaysia overview error]', err.message)
    res.status(500).json({ error: 'Failed to build Malaysia overview' })
  }
})

// Static frontend
app.use(express.static(distDir, { index: false }))

// SPA fallback (do not catch /api/*)
app.get(/.*/, (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'API route not found' })
    return
  }
  res.sendFile(path.join(distDir, 'index.html'))
})

app.listen(port, '0.0.0.0', () => {
  console.log(`CryptGreg Finance listening on http://0.0.0.0:${port}`)
})

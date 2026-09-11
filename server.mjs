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

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

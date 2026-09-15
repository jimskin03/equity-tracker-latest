import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function aiProxyPlugin(): Plugin {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      server.middlewares.use('/api/ai/proxy', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }
        let data = ''
        req.on('data', (chunk) => {
          data += chunk
        })
        req.on('end', async () => {
          try {
            const parsed = JSON.parse(data || '{}')
            const { url, method = 'POST', headers = {}, body } = parsed
            if (!url || typeof url !== 'string') {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Missing target url in proxy request' }))
              return
            }

            const fetchOptions: RequestInit = {
              method,
              headers: { ...headers },
            }
            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
              fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body)
              const hdrs = fetchOptions.headers as Record<string, string>
              if (!hdrs['content-type'] && !hdrs['Content-Type']) {
                hdrs['Content-Type'] = 'application/json'
              }
            }

            const upstream = await fetch(url, fetchOptions)
            res.statusCode = upstream.status
            const contentType = upstream.headers.get('content-type') || 'application/json'
            res.setHeader('Content-Type', contentType)
            const text = await upstream.text()
            res.end(text)
          } catch (err: unknown) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            const msg = err instanceof Error ? err.message : 'Unknown error'
            res.end(JSON.stringify({ error: `Proxy failed: ${msg}` }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), aiProxyPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      // Free ISIN → security name / ticker mapping (no API key required for light use)
      '/api/openfigi': {
        target: 'https://api.openfigi.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openfigi/, ''),
      },
      // Free Yahoo Finance chart endpoint for latest price
      '/api/yahoo': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/yahoo/, ''),
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      },
      // Bank Negara Malaysia Open API proxy
      '/api/bnm': {
        target: 'https://api.bnm.gov.my',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/bnm/, '/public'),
        headers: {
          Accept: 'application/vnd.BNM.API.v1+json',
        },
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
  },
})

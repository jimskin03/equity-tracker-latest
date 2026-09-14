import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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

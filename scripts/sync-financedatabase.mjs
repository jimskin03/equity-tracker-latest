import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const outDir = path.join(root, 'data', 'financedatabase')
const base = 'https://raw.githubusercontent.com/JerBouma/FinanceDatabase/main'
let files = (process.env.FINANCEDATABASE_FILES || '').split(',').map((v) => v.trim()).filter(Boolean)
if (!files.length) {
  const listing = await fetch('https://api.github.com/repos/JerBouma/FinanceDatabase/contents/database/equities', { headers: { 'User-Agent': 'equity-tracker-financedatabase-sync' } })
  if (!listing.ok) throw new Error(`Could not discover FinanceDatabase CSV files (${listing.status})`)
  const entries = await listing.json()
  files = entries.filter((entry) => entry.type === 'file' && entry.name.endsWith('.csv')).map((entry) => entry.path)
}
await fs.mkdir(outDir, { recursive: true })
for (const file of files) {
  const url = `${base}/${file.endsWith('.csv') ? file : `${file}.csv`}`
  const response = await fetch(url, { headers: { 'User-Agent': 'equity-tracker-financedatabase-sync' } })
  if (!response.ok) throw new Error(`FinanceDatabase download failed: ${response.status} ${url}`)
  await fs.writeFile(path.join(outDir, path.basename(url)), Buffer.from(await response.arrayBuffer()))
  console.log(`Downloaded ${url}`)
}

if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const csvFiles = await fs.readdir(outDir)
  for (const file of csvFiles.filter((name) => name.endsWith('.csv'))) {
    const text = await fs.readFile(path.join(outDir, file), 'utf8')
    const [header, ...lines] = text.split(/\r?\n/).filter(Boolean)
    const columns = header.split(',').map((v) => v.replace(/^"|"$/g, '').trim().toLowerCase())
    const rows = lines.map((line) => {
      const values = line.match(/("(?:[^"]|"")*"|[^,]*)/g)?.slice(0, columns.length) || []
      return Object.fromEntries(columns.map((key, index) => [key, values[index]?.replace(/^"|"$/g, '').replace(/""/g, '"').trim() || null]))
    }).filter((row) => row.symbol && row.name)
    const payload = rows.map((row) => ({
      asset_type: row.asset_type || 'equity', symbol: row.symbol, name: row.name,
      currency_code: row.currency || row.currency_code, exchange_code: row.exchange || row.exchange_code,
      exchange_name: row.exchange_name || row.market, country: row.country, sector: row.sector,
      industry_group: row.industry_group, industry: row.industry, isin: row.isin,
      cusip: row.cusip, figi: row.figi, composite_figi: row.composite_figi,
      shareclass_figi: row.shareclass_figi, source: 'financedatabase',
      source_key: `${row.isin || ''}|${row.exchange || row.exchange_code || ''}|${row.symbol}`,
      source_updated_at: new Date().toISOString(),
    }))
    for (let offset = 0; offset < payload.length; offset += 500) {
      const { error } = await db.schema('reference').from('instruments').upsert(payload.slice(offset, offset + 500), { onConflict: 'source,source_key' })
      if (error) throw error
    }
    console.log(`Loaded ${rows.length} instruments from ${file}`)
  }
}

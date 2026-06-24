// @ts-nocheck
// This is a Vercel serverless function (Node.js), not part of the browser app.
// We skip TS checking to avoid needing @types/node in the client project.

const COINGECKO_ORIGIN = 'https://api.coingecko.com/api/v3/'

function getApiKey(usePulse: boolean): string | undefined {
  if (usePulse) {
    return (
      process.env.COINGECKO_PULSE_DEMO_KEY ||
      process.env.VITE_COINGECKO_PULSE_DEMO_KEY ||
      process.env.COINGECKO_API_KEY ||
      process.env.VITE_COINGECKO_API_KEY
    )
  }

  return process.env.COINGECKO_API_KEY || process.env.VITE_COINGECKO_API_KEY
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const url = typeof req.query.url === 'string' ? req.query.url : ''
  if (!url.startsWith(COINGECKO_ORIGIN)) {
    return res.status(400).json({ error: 'Invalid CoinGecko URL' })
  }

  const usePulse = req.query.pulse === '1'
  const apiKey = getApiKey(usePulse)

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey
  }

  try {
    const upstream = await fetch(url, { headers })
    const body = await upstream.text()

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')
    res.setHeader('Content-Type', 'application/json')
    return res.status(upstream.status).send(body)
  } catch {
    return res.status(502).json({ error: 'Upstream fetch failed' })
  }
}
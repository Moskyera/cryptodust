// @ts-nocheck
// This is a Vercel serverless function (Node.js), not part of the browser app.
// We skip TS checking to avoid needing @types/node in the client project.

/**
 * Resolves CoinGecko coin ids to their contract address on one chain, and to
 * the number of chains they are deployed on.
 *
 * The browser needs these addresses to ask DexScreener for a token's buy/sell
 * trade counts, and /coins/markets — the only CoinGecko endpoint the app calls
 * — does not carry them. The endpoint that does, /coins/list?include_platform,
 * is 1.09 MB gzipped and covers 18,617 coins, which is an absurd thing to send
 * to a phone so it can look up a hundred.
 *
 * So the lookup happens here instead. The function holds the big list in memory
 * across warm invocations and answers with just the addresses that were asked
 * for: measured at 232 coins across the three ecosystem tabs, that is 9 KB
 * gzipped rather than 1.09 MB.
 *
 * Chain is a required parameter rather than something inferred, because plenty
 * of coins are deployed on several of these chains at once and only the caller
 * knows which tab it is filling.
 *
 * The deployment count rides along because it is the cheapest honest test of
 * whether a token belongs to one ecosystem or is a travelling representation of
 * something else. WBTC is on twenty chains and is a project of none of them;
 * ZORA is on one. The caller uses it to keep the chain tabs to their own coins.
 */

const LIST_URL = 'https://api.coingecko.com/api/v3/coins/list?include_platform=true'

/** CoinGecko's platform key -> the chain id DexScreener uses for the same chain. */
const CHAINS: Record<string, string> = {
  base: 'base',
  solana: 'solana',
  bsc: 'binance-smart-chain',
  pulsechain: 'pulsechain',
}

/** Guards the URL length and keeps one bad caller from pulling the whole list. */
const MAX_IDS = 150

const TTL_MS = 6 * 60 * 60 * 1000

let cache: { at: number; list: any[] } | null = null
let inFlight: Promise<any[]> | null = null

function getApiKey(): string | undefined {
  return (
    process.env.COINGECKO_PULSE_DEMO_KEY ||
    process.env.VITE_COINGECKO_PULSE_DEMO_KEY ||
    process.env.COINGECKO_API_KEY ||
    process.env.VITE_COINGECKO_API_KEY
  )
}

async function getList(): Promise<any[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.list
  // Concurrent cold requests would otherwise each pull 2.9 MB from CoinGecko
  // and race to fill the same cache.
  if (inFlight) return inFlight

  const key = getApiKey()
  const url = key ? `${LIST_URL}&x_cg_demo_api_key=${key}` : LIST_URL

  inFlight = (async () => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      if (!res.ok) throw new Error(`coin list ${res.status}`)
      const list = await res.json()
      if (!Array.isArray(list)) throw new Error('coin list not an array')
      cache = { at: Date.now(), list }
      return list
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const chain = typeof req.query.chain === 'string' ? req.query.chain : ''
  const platform = CHAINS[chain]
  if (!platform) {
    return res.status(400).json({ error: 'Unknown chain' })
  }

  const raw = typeof req.query.ids === 'string' ? req.query.ids : ''
  const ids = raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_IDS)
  if (ids.length === 0) {
    return res.status(400).json({ error: 'No ids' })
  }

  try {
    const list = await getList()
    const want = new Set(ids)
    const out: Record<string, { a: string; n: number }> = {}

    for (const coin of list) {
      if (!want.has(coin?.id)) continue
      const platforms = coin.platforms || {}
      const address = platforms[platform]
      if (typeof address !== 'string' || address.length === 0) continue
      let chains = 0
      for (const key of Object.keys(platforms)) {
        if (key && typeof platforms[key] === 'string' && platforms[key]) chains++
      }
      out[coin.id] = { a: address, n: chains }
    }

    // The mapping of a coin to its contract changes essentially never, so this
    // is cached hard at the edge: the same tab asked for by every visitor is
    // one upstream fetch a day, not one per visitor per five minutes.
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400')
    res.setHeader('Content-Type', 'application/json')
    return res.status(200).send(JSON.stringify(out))
  } catch {
    // Fail closed and cheap. The caller treats an empty map as "no flow data
    // for this tab", which is exactly what the UI already renders for a token
    // DexScreener does not cover.
    res.setHeader('Cache-Control', 'no-store')
    return res.status(502).json({ error: 'Address lookup failed' })
  }
}

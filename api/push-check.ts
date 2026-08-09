// @ts-nocheck
// Vercel serverless function — the price-alert checker.
//
// Triggered every ~10 minutes by a GitHub Actions cron (Vercel Hobby cron only
// allows daily runs) with ?secret=CRON_SECRET. For every stored subscription it
// looks at the user's favorite coins, finds moves beyond their threshold, and
// sends a Web Push per mover — deduped in Redis so the same move never fires
// twice (re-alerts only when the move grows another 10 points).

import webpush from 'web-push'
import crypto from 'crypto'

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function redis(cmd: any[]) {
  const env = redisEnv()
  const res = await fetch(env.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!res.ok) throw new Error(`Redis error ${res.status}`)
  return (await res.json()).result
}

function getApiKey(): string | undefined {
  return process.env.COINGECKO_API_KEY || process.env.VITE_COINGECKO_API_KEY
}

async function fetchMarkets(query: string): Promise<any[]> {
  const key = getApiKey()
  const url =
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=false&${query}` +
    (key ? `&x_cg_demo_api_key=${key}` : '')
  const res = await fetch(url)
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

const fmtPrice = (p: number) => {
  if (!p) return '$0'
  if (p >= 1000) return '$' + Math.round(p).toLocaleString('en-US')
  if (p >= 1) return '$' + p.toFixed(2)
  if (p >= 0.0001) return '$' + p.toFixed(6)
  // Full decimals for micro-prices, CoinGecko-notification style
  const zeros = Math.floor(-Math.log10(p))
  return '$' + p.toFixed(Math.min(12, zeros + 3))
}

export default async function handler(req: any, res: any) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.query.secret !== secret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!redisEnv()) {
    return res.status(503).json({ error: 'Push storage not configured yet' })
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) {
    return res.status(503).json({ error: 'VAPID keys not configured yet' })
  }
  webpush.setVapidDetails('https://www.cryptodust.xyz', publicKey, privateKey)

  try {
    const subsHash = (await redis(['HGETALL', 'push:subs'])) || []
    // Upstash returns HGETALL as a flat [field, value, ...] array
    const subs: Array<{ id: string; subscription: any; prefs: any }> = []
    for (let i = 0; i + 1 < subsHash.length; i += 2) {
      try {
        const parsed = JSON.parse(subsHash[i + 1])
        subs.push({ id: subsHash[i], ...parsed })
      } catch { /* skip corrupt entries */ }
    }

    if (subs.length === 0) {
      return res.status(200).json({ ok: true, subs: 0, sent: 0 })
    }

    // One price fetch serves every subscription: the union of all favorites.
    const wanted = new Set<string>()
    for (const s of subs) for (const id of s.prefs?.favorites || []) wanted.add(id)

    if (wanted.size === 0) {
      return res.status(200).json({ ok: true, subs: subs.length, sent: 0, note: 'no favorites' })
    }

    const ids = [...wanted].slice(0, 250).join(',')
    const coins = await fetchMarkets(`ids=${encodeURIComponent(ids)}&per_page=250`)
    const byId = new Map(coins.map((c: any) => [c.id, c]))

    let sent = 0
    const dead: string[] = []

    for (const sub of subs) {
      const threshold = sub.prefs?.threshold || 10

      for (const coinId of sub.prefs?.favorites || []) {
        const coin = byId.get(coinId)
        if (!coin) continue
        const change = coin.price_change_percentage_24h || 0
        if (Math.abs(change) < threshold) continue

        // Dedup: skip unless this is a fresh alert or the move grew 10+ points
        const dedupKey = `push:sent:${sub.id}:${coinId}`
        const prev = await redis(['GET', dedupKey])
        if (prev !== null && Math.abs(change - parseFloat(prev)) < 10) continue

        const dir = change >= 0 ? 'up' : 'down'
        const arrow = change >= 0 ? '📈' : '📉'
        const sym = (coin.symbol || '').toUpperCase()
        const payload = JSON.stringify({
          title: `${sym} Price Alert ${arrow}`,
          body: `${coin.name} is ${dir} ${Math.abs(change).toFixed(2)}% in the last 24 hours, now trading at ${fmtPrice(coin.current_price)}.`,
          image: coin.image || undefined,
          tag: `alert-${coinId}`,
          renotify: true,
          url: `/?coin=${encodeURIComponent(coinId)}`,
        })

        try {
          await webpush.sendNotification(sub.subscription, payload, { TTL: 3600 })
          sent++
          await redis(['SET', dedupKey, String(change), 'EX', 43200]) // 12h window
        } catch (e: any) {
          if (e?.statusCode === 404 || e?.statusCode === 410) {
            dead.push(sub.id) // browser revoked the subscription
            break
          }
        }
      }
    }

    for (const id of dead) await redis(['HDEL', 'push:subs', id])

    return res.status(200).json({ ok: true, subs: subs.length, sent, pruned: dead.length })
  } catch (e) {
    return res.status(500).json({ error: 'Check failed' })
  }
}

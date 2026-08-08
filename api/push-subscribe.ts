// @ts-nocheck
// Vercel serverless function — stores/removes Web Push subscriptions.
//
// Storage is Upstash Redis over REST (added via the Vercel marketplace; both
// the Vercel-KV and plain-Upstash env var names are accepted). Each
// subscription is one hash entry keyed by a digest of its endpoint:
//   push:subs -> { <id>: JSON({ subscription, prefs, ts }) }

import crypto from 'crypto'

function redisEnv() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

async function redis(cmd: any[]) {
  const env = redisEnv()
  if (!env) throw new Error('Redis not configured')
  const res = await fetch(env.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  })
  if (!res.ok) throw new Error(`Redis error ${res.status}`)
  const data = await res.json()
  return data.result
}

const subId = (endpoint: string) =>
  crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 24)

export default async function handler(req: any, res: any) {
  if (!redisEnv()) {
    return res.status(503).json({ error: 'Push storage not configured yet' })
  }

  try {
    if (req.method === 'POST') {
      const { subscription, prefs } = req.body || {}
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return res.status(400).json({ error: 'Invalid subscription' })
      }

      const cleanPrefs = {
        // Alert threshold in |24h %|, clamped to something sane
        threshold: Math.min(50, Math.max(5, Number(prefs?.threshold) || 10)),
        // CoinGecko ids of the user's favorites (what the alerts watch)
        favorites: Array.isArray(prefs?.favorites)
          ? prefs.favorites.slice(0, 100).map(String)
          : [],
      }

      await redis([
        'HSET',
        'push:subs',
        subId(subscription.endpoint),
        JSON.stringify({ subscription, prefs: cleanPrefs, ts: Date.now() }),
      ])
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'DELETE') {
      const { endpoint } = req.body || {}
      if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' })
      await redis(['HDEL', 'push:subs', subId(endpoint)])
      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (e) {
    return res.status(500).json({ error: 'Storage error' })
  }
}

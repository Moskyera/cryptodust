// @ts-nocheck
// Vercel serverless function (Node.js), not part of the browser app.
//
// Same-origin proxy for coin logo images. The canvas visualization must load
// logos CORS-clean (a tainted canvas breaks Export PNG / Copy), but CoinGecko's
// image CDN serves Access-Control-Allow-Origin only when the request carries an
// Origin header, with `Vary: Origin` behind Cloudflare. The same URLs are also
// shown as plain <img> in the list views, so the no-Origin variant lands in
// caches and then gets served to the canvas's crossOrigin request — which the
// browser rejects. Verified 2026-08-08 with curl: with Origin → ACAO:*, without
// → no ACAO. Serving the bytes from our own origin sidesteps CORS entirely.

const ALLOWED_HOSTS = new Set([
  'coin-images.coingecko.com',
  'assets.coingecko.com',
])

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const url = typeof req.query.url === 'string' ? req.query.url : ''

  let parsed
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
    return res.status(400).json({ error: 'Host not allowed' })
  }

  try {
    const upstream = await fetch(url)
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Upstream error' })
    }

    const contentType = upstream.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      return res.status(502).json({ error: 'Not an image' })
    }

    const body = Buffer.from(await upstream.arrayBuffer())

    // Logo URLs are versioned with a query timestamp, so long caching is safe.
    res.setHeader('Cache-Control', 'public, s-maxage=604800, max-age=86400, stale-while-revalidate=86400')
    res.setHeader('Content-Type', contentType)
    return res.status(200).send(body)
  } catch {
    return res.status(502).json({ error: 'Upstream fetch failed' })
  }
}

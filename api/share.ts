// @ts-nocheck
// Vercel serverless function — the share landing page /c/<coin>.
//
// X / Telegram crawlers do not execute JS, so the SPA's static index.html can
// only ever show the generic site preview. This page serves per-coin OG tags
// (og:image = /api/card, the server-rendered card) and instantly forwards real
// visitors to the app with the coin selected. Result: posting the link makes
// the platform render the card itself — no image pasting needed.

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export default async function handler(req: any, res: any) {
  const coinId = String(req.query.coin || '').slice(0, 100)
  if (!coinId || !/^[a-z0-9-]+$/i.test(coinId)) {
    res.setHeader('Location', 'https://www.cryptodust.xyz/')
    return res.status(302).end()
  }

  // Best-effort name/price for the text tags (the image endpoint fetches its own)
  let title = `${coinId} on CryptoDUST`
  let description = 'Live crypto market visualizer with 800+ planets.'
  try {
    const key = process.env.COINGECKO_API_KEY || process.env.VITE_COINGECKO_API_KEY
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinId)}&per_page=1` +
        (key ? `&x_cg_demo_api_key=${key}` : '')
    )
    if (r.ok) {
      const [c] = await r.json()
      if (c) {
        const chg = c.price_change_percentage_24h || 0
        title = `${(c.symbol || '').toUpperCase()} ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% in 24h`
        description = `${c.name} on CryptoDUST · live prices, honest liquidity data, 800+ coins as planets.`
      }
    }
  } catch { /* keep fallbacks */ }

  const site = 'https://www.cryptodust.xyz'
  const cardUrl = `${site}/api/card?coin=${encodeURIComponent(coinId)}`
  const appUrl = `${site}/?coin=${encodeURIComponent(coinId)}`

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${esc(title)} · CryptoDUST</title>
<meta property="og:type" content="website">
<meta property="og:site_name" content="CryptoDUST">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(cardUrl)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${esc(`${site}/c/${coinId}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(cardUrl)}">
<meta http-equiv="refresh" content="0;url=${esc(appUrl)}">
<style>body{background:#0a0a12;color:#9ca3af;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style>
</head>
<body>
<script>location.replace(${JSON.stringify(appUrl)})</script>
<p>Opening CryptoDUST…</p>
</body>
</html>`

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).send(html)
}

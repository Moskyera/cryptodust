// @ts-nocheck
// Vercel EDGE function — server-rendered share card (1200×630 PNG).
//
// This is what X / Telegram crawlers fetch as og:image for /c/<coin>, so the
// link preview IS the card — no clipboard gymnastics. A lighter cousin of the
// client-side Holo Ticket (satori has no canvas: no starfield/sparkline), same
// identity: dark space, holo border, logo twice, glowing 24h%.

import { ImageResponse } from '@vercel/og'

export const config = { runtime: 'edge' }

const h = (type: any, props: any = {}, ...children: any[]) => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
})

function fmtPrice(p: number): string {
  if (!p || p <= 0) return '$0'
  if (p >= 1000) return '$' + Math.round(p).toLocaleString('en-US')
  if (p >= 1) return '$' + p.toFixed(2)
  if (p >= 0.01) return '$' + p.toFixed(4)
  const zeros = Math.floor(-Math.log10(p))
  if (zeros <= 3) return '$' + p.toFixed(zeros + 3)
  const digits = String(Math.round(p * Math.pow(10, zeros + 3))).replace(/0+$/, '') || '0'
  const SUB = '₀₁₂₃₄₅₆₇₈₉'
  const sub = String(zeros).split('').map((d) => SUB[+d]).join('')
  return `$0.0${sub}${digits}`
}

function fmtBig(v: number): string {
  if (!v || v <= 0) return ''
  if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + Math.round(v)
}

async function loadFont(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch {
    return null
  }
}

export default async function handler(req: Request) {
  const { searchParams } = new URL(req.url)
  const coinId = (searchParams.get('coin') || '').slice(0, 100)

  // ---- data ----
  let coin: any = null
  if (coinId) {
    try {
      const key = process.env.COINGECKO_API_KEY || process.env.VITE_COINGECKO_API_KEY
      const res = await fetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coinId)}&per_page=1` +
          (key ? `&x_cg_demo_api_key=${key}` : '')
      )
      if (res.ok) {
        const data = await res.json()
        coin = Array.isArray(data) && data[0] ? data[0] : null
      }
    } catch { /* fall through to branded fallback */ }
  }

  // ---- fonts (woff v1 — satori cannot read woff2) ----
  const [interRegular, interBold, interBlack] = await Promise.all([
    loadFont('https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMa1ZL7.woff'),
    loadFont('https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50BTca1ZL7.woff'),
    loadFont('https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50FzMa1ZL7.woff'),
  ])
  const fonts: any[] = []
  if (interRegular) fonts.push({ name: 'Inter', data: interRegular, weight: 400 })
  if (interBold) fonts.push({ name: 'Inter', data: interBold, weight: 700 })
  if (interBlack) fonts.push({ name: 'Inter', data: interBlack, weight: 900 })

  const change = coin?.price_change_percentage_24h || 0
  const isUp = change >= 0
  const accent = isUp ? '#4ade80' : '#f87171'
  const symbol = (coin?.symbol || 'DUST').toUpperCase()
  const name = coin?.name || 'CryptoDUST'
  const price = coin ? fmtPrice(coin.current_price || 0) : ''
  const pct = coin ? `${isUp ? '+' : '-'}${Math.abs(change).toFixed(2)}%` : 'Market Visualizer'
  const logo = coin?.image || 'https://www.cryptodust.xyz/cryptodust-logo.png'
  const mcap = fmtBig(coin?.market_cap) || fmtBig(coin?.fully_diluted_valuation)
  const mcapLabel = fmtBig(coin?.market_cap) ? 'MARKET CAP' : 'FDV'
  const vol = fmtBig(coin?.total_volume)

  const statBox = (label: string, value: string) =>
    h(
      'div',
      {
        style: {
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: 'rgba(255,255,255,0.06)',
          border: '1.5px solid rgba(255,255,255,0.12)',
          borderRadius: 16,
          padding: '14px 22px',
          marginRight: 18,
        },
      },
      h('div', { style: { display: 'flex', fontSize: 17, color: 'rgba(255,255,255,0.45)', letterSpacing: 1 } }, label),
      h('div', { style: { display: 'flex', fontSize: 28, fontWeight: 700, color: '#ffffff', marginTop: 4 } }, value)
    )

  const stats: any[] = []
  if (price) stats.push(statBox('PRICE', price))
  if (mcap) stats.push(statBox(mcapLabel, mcap))
  if (vol) stats.push(statBox('24H VOLUME', vol))

  const tree = h(
    'div',
    {
      style: {
        width: '100%',
        height: '100%',
        display: 'flex',
        backgroundColor: '#0a0a14',
        backgroundImage:
          'radial-gradient(circle at 15% 0%, rgba(167,139,250,0.25), transparent 55%), radial-gradient(circle at 95% 100%, rgba(103,246,255,0.2), transparent 50%)',
        position: 'relative',
        fontFamily: 'Inter',
      },
    },
    // holo border
    h('div', {
      style: {
        position: 'absolute',
        top: 10,
        left: 10,
        right: 10,
        bottom: 10,
        borderRadius: 28,
        border: '5px solid rgba(103,246,255,0.55)',
        boxShadow: '0 0 60px rgba(103,246,255,0.25)',
      },
    }),
    // giant watermark logo, right side
    h('img', {
      src: logo,
      width: 520,
      height: 520,
      style: {
        position: 'absolute',
        right: -110,
        top: 55,
        opacity: 0.16,
        borderRadius: 260,
      },
    }),
    // content column
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', padding: '54px 70px', width: '100%' } },
      // header row: front logo + names
      h(
        'div',
        { style: { display: 'flex', alignItems: 'center' } },
        h('img', {
          src: logo,
          width: 150,
          height: 150,
          style: { borderRadius: 75, border: `5px solid ${accent}`, boxShadow: `0 0 45px ${accent}` },
        }),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', marginLeft: 38 } },
          h('div', { style: { display: 'flex', fontSize: 62, fontWeight: 900, color: '#ffffff' } }, symbol),
          h('div', { style: { display: 'flex', fontSize: 30, color: 'rgba(255,255,255,0.55)' } }, name),
          price
            ? h('div', { style: { display: 'flex', fontSize: 42, fontWeight: 700, color: '#ffffff', marginTop: 8 } }, price)
            : null
        )
      ),
      // giant %
      h(
        'div',
        {
          style: {
            display: 'flex',
            fontSize: 128,
            fontWeight: 900,
            color: accent,
            marginTop: 8,
            textShadow: `0 0 42px ${accent}`,
          },
        },
        pct
      ),
      coin
        ? h('div', { style: { display: 'flex', fontSize: 22, color: 'rgba(255,255,255,0.45)', letterSpacing: 2 } }, 'LAST 24 HOURS')
        : null,
      // stats row
      h('div', { style: { display: 'flex', marginTop: 34 } }, ...stats),
      // branding
      h(
        'div',
        { style: { display: 'flex', position: 'absolute', right: 56, bottom: 42, fontSize: 27, fontWeight: 700 } },
        h('div', { style: { display: 'flex', color: 'rgba(255,255,255,0.9)' } }, 'crypto'),
        h('div', { style: { display: 'flex', color: '#fb923c' } }, 'DUST.xyz')
      )
    )
  )

  return new ImageResponse(tree, {
    width: 1200,
    height: 630,
    fonts: fonts.length ? fonts : undefined,
    headers: {
      'Cache-Control': 'public, s-maxage=300, max-age=300, stale-while-revalidate=600',
    },
  })
}

/**
 * Share card — "Holo Ticket" (1200×630, ideal for Twitter/Telegram previews).
 *
 * Filled, not empty: starfield + nebula backdrop, a giant watermark of the
 * coin's own logo bleeding off the right edge, the logo again as a shaded
 * planet up front, holographic gradient border, big % with glow, stat boxes
 * and a seeded sparkline. Branding bottom-right.
 *
 * Everything draws into an offscreen canvas; logos come through /api/img so
 * the canvas stays untainted and toBlob always works.
 */

import type { TokenPrice } from './prices'
import { formatCompactPrice } from './prices'

const W = 1200
const H = 630

export type CardPeriod = '24h' | '30d'

function periodChange(coin: TokenPrice, period: CardPeriod): number {
  if (period === '30d') {
    return coin.price_change_percentage_30d ?? coin.price_change_percentage_24h ?? 0
  }
  return coin.price_change_percentage_24h || 0
}

const periodLabel = (period: CardPeriod) => (period === '30d' ? 'LAST 30 DAYS' : 'LAST 24 HOURS')

function logoSrc(url: string): string {
  if (url.startsWith('https://')) return `/api/img?url=${encodeURIComponent(url)}`
  return url
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    const timer = setTimeout(() => resolve(null), 8000)
    img.onload = () => { clearTimeout(timer); resolve(img) }
    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = src
  })
}

function fmtBig(value: number | null | undefined): string {
  if (!value || value <= 0) return ''
  if (value >= 1e12) return '$' + (value / 1e12).toFixed(2) + 'T'
  if (value >= 1e9) return '$' + (value / 1e9).toFixed(2) + 'B'
  if (value >= 1e6) return '$' + (value / 1e6).toFixed(2) + 'M'
  if (value >= 1e3) return '$' + (value / 1e3).toFixed(1) + 'K'
  return '$' + Math.round(value)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function buildShareCard(coin: TokenPrice, period: CardPeriod = '24h'): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const change = periodChange(coin, period)
  const isUp = change >= 0
  const accent = isUp ? '#4ade80' : '#f87171'
  const font = (spec: string) => `${spec} Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

  // ---------- backdrop: deep space + nebula ----------
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0d0f1d')
  bg.addColorStop(0.55, '#0a0a14')
  bg.addColorStop(1, '#0b0d19')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const nebula1 = ctx.createRadialGradient(W * 0.15, -60, 0, W * 0.15, -60, 640)
  nebula1.addColorStop(0, 'rgba(167,139,250,0.22)')
  nebula1.addColorStop(1, 'transparent')
  ctx.fillStyle = nebula1
  ctx.fillRect(0, 0, W, H)

  const nebula2 = ctx.createRadialGradient(W * 0.92, H * 1.05, 0, W * 0.92, H * 1.05, 700)
  nebula2.addColorStop(0, 'rgba(103,246,255,0.16)')
  nebula2.addColorStop(1, 'transparent')
  ctx.fillStyle = nebula2
  ctx.fillRect(0, 0, W, H)

  // seeded starfield (deterministic per symbol so cards are stable)
  let seed = 7
  for (let i = 0; i < coin.symbol.length; i++) seed = (seed * 31 + coin.symbol.charCodeAt(i)) >>> 0
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < 90; i++) {
    const x = rand() * W
    const y = rand() * H
    const r = rand() * 1.6 + 0.4
    ctx.globalAlpha = 0.25 + rand() * 0.65
    ctx.fillStyle = rand() > 0.85 ? '#d6f9ff' : '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // ---------- logo: giant watermark filling the right side ----------
  const logo = coin.image ? await loadImage(logoSrc(coin.image)) : null
  if (logo) {
    const wm = 560
    ctx.save()
    ctx.globalAlpha = 0.14
    ctx.beginPath()
    ctx.arc(W - 170, H / 2, wm / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logo, W - 170 - wm / 2, H / 2 - wm / 2, wm, wm)
    ctx.restore()

    // soft ring around the watermark planet
    ctx.globalAlpha = 0.25
    ctx.strokeStyle = accent
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(W - 170, H / 2 + 30, wm * 0.62, wm * 0.17, -0.32, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  // ---------- front planet: logo as shaded sphere ----------
  const px = 150
  const py = 178
  const pr = 92
  if (logo) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(px, py, pr, 0, Math.PI * 2)
    ctx.clip()
    ctx.fillStyle = '#14141d'
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2)
    ctx.drawImage(logo, px - pr, py - pr, pr * 2, pr * 2)
    const shade = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.4, pr * 0.15, px, py, pr * 1.4)
    shade.addColorStop(0, 'rgba(255,255,255,0.2)')
    shade.addColorStop(0.4, 'rgba(255,255,255,0.02)')
    shade.addColorStop(0.75, 'rgba(0,0,0,0.25)')
    shade.addColorStop(1, 'rgba(0,0,0,0.55)')
    ctx.fillStyle = shade
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2)
    ctx.restore()

    // glow halo in the move's colour
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.shadowColor = accent
    ctx.shadowBlur = 46
    ctx.strokeStyle = accent
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(px, py, pr + 3, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }

  // ---------- texts ----------
  const tx = logo ? px + pr + 44 : 80

  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#ffffff'
  ctx.font = font('900 64px')
  ctx.fillText(coin.symbol.toUpperCase(), tx, 158)

  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.font = font('500 30px')
  ctx.fillText(coin.name, tx, 202)

  // price
  ctx.fillStyle = '#ffffff'
  ctx.font = font('700 46px')
  ctx.fillText(formatCompactPrice(coin.current_price), tx, 268)

  // giant % with glow
  const pctText = `${isUp ? '+' : '−'}${Math.abs(change).toFixed(2)}%`
  ctx.save()
  ctx.shadowColor = accent
  ctx.shadowBlur = 42
  const pctGrad = ctx.createLinearGradient(0, 300, 0, 430)
  pctGrad.addColorStop(0, isUp ? '#bbf7d0' : '#fecaca')
  pctGrad.addColorStop(0.55, accent)
  pctGrad.addColorStop(1, isUp ? '#16a34a' : '#dc2626')
  ctx.fillStyle = pctGrad
  ctx.font = font('900 128px')
  ctx.fillText(pctText, 74, 430)
  ctx.restore()

  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = font('600 24px')
  ctx.fillText(periodLabel(period), 80, 474)

  // ---------- stat boxes ----------
  const stats: Array<[string, string]> = [['PRICE', formatCompactPrice(coin.current_price)]]
  const mcap = fmtBig(coin.market_cap)
  const fdv = fmtBig(coin.fdv)
  const liq = fmtBig(coin.liquidity)
  const vol = fmtBig(coin.total_volume)
  if (mcap) stats.push(['MARKET CAP', mcap])
  else if (fdv) stats.push(['FDV', fdv])
  if (vol) stats.push(['24H VOLUME', vol])
  if (stats.length < 3 && liq) stats.push(['LIQUIDITY', liq])

  const boxW = 214
  const boxH = 86
  const boxY = H - 128
  stats.slice(0, 3).forEach(([label, value], i) => {
    const bx = 80 + i * (boxW + 18)
    ctx.fillStyle = 'rgba(255,255,255,0.055)'
    roundRect(ctx, bx, boxY, boxW, boxH, 16)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1.5
    roundRect(ctx, bx, boxY, boxW, boxH, 16)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = font('600 17px')
    ctx.fillText(label, bx + 20, boxY + 32)
    ctx.fillStyle = '#ffffff'
    ctx.font = font('700 28px')
    ctx.fillText(value, bx + 20, boxY + 66)
  })

  // ---------- seeded sparkline across the midsection ----------
  // starts after the "LAST 24 HOURS" label so the two never collide
  const sx = 292
  const sw = 408
  const sy = H - 164
  const sh = 22
  ctx.save()
  ctx.globalAlpha = 0.85
  ctx.strokeStyle = accent
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.beginPath()
  const pts = 26
  for (let i = 0; i <= pts; i++) {
    const progress = i / pts
    const trend = (change / 100) * (progress - 0.5) * 1.4
    const wiggle = Math.sin((i + seed % 10) * 0.9) * 0.16 + Math.sin(i * 1.7 + seed % 7) * 0.1
    const v = Math.max(0.05, Math.min(0.95, 0.5 + trend + wiggle * 0.5))
    const x = sx + progress * sw
    const y = sy - (v - 0.5) * sh * 2
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()

  // ---------- holographic border + sheen ----------
  const holo = ctx.createLinearGradient(0, 0, W, H)
  holo.addColorStop(0, '#67f6ff')
  holo.addColorStop(0.35, '#a78bfa')
  holo.addColorStop(0.7, '#fb923c')
  holo.addColorStop(1, '#67f6ff')
  ctx.strokeStyle = holo
  ctx.lineWidth = 5
  roundRect(ctx, 8, 8, W - 16, H - 16, 30)
  ctx.stroke()

  ctx.save()
  ctx.globalAlpha = 0.05
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(W * 0.32, 0)
  ctx.lineTo(W * 0.46, 0)
  ctx.lineTo(W * 0.24, H)
  ctx.lineTo(W * 0.1, H)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  // ---------- branding ----------
  ctx.textAlign = 'right'
  ctx.font = font('700 26px')
  ctx.fillStyle = 'rgba(255,255,255,0.85)'
  const brandTail = 'DUST.xyz'
  const brandHead = 'crypto'
  const tailW = ctx.measureText(brandTail).width
  ctx.fillStyle = '#fb923c'
  ctx.fillText(brandTail, W - 48, H - 40)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText(brandHead, W - 48 - tailW, H - 40)
  ctx.textAlign = 'left'

  return canvas
}

// =====================================================
// MULTI-COIN CARD — "Market Snapshot" (same 1200x630 Holo Ticket language)
// Up to five coins as rows: shaded planet logo, symbol/name, price, 24h%.
// =====================================================
export async function buildMultiCard(coins: TokenPrice[], period: CardPeriod = '24h'): Promise<HTMLCanvasElement> {
  const picks = coins.slice(0, 5)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const font = (spec: string) => `${spec} Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`

  // backdrop: same deep space + nebulas as the single card
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#0d0f1d')
  bg.addColorStop(0.55, '#0a0a14')
  bg.addColorStop(1, '#0b0d19')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  const neb1 = ctx.createRadialGradient(W * 0.12, -50, 0, W * 0.12, -50, 620)
  neb1.addColorStop(0, 'rgba(167,139,250,0.2)')
  neb1.addColorStop(1, 'transparent')
  ctx.fillStyle = neb1
  ctx.fillRect(0, 0, W, H)

  const neb2 = ctx.createRadialGradient(W * 0.94, H * 1.02, 0, W * 0.94, H * 1.02, 680)
  neb2.addColorStop(0, 'rgba(103,246,255,0.15)')
  neb2.addColorStop(1, 'transparent')
  ctx.fillStyle = neb2
  ctx.fillRect(0, 0, W, H)

  // seeded stars from the joined symbols
  let seed = 11
  const seedStr = picks.map(c => c.symbol).join('')
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  for (let i = 0; i < 80; i++) {
    const x = rand() * W
    const y = rand() * H
    ctx.globalAlpha = 0.2 + rand() * 0.6
    ctx.fillStyle = rand() > 0.85 ? '#d6f9ff' : '#ffffff'
    ctx.beginPath()
    ctx.arc(x, y, rand() * 1.5 + 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // header
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = font('600 22px')
  ctx.fillText(period === '30d' ? 'MARKET SNAPSHOT · 30 DAYS' : 'MARKET SNAPSHOT · 24 HOURS', 70, 74)
  ctx.font = font('700 26px')
  ctx.textAlign = 'right'
  const tail = 'DUST.xyz'
  const tw = ctx.measureText(tail).width
  ctx.fillStyle = '#fb923c'
  ctx.fillText(tail, W - 64, 76)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'
  ctx.fillText('crypto', W - 64 - tw, 76)
  ctx.textAlign = 'left'

  // rows
  const logos = await Promise.all(picks.map(c => (c.image ? loadImage(logoSrc(c.image)) : Promise.resolve(null))))
  const top = 108
  const bottom = H - 44
  const rowH = (bottom - top) / picks.length
  const logoR = Math.min(40, rowH * 0.34)

  picks.forEach((coin, i) => {
    const cy = top + rowH * i + rowH / 2
    const change = periodChange(coin, period)
    const up = change >= 0
    const accent = up ? '#4ade80' : '#f87171'

    if (i > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.moveTo(70, top + rowH * i)
      ctx.lineTo(W - 64, top + rowH * i)
      ctx.stroke()
    }

    // planet logo
    const lx = 112
    const logo = logos[i]
    if (logo) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(lx, cy, logoR, 0, Math.PI * 2)
      ctx.clip()
      ctx.fillStyle = '#14141d'
      ctx.fillRect(lx - logoR, cy - logoR, logoR * 2, logoR * 2)
      ctx.drawImage(logo, lx - logoR, cy - logoR, logoR * 2, logoR * 2)
      const shade = ctx.createRadialGradient(lx - logoR * 0.35, cy - logoR * 0.4, logoR * 0.15, lx, cy, logoR * 1.4)
      shade.addColorStop(0, 'rgba(255,255,255,0.2)')
      shade.addColorStop(0.4, 'rgba(255,255,255,0.02)')
      shade.addColorStop(1, 'rgba(0,0,0,0.5)')
      ctx.fillStyle = shade
      ctx.fillRect(lx - logoR, cy - logoR, logoR * 2, logoR * 2)
      ctx.restore()

      ctx.globalAlpha = 0.7
      ctx.strokeStyle = accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(lx, cy, logoR + 2, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    // symbol + name
    const nameX = lx + logoR + 30
    ctx.fillStyle = '#ffffff'
    ctx.font = font(`900 ${Math.min(40, rowH * 0.36)}px`)
    ctx.fillText(coin.symbol.toUpperCase(), nameX, cy + 2)
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = font(`500 ${Math.min(22, rowH * 0.2)}px`)
    ctx.fillText(coin.name.slice(0, 26), nameX, cy + Math.min(30, rowH * 0.28))

    // price (right-middle) + change (right)
    ctx.textAlign = 'right'
    ctx.fillStyle = '#ffffff'
    ctx.font = font(`700 ${Math.min(34, rowH * 0.3)}px`)
    ctx.fillText(formatCompactPrice(coin.current_price), W - 320, cy + 10)

    ctx.save()
    ctx.shadowColor = accent
    ctx.shadowBlur = 22
    ctx.fillStyle = accent
    ctx.font = font(`900 ${Math.min(44, rowH * 0.4)}px`)
    ctx.fillText(`${up ? '+' : '-'}${Math.abs(change).toFixed(1)}%`, W - 70, cy + 13)
    ctx.restore()
    ctx.textAlign = 'left'
  })

  // holo border + sheen
  const holo = ctx.createLinearGradient(0, 0, W, H)
  holo.addColorStop(0, '#67f6ff')
  holo.addColorStop(0.35, '#a78bfa')
  holo.addColorStop(0.7, '#fb923c')
  holo.addColorStop(1, '#67f6ff')
  ctx.strokeStyle = holo
  ctx.lineWidth = 5
  roundRect(ctx, 8, 8, W - 16, H - 16, 30)
  ctx.stroke()

  ctx.save()
  ctx.globalAlpha = 0.045
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.moveTo(W * 0.3, 0)
  ctx.lineTo(W * 0.44, 0)
  ctx.lineTo(W * 0.22, H)
  ctx.lineTo(W * 0.08, H)
  ctx.closePath()
  ctx.fill()
  ctx.restore()

  return canvas
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

export async function copyMultiCoinCard(coins: TokenPrice[], period: CardPeriod = '24h'): Promise<boolean> {
  try {
    const blob = await canvasToBlob(await buildMultiCard(coins, period))
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

export async function downloadMultiCoinCard(coins: TokenPrice[], period: CardPeriod = '24h'): Promise<boolean> {
  try {
    const blob = await canvasToBlob(await buildMultiCard(coins, period))
    if (!blob) return false
    const link = document.createElement('a')
    link.download = 'cryptodust-snapshot.png'
    link.href = URL.createObjectURL(blob)
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 10000)
    return true
  } catch {
    return false
  }
}

export async function shareMultiCoinCard(coins: TokenPrice[], period: CardPeriod = '24h'): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const blob = await canvasToBlob(await buildMultiCard(coins, period))
    if (!blob) return 'failed'
    const file = new File([blob], 'cryptodust-snapshot.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Market snapshot on CryptoDUST', text: 'Market snapshot · cryptodust.xyz' })
        return 'shared'
      } catch {
        return 'shared'
      }
    }
    const link = document.createElement('a')
    link.download = file.name
    link.href = URL.createObjectURL(blob)
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 10000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

async function cardBlob(coin: TokenPrice, period: CardPeriod = '24h'): Promise<Blob | null> {
  const canvas = await buildShareCard(coin, period)
  return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
}

export function coinShareText(coin: TokenPrice): string {
  const change = coin.price_change_percentage_24h || 0
  return `${coin.symbol.toUpperCase()} ${change >= 0 ? '+' : ''}${change.toFixed(2)}% in 24h · ${formatCompactPrice(coin.current_price)}`
}

export function coinShareUrl(coin: TokenPrice): string {
  // /c/<id> serves per-coin OG tags, so X/Telegram render the card as the
  // link preview automatically; humans get forwarded into the app.
  return `https://www.cryptodust.xyz/c/${encodeURIComponent(coin.id)}`
}

/**
 * Direct desktop path to X / Telegram: the web intents cannot carry an image,
 * so the card is copied to the clipboard and the composer opens — one Ctrl+V
 * and the image is attached. The composer window MUST open synchronously
 * (before any await) or popup blockers eat it.
 */
export async function shareCardToComposer(
  coin: TokenPrice,
  network: 'x' | 'telegram'
): Promise<boolean> {
  const text = coinShareText(coin) + ' 🪐'
  const url = coinShareUrl(coin)
  const intent =
    network === 'x'
      ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
      : `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`

  window.open(intent, '_blank', 'noopener')

  try {
    const blob = await cardBlob(coin)
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

/** Copy the card image to the clipboard (paste anywhere: X, Telegram, Discord). */
export async function copyCoinCard(coin: TokenPrice, period: CardPeriod = '24h'): Promise<boolean> {
  try {
    const blob = await cardBlob(coin, period)
    if (!blob) return false
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

/** Always download the card as a PNG file. */
export async function downloadCoinCard(coin: TokenPrice, period: CardPeriod = '24h'): Promise<boolean> {
  try {
    const blob = await cardBlob(coin, period)
    if (!blob) return false
    const link = document.createElement('a')
    link.download = `cryptodust-${coin.symbol.toLowerCase()}.png`
    link.href = URL.createObjectURL(blob)
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 10000)
    return true
  } catch {
    return false
  }
}

/** Render the card and hand it to the user: native share where available, PNG download otherwise. */
export async function shareCoinCard(coin: TokenPrice, period: CardPeriod = '24h'): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const canvas = await buildShareCard(coin, period)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return 'failed'

    const file = new File([blob], `cryptodust-${coin.symbol.toLowerCase()}.png`, { type: 'image/png' })

    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `${coin.symbol} on CryptoDUST`,
          text: `${coin.name}: ${((coin.price_change_percentage_24h || 0) >= 0 ? '+' : '')}${(coin.price_change_percentage_24h || 0).toFixed(2)}% in 24h · cryptodust.xyz`,
        })
        return 'shared'
      } catch {
        // user cancelled the share sheet — fall through to download? No: treat cancel as done
        return 'shared'
      }
    }

    const link = document.createElement('a')
    link.download = file.name
    link.href = URL.createObjectURL(blob)
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 10000)
    return 'downloaded'
  } catch {
    return 'failed'
  }
}

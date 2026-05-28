import React, { useEffect, useRef, useState, useCallback } from 'react'
import type { TokenPrice } from '../lib/prices'

interface Bubble {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  r: number
  targetR: number
  coin: TokenPrice
}

interface VisualizationProps {
  tokens: TokenPrice[]
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  favorites?: string[]
  highlightUntil?: number
}

export function Visualization({ tokens, selectedId: externalSelectedId, onSelect, favorites = [], highlightUntil = 0 }: VisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsContainerRef = useRef<HTMLDivElement>(null)
  const bubblesRef = useRef<Bubble[]>([])
  const animationRef = useRef<number>()
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())

  // Use external selection if provided, otherwise fall back to internal (for standalone use)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId
  const setSelectedId: (id: string | null) => void = onSelect || setInternalSelectedId

  // Initialize bubbles when tokens change
  useEffect(() => {
    if (!tokens.length) return

    const canvas = canvasRef.current
    if (!canvas) return

    const w = canvas.width || window.innerWidth * 1.5
    const h = canvas.height || window.innerHeight * 1.5

    const newBubbles: Bubble[] = tokens.slice(0, 1000).map((coin) => {
      const baseR = Math.max(18, Math.min(92, 26 + Math.log10((coin.market_cap || 1e8) / 1e8) * 11))
      return {
        id: coin.id,
        x: 80 + Math.random() * (w - 160),
        y: 80 + Math.random() * (h - 160),
        vx: (Math.random() - 0.5) * 1.8,
        vy: (Math.random() - 0.5) * 1.8,
        r: baseR * 0.7,
        targetR: baseR,
        coin,
      }
    })

    bubblesRef.current = newBubbles
  }, [tokens])

  // Physics + Render loop
  const tick = useCallback(() => {
    const canvas = canvasRef.current
    const labelsContainer = labelsContainerRef.current
    if (!canvas || !labelsContainer) {
      // Re-schedule in case refs aren't ready yet
      animationRef.current = requestAnimationFrame(tick)
      return
    }

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) {
      animationRef.current = requestAnimationFrame(tick)
      return
    }

    const w = canvas.width
    const h = canvas.height

    // Clear
    ctx.fillStyle = '#0a0a12'
    ctx.fillRect(0, 0, w, h)

    const bubbles = bubblesRef.current
    const isHighlighting = Date.now() < highlightUntil

    // Improved smooth physics (closer to the old beloved free-floating feel)
    for (let step = 0; step < 3; step++) { // 3 substeps for smoother movement
      for (let i = 0; i < bubbles.length; i++) {
        const b = bubbles[i]
        b.x += b.vx
        b.y += b.vy

        // Softer friction for smooth long movement
        b.vx *= 0.975
        b.vy *= 0.975

        // Very gentle center pull (keeps things from flying away forever)
        const cx = w / 2
        const cy = h / 2
        const dx = cx - b.x
        const dy = cy - b.y
        const distToCenter = Math.hypot(dx, dy) || 1
        if (distToCenter > 400) {
          b.vx += (dx / distToCenter) * 0.008
          b.vy += (dy / distToCenter) * 0.008
        }

        // Bounce on edges with soft bounce
        if (b.x < b.r + 25) { b.x = b.r + 25; b.vx = Math.abs(b.vx) * 0.65 }
        if (b.x > w - b.r - 25) { b.x = w - b.r - 25; b.vx = -Math.abs(b.vx) * 0.65 }
        if (b.y < b.r + 25) { b.y = b.r + 25; b.vy = Math.abs(b.vy) * 0.65 }
        if (b.y > h - b.r - 25) { b.y = h - b.r - 25; b.vy = -Math.abs(b.vy) * 0.65 }

        // Radius smoothing
        b.r += (b.targetR - b.r) * 0.09
      }

      // Stronger but soft repulsion between planets
      for (let i = 0; i < bubbles.length; i++) {
        for (let j = i + 1; j < bubbles.length; j++) {
          const a = bubbles[i]
          const b = bubbles[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist = Math.hypot(dx, dy) || 1
          const minDist = a.r + b.r + 8

          if (dist < minDist) {
            const force = (minDist - dist) / minDist * 0.85
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            a.vx -= fx
            a.vy -= fy
            b.vx += fx
            b.vy += fy
          }
        }
      }
    }

    // Give big movers a kick when Highlight is active
    if (isHighlighting) {
      bubbles.forEach(b => {
        const ch = Math.abs(b.coin.price_change_percentage_24h || 0)
        if (ch > 6) {
          const kick = (ch - 6) * 0.08
          b.vx += (Math.random() - 0.5) * kick
          b.vy += (Math.random() - 0.5) * kick
        }
      })
    }

    // Draw planets
    bubbles.forEach((b) => {
      const coin = b.coin
      const r = b.r
      const x = b.x
      const y = b.y

      const change = coin.price_change_percentage_24h || 0
      const isGainer = change > 0
      const baseColor = isGainer ? '#22c55e' : '#f43f5e'
      const isFavorite = favorites.includes(coin.id)
      const isBigMover = Math.abs(coin.price_change_percentage_24h || 0) > 6
      const isCurrentlyHighlighted = isBigMover && isHighlighting

      // Favorite golden glow (old beautiful effect)
      if (isFavorite) {
        const favPulse = Math.sin(Date.now() / 380) * 0.14 + 1.03
        const favSize = r * 2.35 * favPulse
        const favGlow = ctx.createRadialGradient(x - r * 0.2, y - r * 0.3, r * 0.4, x, y, favSize)
        favGlow.addColorStop(0, '#fde047')
        favGlow.addColorStop(0.35, '#facc15')
        favGlow.addColorStop(0.7, '#ca8a04')
        favGlow.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.7
        ctx.fillStyle = favGlow
        ctx.beginPath()
        ctx.arc(x, y, favSize, 0, Math.PI * 2)
        ctx.fill()
      }

      // Extra intense glow when Highlight Big Movers is active
      if (isCurrentlyHighlighted) {
        const moverPulse = Math.sin(Date.now() / 140) * 0.25 + 1.2
        const moverSize = r * 3.2 * moverPulse
        const moverColor = change > 0 ? '#4ade80' : '#f87171'
        const moverGlow = ctx.createRadialGradient(x, y, r * 0.6, x, y, moverSize)
        moverGlow.addColorStop(0, moverColor)
        moverGlow.addColorStop(0.5, moverColor)
        moverGlow.addColorStop(1, 'transparent')
        ctx.globalAlpha = 0.55
        ctx.fillStyle = moverGlow
        ctx.beginPath()
        ctx.arc(x, y, moverSize, 0, Math.PI * 2)
        ctx.fill()
      }

      // Atmospheric glow
      ctx.globalAlpha = 0.35
      const glow = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.4, x, y, r * 2.1)
      glow.addColorStop(0, baseColor)
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, r * 2.1, 0, Math.PI * 2)
      ctx.fill()

      // Planet disk
      ctx.globalAlpha = 0.95
      ctx.fillStyle = baseColor
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      // Draw real logo if available (the beautiful planet look user loved)
      const img = imageCache.current.get(coin.id)
      if (img && img.complete && img.naturalWidth > 0) {
        const logoSize = r * 1.55
        const logoX = x - logoSize / 2
        const logoY = y - logoSize / 2

        ctx.save()
        ctx.globalAlpha = 0.92

        // Subtle shadow for logo
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 6
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1

        // Clip to circle
        ctx.beginPath()
        ctx.arc(x, y, r * 0.92, 0, Math.PI * 2)
        ctx.clip()

        ctx.drawImage(img, logoX, logoY, logoSize, logoSize)
        ctx.restore()
      } else if (coin.image && !imageCache.current.has(coin.id)) {
        // Lazy load logo
        const newImg = new Image()
        newImg.crossOrigin = 'anonymous'
        newImg.src = coin.image
        newImg.onload = () => {
          imageCache.current.set(coin.id, newImg)
        }
        imageCache.current.set(coin.id, newImg) // prevent multiple loads
      }

      // Specular highlight
      ctx.globalAlpha = 0.6
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.26, 0, Math.PI * 2)
      ctx.fill()

      // Rings
      if (r > 26) {
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = isGainer ? '#86efac' : '#fda4af'
        ctx.lineWidth = r * 0.09
        ctx.beginPath()
        ctx.ellipse(x, y + r * 0.08, r * 1.65, r * 0.32, -0.4, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalAlpha = 1

      // Sparkling particles on big movers when highlighted (old beautiful effect)
      if (isCurrentlyHighlighted) {
        const t = Date.now()
        ctx.globalAlpha = 0.9
        const sparkCount = 5
        for (let s = 0; s < sparkCount; s++) {
          const angle = (t / 420) + (s * (Math.PI * 2 / sparkCount))
          const dist = r * (1.35 + Math.sin(t / 180 + s) * 0.15)
          const sx = x + Math.cos(angle) * dist
          const sy = y + Math.sin(angle) * dist * 0.9
          const sparkSize = 1.6 + Math.sin(t / 110 + s * 2) * 0.8

          ctx.fillStyle = change > 0 ? '#86efac' : '#fca5a5'
          ctx.beginPath()
          ctx.arc(sx, sy, sparkSize, 0, Math.PI * 2)
          ctx.fill()

          ctx.fillStyle = '#ffffff'
          ctx.beginPath()
          ctx.arc(sx, sy, sparkSize * 0.35, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    })

    // Update DOM labels
    updateLabels(bubbles, labelsContainer)

    animationRef.current = requestAnimationFrame(tick)
  }, [selectedId])

  const updateLabels = (bubbles: Bubble[], container: HTMLDivElement) => {
    const existing = new Map<string, HTMLDivElement>()
    container.childNodes.forEach((node) => {
      const el = node as HTMLDivElement
      if (el.dataset.id) existing.set(el.dataset.id, el)
    })

    const visibleIds = new Set<string>()

    bubbles.forEach(b => {
      if (b.r < 15) return
      visibleIds.add(b.id)

      let label = existing.get(b.id)
      if (!label) {
        label = document.createElement('div')
        label.className = 'bubble-label'
        label.dataset.id = b.id
        container.appendChild(label)
      }

      const rect = container.getBoundingClientRect()
      const scaleX = rect.width / (canvasRef.current?.width || 1600)
      const scaleY = rect.height / (canvasRef.current?.height || 900)

      const screenX = b.x * scaleX
      const screenY = b.y * scaleY + b.r * scaleY + 8

      label.style.left = `${screenX}px`
      label.style.top = `${screenY}px`

      const price = b.coin.current_price
      const priceStr = price > 1000 ? '$' + price.toLocaleString() : 
                       price > 1 ? '$' + price.toFixed(2) : '$' + price.toFixed(5)

      const chg = b.coin.price_change_percentage_24h || 0
      const chgClass = chg >= 0 ? 'change-up' : 'change-down'
      const chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%'

      label.innerHTML = `
        <div class="symbol">${b.coin.symbol}</div>
        <div style="display:flex; align-items:baseline; gap:4px; justify-content:center; margin-top:1px">
          <span class="price">${priceStr}</span>
          <span class="change ${chgClass}">${chgStr}</span>
        </div>
      `
    })

    existing.forEach((el, id) => {
      if (!visibleIds.has(id)) el.remove()
    })
  }

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.floor(window.innerWidth * dpr * 1.4)
    canvas.height = Math.floor((window.innerHeight - 56) * dpr * 1.4)

    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    animationRef.current = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [tick, resizeCanvas])

  const handleCanvasClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const clickX = ((e.clientX - rect.left) / rect.width) * canvas.width
    const clickY = ((e.clientY - rect.top) / rect.height) * canvas.height

    let closest: Bubble | null = null
    let minDist = Infinity

    const currentBubbles = bubblesRef.current
    for (let i = 0; i < currentBubbles.length; i++) {
      const b = currentBubbles[i]
      const dist = Math.hypot(b.x - clickX, b.y - clickY)
      if (dist < b.r * 1.6 && dist < minDist) {
        minDist = dist
        closest = b
      }
    }

    if (closest) {
      setSelectedId(closest.id)
    }
  }

  return (
    <div className="viz-container">
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        className="cursor-grab active:cursor-grabbing"
      />
      <div 
        ref={labelsContainerRef} 
        className="absolute inset-0 pointer-events-none z-20" 
      />

      <div className="absolute top-4 left-4 hud px-4 py-2 rounded-2xl text-xs flex items-center gap-x-4 z-30">
        <div>Visible: <span className="font-semibold tabular-nums">{Math.min(tokens.length, 1000)}</span></div>
        <div className="w-px h-3 bg-white/20" />
        <div className="text-emerald-400">Drag to fling • Physics on</div>
      </div>

      {tokens.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[#6b7280] text-sm z-10">
          Loading coins from CoinGecko...
        </div>
      )}

      {selectedId && (
        <div className="absolute bottom-4 right-4 bg-[#111118] border border-[#25252f] rounded-2xl p-4 text-sm z-30 w-72">
          <div className="font-semibold mb-1">Selected</div>
          <div>{tokens.find(t => t.id === selectedId)?.symbol}</div>
          <button 
            onClick={() => setSelectedId(null)}
            className="mt-2 text-xs text-[#6b7280] hover:text-white"
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  )
}

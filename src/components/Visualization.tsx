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
}

export function Visualization({ tokens, selectedId: externalSelectedId, onSelect }: VisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsContainerRef = useRef<HTMLDivElement>(null)
  const bubblesRef = useRef<Bubble[]>([])
  const animationRef = useRef<number>()

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

    // Simple physics (ported & simplified from original)
    for (let i = 0; i < bubbles.length; i++) {
      const b = bubbles[i]
      b.x += b.vx
      b.y += b.vy

      // Soft friction
      b.vx *= 0.982
      b.vy *= 0.982

      // Bounce on edges
      if (b.x < b.r + 20) { b.x = b.r + 20; b.vx = Math.abs(b.vx) * 0.6 }
      if (b.x > w - b.r - 20) { b.x = w - b.r - 20; b.vx = -Math.abs(b.vx) * 0.6 }
      if (b.y < b.r + 20) { b.y = b.r + 20; b.vy = Math.abs(b.vy) * 0.6 }
      if (b.y > h - b.r - 20) { b.y = h - b.r - 20; b.vy = -Math.abs(b.vy) * 0.6 }

      // Radius smoothing
      b.r += (b.targetR - b.r) * 0.08
    }

    // Very light repulsion
    for (let i = 0; i < bubbles.length; i++) {
      for (let j = i + 1; j < bubbles.length; j++) {
        const a = bubbles[i]
        const b = bubbles[j]
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.hypot(dx, dy) || 1
        const minDist = a.r + b.r + 6

        if (dist < minDist) {
          const force = (minDist - dist) / minDist * 0.6
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          a.vx -= fx
          a.vy -= fy
          b.vx += fx
          b.vy += fy
        }
      }
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

      // Glow
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

      // Specular
      ctx.globalAlpha = 0.6
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.26, 0, Math.PI * 2)
      ctx.fill()

      // Simple ring for larger planets
      if (r > 26) {
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = isGainer ? '#86efac' : '#fda4af'
        ctx.lineWidth = r * 0.09
        ctx.beginPath()
        ctx.ellipse(x, y + r * 0.08, r * 1.65, r * 0.32, -0.4, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalAlpha = 1
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

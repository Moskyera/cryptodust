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
  sizeMetric?: 'market_cap' | 'volume' | 'price'
  paused?: boolean
  onTogglePaused?: () => void
}

export function Visualization({ 
  tokens, 
  selectedId: externalSelectedId, 
  onSelect, 
  favorites = [], 
  highlightUntil = 0,
  sizeMetric = 'market_cap',
  paused = false,
  onTogglePaused
}: VisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsContainerRef = useRef<HTMLDivElement>(null)
  const bubblesRef = useRef<Bubble[]>([])
  const animationRef = useRef<number>()
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())

  // Drag-to-fling state (for smooth grab & throw interaction)
  const draggingIdRef = useRef<string | null>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const lastDragPosRef = useRef({ x: 0, y: 0, time: 0 }) // for calculating fling velocity on release

  // Use external selection if provided, otherwise fall back to internal (for standalone use)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null)
  const selectedId = externalSelectedId !== undefined ? externalSelectedId : internalSelectedId
  const setSelectedId: (id: string | null) => void = onSelect || setInternalSelectedId

  // Initialize bubbles when the *set* of tokens changes (prevents reset on selection/click)
  useEffect(() => {
    if (!tokens.length) return

    const canvas = canvasRef.current
    if (!canvas) return

    const currentIds = new Set(bubblesRef.current.map(b => b.id))
    const newIds = new Set(tokens.map(t => t.id))

    // Re-initialize bubbles when the visible set of coins changes (from filters, search, pages, etc.)
    // This ensures buttons like Quick Filters and Highlight work immediately without selecting a planet first
    const idsChanged = 
      currentIds.size !== newIds.size || 
      [...newIds].some(id => !currentIds.has(id))

    // Also force re-init if the number of visible planets changed a lot (better responsiveness)
    const countChangedSignificantly = Math.abs(bubblesRef.current.length - tokens.length) > 5

    if (!idsChanged && !countChangedSignificantly) return

    const w = canvas.width || window.innerWidth * 1.5
    const h = canvas.height || window.innerHeight * 1.5

    const getBaseRadius = (coin: TokenPrice) => {
      if (sizeMetric === 'volume') {
        return Math.max(26, Math.min(130, 38 + Math.log10((coin.total_volume || 1e8) / 1e8) * 13))
      } else if (sizeMetric === 'price') {
        return Math.max(26, Math.min(130, 30 + Math.log10(Math.max(1, coin.current_price || 1)) * 10))
      }
      // default: market_cap
      return Math.max(26, Math.min(130, 38 + Math.log10((coin.market_cap || 1e8) / 1e8) * 14))
    }

    const newBubbles: Bubble[] = tokens.slice(0, 500).map((coin) => {
      const baseR = getBaseRadius(coin)
      return {
        id: coin.id,
        x: 80 + Math.random() * (w - 160),
        y: 80 + Math.random() * (h - 160),
        vx: (Math.random() - 0.5) * 2.45,
        vy: (Math.random() - 0.5) * 2.45,
        r: baseR * 0.75,
        targetR: baseR,
        coin,
      }
    })

    bubblesRef.current = newBubbles
  }, [tokens, sizeMetric])

  // Physics + Render loop (fully self-contained, balanced braces)
  const tick = useCallback(() => {
    const canvas = canvasRef.current
    const labelsContainer = labelsContainerRef.current

    if (!canvas || !labelsContainer) {
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

    // Clear background
    ctx.fillStyle = '#0a0a12'
    ctx.fillRect(0, 0, w, h)

    const bubbles = bubblesRef.current
    const isHighlighting = Date.now() < highlightUntil

    // =====================================================
    // PHYSICS SECTION — ONLY RUNS WHEN NOT PAUSED
    // Lively, smooth, persistent motion with perfect screen bounds
    // =====================================================
    if (!paused) {
      const SUBSTEPS = 4   // higher = silkier integration with soft forces

      // Handle active drag-to-fling (direct position control feels instant & smooth)
      const draggingId = draggingIdRef.current
      if (draggingId) {
        const db = bubbles.find(b => b.id === draggingId)
        if (db) {
          const mx = mouseRef.current.x
          const my = mouseRef.current.y

          // Direct position following (best responsiveness)
          const dx = mx - db.x
          const dy = my - db.y

          // Nice springy follow velocity so the fling on release feels natural
          db.vx = dx * 0.42
          db.vy = dy * 0.42

          db.x = mx
          db.y = my

          // Keep it inside while dragging too
          const m = db.r + 8
          db.x = Math.max(m, Math.min(w - m, db.x))
          db.y = Math.max(m, Math.min(h - m, db.y))
        }
      }

      for (let step = 0; step < SUBSTEPS; step++) {
        // 1) Integrate + ultra-low friction (they drift beautifully for a long time)
        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i]

          b.x += b.vx
          b.y += b.vy

          // Very low friction — this is the key for "alive" non-static feeling
          b.vx *= 0.9982
          b.vy *= 0.9982

          // Smooth radius change (Size By)
          b.r += (b.targetR - b.r) * 0.085
        }

        // 2) Soft, springy pairwise separation (gentle, never jerky)
        const COMFORT = 78
        for (let i = 0; i < bubbles.length; i++) {
          for (let j = i + 1; j < bubbles.length; j++) {
            const a = bubbles[i]
            const bb = bubbles[j]
            const dx = bb.x - a.x
            const dy = bb.y - a.y
            const d = Math.hypot(dx, dy) || 1.0
            const want = a.r + bb.r + COMFORT

            if (d < want) {
              // Soft spring force (no crazy multipliers = no stutter)
              const overlap = (want - d)
              const f = Math.min(overlap * 0.031, 1.9)

              const fx = (dx / d) * f
              const fy = (dy / d) * f

              a.vx -= fx * 0.85
              a.vy -= fy * 0.85
              bb.vx += fx * 0.85
              bb.vy += fy * 0.85

              // Tiny jitter only when really penetrating (prevents perfect grid lock)
              if (overlap > 18) {
                const j = 0.009
                a.vx += (Math.random() - 0.5) * j
                a.vy += (Math.random() - 0.5) * j
                bb.vx += (Math.random() - 0.5) * j
                bb.vy += (Math.random() - 0.5) * j
              }
            }
          }
        }

        // 3) Gentle continuous "life" force — planets never completely freeze
        // This makes the motion feel organic and smooth forever
        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i]
          // Very small random acceleration ~8% of the time
          if (Math.random() < 0.085) {
            b.vx += (Math.random() - 0.5) * 0.014
            b.vy += (Math.random() - 0.5) * 0.014
          }
        }

        // 4) Soft edge forces + strict bounds + gentle reflection (NEVER escape)
        const hard = 11
        const soft = 78
        const edgeStrength = 0.095

        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i]

          // Soft continuous push away from edges (very smooth)
          if (b.x < b.r + soft) {
            const p = (soft - (b.x - b.r)) / soft
            b.vx += edgeStrength * p * 1.7
          }
          if (b.x > w - b.r - soft) {
            const p = (soft - (w - b.r - b.x)) / soft
            b.vx -= edgeStrength * p * 1.7
          }
          if (b.y < b.r + soft) {
            const p = (soft - (b.y - b.r)) / soft
            b.vy += edgeStrength * p * 1.7
          }
          if (b.y > h - b.r - soft) {
            const p = (soft - (h - b.r - b.y)) / soft
            b.vy -= edgeStrength * p * 1.7
          }

          // Final hard safety clamp (impossible to leave)
          const left = b.r + hard
          const right = w - b.r - hard
          const top = b.r + hard
          const bottom = h - b.r - hard

          if (b.x < left) {
            b.x = left
            b.vx = Math.abs(b.vx) * 0.72   // gentle reflection, keeps energy
          }
          if (b.x > right) {
            b.x = right
            b.vx = -Math.abs(b.vx) * 0.72
          }
          if (b.y < top) {
            b.y = top
            b.vy = Math.abs(b.vy) * 0.72
          }
          if (b.y > bottom) {
            b.y = bottom
            b.vy = -Math.abs(b.vy) * 0.72
          }

          // Velocity safety cap (slightly higher so flings feel good)
          const maxV = 3.6
          const sp = Math.hypot(b.vx, b.vy)
          if (sp > maxV) {
            const s = maxV / sp
            b.vx *= s
            b.vy *= s
          }
        }
      }
    }
    // ==================== END PHYSICS ====================

    // Visual velocity kick on big movers while highlight is active (works even when paused)
    if (isHighlighting) {
      bubbles.forEach(b => {
        const ch = Math.abs(b.coin.price_change_percentage_24h || 0)
        if (ch > 6) {
          const k = (ch - 6) * 0.075
          b.vx += (Math.random() - 0.5) * k
          b.vy += (Math.random() - 0.5) * k
        }
      })
    }

    // ==================== DRAW EVERYTHING (always runs) ====================
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

      // Favorite golden pulsing glow
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

      // Big Mover intense layered glow (Highlight Big Movers button)
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

      // Atmospheric outer glow
      ctx.globalAlpha = 0.35
      const glow = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.4, x, y, r * 2.1)
      glow.addColorStop(0, baseColor)
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, r * 2.1, 0, Math.PI * 2)
      ctx.fill()

      // Solid planet disk
      ctx.globalAlpha = 0.95
      ctx.fillStyle = baseColor
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      // Real coin logo (inset, clipped, with subtle shadow)
      const img = imageCache.current.get(coin.id)
      if (img && img.complete && img.naturalWidth > 0) {
        const logoSize = r * 1.72
        const logoX = x - logoSize / 2
        const logoY = y - logoSize / 2

        ctx.save()
        ctx.globalAlpha = 0.92
        ctx.shadowColor = 'rgba(0,0,0,0.5)'
        ctx.shadowBlur = 6
        ctx.shadowOffsetX = 1
        ctx.shadowOffsetY = 1

        ctx.beginPath()
        ctx.arc(x, y, r * 0.92, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(img, logoX, logoY, logoSize, logoSize)
        ctx.restore()
      } else if (coin.image && !imageCache.current.has(coin.id)) {
        const newImg = new Image()
        newImg.crossOrigin = 'anonymous'
        newImg.src = coin.image
        newImg.onload = () => {
          imageCache.current.set(coin.id, newImg)
        }
        imageCache.current.set(coin.id, newImg)
      }

      // Specular highlight (shiny top-left)
      ctx.globalAlpha = 0.6
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.26, 0, Math.PI * 2)
      ctx.fill()

      // Attractive rings (especially visible on larger planets)
      if (r > 26) {
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = isGainer ? '#86efac' : '#fda4af'
        ctx.lineWidth = r * 0.09
        ctx.beginPath()
        ctx.ellipse(x, y + r * 0.08, r * 1.65, r * 0.32, -0.4, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalAlpha = 1.0

      // Selection rings (cyan)
      if (selectedId === coin.id) {
        ctx.globalAlpha = 0.85
        ctx.strokeStyle = '#67f6ff'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(x, y, r + 6, 0, Math.PI * 2)
        ctx.stroke()

        const pulse = Math.sin(Date.now() / 280) * 0.6 + 1.6
        ctx.globalAlpha = 0.55
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, r + 14 + pulse, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Orbiting sparkles when a big mover is highlighted
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

    // DOM labels (always updated so they stay correct even when paused)
    updateLabels(bubbles, labelsContainer)

    // Schedule next frame ONLY when physics is running
    if (!paused) {
      animationRef.current = requestAnimationFrame(tick)
    }
  }, [selectedId, paused, highlightUntil, favorites, sizeMetric, onTogglePaused])

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

    // Only start the animation loop if not paused
    if (!paused) {
      animationRef.current = requestAnimationFrame(tick)
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [tick, resizeCanvas, paused])

  // Convert screen/client coords to canvas world coords
  const screenToWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  // Hit test + start dragging for fling
  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)

    const currentBubbles = bubblesRef.current
    let closest: Bubble | null = null
    let minDist = Infinity

    for (let i = 0; i < currentBubbles.length; i++) {
      const b = currentBubbles[i]
      const dist = Math.hypot(b.x - wx, b.y - wy)
      if (dist < b.r * 1.75 && dist < minDist) {
        minDist = dist
        closest = b
      }
    }

    if (closest) {
      // Start dragging this planet
      draggingIdRef.current = closest.id
      mouseRef.current = { x: wx, y: wy }
      lastDragPosRef.current = { x: wx, y: wy, time: Date.now() }

      // Capture pointer so we get move/up events even if mouse leaves the canvas
      canvas.setPointerCapture(e.pointerId)

      // Select it immediately (nice feedback)
      setSelectedId(closest.id)

      // Give it a little kick so it feels responsive right away
      closest.vx *= 0.3
      closest.vy *= 0.3
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)
    mouseRef.current = { x: wx, y: wy }

    if (draggingIdRef.current) {
      // Update last pos for fling calculation (throttled a bit)
      const now = Date.now()
      if (now - lastDragPosRef.current.time > 16) {
        lastDragPosRef.current = { x: wx, y: wy, time: now }
      }
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    const canvas = canvasRef.current
    const draggedId = draggingIdRef.current

    if (draggedId && canvas) {
      // Try to release capture (safe if not captured)
      try { canvas.releasePointerCapture(e.pointerId) } catch {}

      const { x: wx, y: wy } = screenToWorld(e.clientX, e.clientY)

      // Calculate fling velocity from drag movement
      const prev = lastDragPosRef.current
      const dt = Math.max(16, Date.now() - prev.time)
      let flingX = ((wx - prev.x) / dt) * 18   // tuned multiplier for nice throw strength
      let flingY = ((wy - prev.y) / dt) * 18

      // Clamp fling so it doesn't get ridiculous
      const maxFling = 3.8
      const flingSpeed = Math.hypot(flingX, flingY)
      if (flingSpeed > maxFling) {
        const s = maxFling / flingSpeed
        flingX *= s
        flingY *= s
      }

      // Apply the fling to the planet
      const b = bubblesRef.current.find(bb => bb.id === draggedId)
      if (b) {
        b.vx = flingX
        b.vy = flingY
      }
    }

    draggingIdRef.current = null
  }

  const handlePointerLeave = () => {
    // If user drags off the canvas, still end the drag cleanly (fling with last known delta)
    if (draggingIdRef.current) {
      const draggedId = draggingIdRef.current
      const prev = lastDragPosRef.current
      const b = bubblesRef.current.find(bb => bb.id === draggedId)
      if (b) {
        // Gentle release fling using last recorded direction
        b.vx = (b.vx + (mouseRef.current.x - prev.x) * 0.6) * 0.7
        b.vy = (b.vy + (mouseRef.current.y - prev.y) * 0.6) * 0.7
      }
    }
    draggingIdRef.current = null
  }

  return (
    <div className="viz-container">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerLeave}
        className="cursor-grab active:cursor-grabbing touch-none"
      />
      <div 
        ref={labelsContainerRef} 
        className="absolute inset-0 pointer-events-none z-20" 
      />

      <div className="absolute top-4 left-4 hud px-4 py-2 rounded-2xl text-xs flex items-center gap-x-4 z-30">
        <div>Visible: <span className="font-semibold tabular-nums">{tokens.length}</span></div>
        <div className="w-px h-3 bg-white/20" />
        <div 
          onClick={onTogglePaused}
          className={`cursor-pointer transition-colors ${paused ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
          title="Click to pause or resume physics"
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </div>
        <div className="text-[#6b7280]">•</div>
        <div className="text-white/70">Drag planets to fling them</div>
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

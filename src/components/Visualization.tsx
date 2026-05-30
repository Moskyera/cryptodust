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
  // Personality / Temperament system (Proposal 2 - chosen by user)
  restlessness: number      // How "lively" this planet is (higher = more idle movement)
  driftBiasX: number        // Personal subtle directional preference
  driftBiasY: number
  // Locked base size so planets don't keep growing just because price/market cap moves
  baseRadius: number
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
  planetScale?: number
  isMobile?: boolean   // explicit for aggressive mobile perf paths
}

export function Visualization({ 
  tokens, 
  selectedId: externalSelectedId, 
  onSelect, 
  favorites = [], 
  highlightUntil = 0,
  sizeMetric = 'market_cap',
  paused = false,
  onTogglePaused,
  planetScale = 1,
  isMobile: explicitIsMobile
}: VisualizationProps) {
  const isMobile = explicitIsMobile ?? (planetScale < 0.7)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const labelsContainerRef = useRef<HTMLDivElement>(null)
  const bubblesRef = useRef<Bubble[]>([])
  const animationRef = useRef<number>()
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map())

  // Drag-to-fling state (for smooth grab & throw interaction)
  const draggingIdRef = useRef<string | null>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const lastDragPosRef = useRef({ x: 0, y: 0, time: 0 }) // for calculating fling velocity on release

  // Hover preview state (desktop UX polish) — separate from selection/click
  const hoveredIdRef = useRef<string | null>(null)
  const lastHoverCheckRef = useRef(0)

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
    // Sizes are locked at creation time (via baseRadius) so planets don't keep inflating as prices move.
    const idsChanged = 
      currentIds.size !== newIds.size || 
      [...newIds].some(id => !currentIds.has(id))

    // Also force re-init if the number of visible planets changed a lot (better responsiveness)
    const countChangedSignificantly = Math.abs(bubblesRef.current.length - tokens.length) > 5

    if (!idsChanged && !countChangedSignificantly) return

    const w = canvas.width || window.innerWidth * 1.5
    const h = canvas.height || window.innerHeight * 1.5

    const getBaseRadius = (coin: TokenPrice) => {
      const base = sizeMetric === 'volume'
        ? 28 + Math.log10((coin.total_volume || 1e8) / 1e8) * 10
        : sizeMetric === 'price'
          ? 22 + Math.log10(Math.max(1, coin.current_price || 1)) * 8
          : 28 + Math.log10((coin.market_cap || 1e8) / 1e8) * 11

      const scaled = Math.max(18, Math.min(92, base)) * planetScale

      // On mobile we want significantly smaller planets for readability
      const mobileMax = planetScale < 0.7 ? 46 : 75
      return Math.max(12, Math.min(mobileMax, scaled))
    }

    const newBubbles: Bubble[] = tokens.slice(0, 500).map((coin) => {
      const baseR = getBaseRadius(coin)
      // Assign personality (Proposal 2 - Planet Temperaments)
      const restlessness = 0.45 + Math.random() * 1.75   // range ~0.45 - 2.2
      const driftBiasX = (Math.random() - 0.5) * 0.009
      const driftBiasY = (Math.random() - 0.5) * 0.009

      // Larger safe spawn area on mobile so planets start well inside the screen
      const spawnPadding = isMobile ? 60 : 80
      return {
        id: coin.id,
        x: spawnPadding + Math.random() * (w - spawnPadding * 2),
        y: spawnPadding + Math.random() * (h - spawnPadding * 2),
        vx: (Math.random() - 0.5) * 1.85,
        vy: (Math.random() - 0.5) * 1.85,
        r: baseR * 0.75,
        targetR: baseR,
        coin,
        restlessness,
        driftBiasX,
        driftBiasY,
        baseRadius: baseR,   // lock the size at creation time
      }
    })

    bubblesRef.current = newBubbles
  }, [tokens])   // Note: sizeMetric no longer triggers full recreate (we update targetR live below)

  // Live update targetR when Size By changes → smooth planet resizing without resetting positions
  useEffect(() => {
    if (!bubblesRef.current.length) return

    const getBaseRadius = (coin: TokenPrice) => {
      const base = sizeMetric === 'volume'
        ? 28 + Math.log10((coin.total_volume || 1e8) / 1e8) * 10
        : sizeMetric === 'price'
          ? 22 + Math.log10(Math.max(1, coin.current_price || 1)) * 8
          : 28 + Math.log10((coin.market_cap || 1e8) / 1e8) * 11

      const scaled = Math.max(18, Math.min(92, base)) * planetScale
      const mobileMax = planetScale < 0.7 ? 46 : 75
      return Math.max(12, Math.min(mobileMax, scaled))
    }

    bubblesRef.current.forEach(b => {
      const newBase = getBaseRadius(b.coin)
      b.baseRadius = newBase
      b.targetR = newBase
    })
  }, [sizeMetric, planetScale])

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

    // No artificial frame throttling on mobile.
    // We keep full speed + drawing simplification during drag (see simplifyForDrag below)
    // This makes touch feel much more direct and responsive, like cryptobubbles.net on phone.
    const isDragging = !!draggingIdRef.current

    // Clear background
    ctx.fillStyle = '#0a0a12'
    ctx.fillRect(0, 0, w, h)

    const bubbles = bubblesRef.current
    const isHighlighting = Date.now() < highlightUntil

    // On mobile during drag, simplify drawing *very* aggressively to eliminate lag / jank
    const simplifyForDrag = isMobile && isDragging

    // =====================================================
    // PHYSICS SECTION — ONLY RUNS WHEN NOT PAUSED
    // Lively, smooth, persistent motion with perfect screen bounds
    // =====================================================
    if (!paused) {
      const SUBSTEPS = 1   // 1 = big perf win, still feels lively with current personality + drift system

      // Handle active drag-to-fling — IMPORTANT: zero velocity while dragging to prevent shake
      const draggingId = draggingIdRef.current
      if (draggingId) {
        const db = bubbles.find(b => b.id === draggingId)
        if (db) {
          const mx = mouseRef.current.x
          const my = mouseRef.current.y

          // Direct position control (smooth, no velocity fighting)
          db.x = mx
          db.y = my
          db.vx = 0
          db.vy = 0

          // Keep it inside the visible safe area while dragging (especially important on mobile)
          const m = db.r + (isMobile ? 45 : 8)
          const dragBottomReserve = isMobile ? 110 : 0
          db.x = Math.max(m, Math.min(w - m, db.x))
          db.y = Math.max(m, Math.min(h - m - dragBottomReserve, db.y))
        }
      }

      for (let step = 0; step < SUBSTEPS; step++) {
        // 1) Integrate + ultra-low friction (they drift beautifully for a long time)
        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i]

          b.x += b.vx
          b.y += b.vy

          // Friction with personality variation (restless planets are noticeably more "floaty" and keep moving longer)
          const baseFriction = 0.9945
          const friction = baseFriction - (b.restlessness - 1) * 0.0018
          const finalFriction = Math.max(0.988, Math.min(0.997, friction))
          b.vx *= finalFriction
          b.vy *= finalFriction

          // Smooth radius change (Size By) — uses the locked baseRadius so planets don't keep growing with live prices
          b.r += (b.targetR - b.r) * 0.085
        }

        // 2) Gentle push ONLY when planets are about to touch (user request)
        // Planets should float freely with smooth movement and only bump each other when nearly colliding.
        const TOUCH_COMFORT = 14   // very small — push starts only when almost touching
        for (let i = 0; i < bubbles.length; i++) {
          for (let j = i + 1; j < bubbles.length; j++) {
            const a = bubbles[i]
            const bb = bubbles[j]
            const dx = bb.x - a.x
            const dy = bb.y - a.y
            const d = Math.hypot(dx, dy) || 1.0
            const want = a.r + bb.r + TOUCH_COMFORT

            if (d < want) {
              // Very soft, short-range push (feels natural)
              const overlap = (want - d)
              const f = Math.min(overlap * 0.022, 1.2)   // gentle force

              const fx = (dx / d) * f
              const fy = (dy / d) * f

              // Slight personality influence on how much they get pushed (restless = more reactive)
              const pushInfluenceA = 0.9 + (a.restlessness - 1) * 0.08
              const pushInfluenceB = 0.9 + (bb.restlessness - 1) * 0.08

              a.vx -= fx * pushInfluenceA
              a.vy -= fy * pushInfluenceA
              bb.vx += fx * pushInfluenceB
              bb.vy += fy * pushInfluenceB

              // Minimal jitter only on hard collision
              if (overlap > 12) {
                const j = 0.003
                a.vx += (Math.random() - 0.5) * j
                a.vy += (Math.random() - 0.5) * j
                bb.vx += (Math.random() - 0.5) * j
                bb.vy += (Math.random() - 0.5) * j
              }
            }
          }
        }

        // 3) Idle motion with Personality (Proposal 2) - made stronger so planets actually move
        // High-restlessness planets now wake up and drift on their own with visible (but smooth) movement.
        // Calm planets stay mostly still. No high-frequency jitter.
        for (let i = 0; i < bubbles.length; i++) {
          const b = bubbles[i]
          const speed = Math.hypot(b.vx, b.vy)

          // Occasional "wake up" kick for lively planets when they are very still
          if (b.restlessness > 1.0 && speed < 0.3 && Math.random() < (0.025 * b.restlessness)) {
            const cruiseSpeed = 0.35 + (b.restlessness - 1) * 0.25   // visible but gentle speed
            b.vx = b.driftBiasX * cruiseSpeed * 2.2 + (Math.random() - 0.5) * 0.2
            b.vy = b.driftBiasY * cruiseSpeed * 2.2 + (Math.random() - 0.5) * 0.2
          }

          // Continuous personality drift (lively planets slowly keep moving)
          if (speed < 0.5) {
            const driftStrength = 0.0022 * b.restlessness
            b.vx += b.driftBiasX * driftStrength
            b.vy += b.driftBiasY * driftStrength
          }
        }

        // 4) Extremely strong stability for the selected planet
        // This is the main fix for the "tremble when I click" problem.
        // While selected, we aggressively kill velocity so the rotating rings stay rock solid.
        if (selectedId) {
          const sel = bubbles.find(b => b.id === selectedId)
          if (sel) {
            // Very aggressive damping
            sel.vx *= 0.82
            sel.vy *= 0.82

            // Hard deadzone — if slow enough, stop completely
            const s = Math.hypot(sel.vx, sel.vy)
            if (s < 1.1) {
              sel.vx = 0
              sel.vy = 0
            }
          }
        }

        // 5) Soft edge forces + strict bounds (gentler to avoid constant small pushes)
        // On mobile we want planets to stay comfortably inside the visible screen area,
        // accounting for the bottom info panel and market tab that overlay/cover the lower part.
        const hard = isMobile ? 42 : 12
        const soft = isMobile ? 100 : 55
        const edgeStrength = isMobile ? 0.09 : 0.065

        // Reserve space for the compact bottom info bar + market tab on mobile
        const mobileBottomReserve = isMobile ? 125 : 0   // increased slightly for richer mobile info panel

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
          if (b.y > h - b.r - soft - mobileBottomReserve) {
            const p = (soft - (h - b.r - mobileBottomReserve - b.y)) / soft
            b.vy -= edgeStrength * p * 1.7
          }

          // Final hard safety clamp (impossible to leave)
          // Very aggressive on mobile — planets literally cannot leave the visible screen
          const extraMobileMargin = isMobile ? 32 : 0
          const left = b.r + hard
          const right = w - b.r - hard - extraMobileMargin
          const top = b.r + hard
          const bottom = h - b.r - hard - extraMobileMargin - mobileBottomReserve

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

          // Velocity safety cap — lower on mobile to prevent planets from overshooting the walls
          const maxV = isMobile ? 2.8 : 3.6
          const sp = Math.hypot(b.vx, b.vy)
          if (sp > maxV) {
            const s = maxV / sp
            b.vx *= s
            b.vy *= s
          }

          // Global velocity deadzone — lively planets (high restlessness) have higher threshold so they can keep their own slow movement
          const finalSpeed = Math.hypot(b.vx, b.vy)
          const deadzoneThreshold = 0.12 + (b.restlessness - 1) * 0.04
          if (finalSpeed < deadzoneThreshold) {
            b.vx = 0
            b.vy = 0
          }
        }

        // Final emergency hard clamp pass for mobile — guarantees planets can NEVER leave the visible screen
        // even after high-velocity flings or between substeps
        // Final hard safety net for mobile — very important so planets never escape the visible area
        if (isMobile) {
          const finalHard = 45
          const finalBottomReserve = 125
          for (let i = 0; i < bubbles.length; i++) {
            const b = bubbles[i]
            const minX = b.r + finalHard
            const maxX = w - b.r - finalHard - 35
            const minY = b.r + finalHard
            const maxY = h - b.r - finalHard - finalBottomReserve - 35

            if (b.x < minX) { b.x = minX; b.vx = Math.abs(b.vx) * 0.55 }
            if (b.x > maxX) { b.x = maxX; b.vx = -Math.abs(b.vx) * 0.55 }
            if (b.y < minY) { b.y = minY; b.vy = Math.abs(b.vy) * 0.55 }
            if (b.y > maxY) { b.y = maxY; b.vy = -Math.abs(b.vy) * 0.55 }
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

      // Favorite golden pulsing glow — skip during mobile drag for smoothness
      if (!simplifyForDrag && isFavorite && r > 18) {
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

      // Big Mover intense layered glow — skip during mobile drag
      if (!simplifyForDrag && isCurrentlyHighlighted && r > 16) {
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

      // Atmospheric outer glow — skip during mobile drag for performance
      if (!simplifyForDrag && r > 14) {
        ctx.globalAlpha = 0.35
        const glow = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.4, x, y, r * 2.1)
        glow.addColorStop(0, baseColor)
        glow.addColorStop(1, 'transparent')
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(x, y, r * 2.1, 0, Math.PI * 2)
        ctx.fill()
      }

      // Solid planet disk
      ctx.globalAlpha = simplifyForDrag ? 0.85 : 0.95
      ctx.fillStyle = baseColor
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()

      // Real coin logo — completely skip during mobile drag for max performance
      if (!simplifyForDrag) {
        const img = imageCache.current.get(coin.id)
        if (img && img.complete && img.naturalWidth > 0) {
          // Preserve original image aspect ratio so logos don't look stretched/pressed
          const maxLogoDiameter = r * 1.68
          const imgAspect = img.width / img.height

          let drawW, drawH

          if (imgAspect > 1) {
            // image is wider
            drawW = maxLogoDiameter
            drawH = maxLogoDiameter / imgAspect
          } else {
            // image is taller or square
            drawH = maxLogoDiameter
            drawW = maxLogoDiameter * imgAspect
          }

          const logoX = x - drawW / 2
          const logoY = y - drawH / 2

          ctx.save()
          ctx.globalAlpha = 0.92

          if (r > 18) {
            ctx.shadowColor = 'rgba(0,0,0,0.5)'
            ctx.shadowBlur = 5
            ctx.shadowOffsetX = 1
            ctx.shadowOffsetY = 1
          }

          // Circular mask - slightly smaller than the planet for a nice border
          ctx.beginPath()
          ctx.arc(x, y, r * 0.88, 0, Math.PI * 2)
          ctx.clip()

          ctx.drawImage(img, logoX, logoY, drawW, drawH)
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
      }

      // Specular highlight (shiny top-left) — skip during mobile drag
      if (!simplifyForDrag && r > 15) {
        ctx.globalAlpha = 0.6
        ctx.fillStyle = '#ffffff'
        ctx.beginPath()
        ctx.arc(x - r * 0.3, y - r * 0.32, r * 0.26, 0, Math.PI * 2)
        ctx.fill()
      }

      // Attractive rings (especially visible on larger planets) — skip during drag
      if (!simplifyForDrag && r > 26) {
        ctx.globalAlpha = 0.55
        ctx.strokeStyle = isGainer ? '#86efac' : '#fda4af'
        ctx.lineWidth = r * 0.09
        ctx.beginPath()
        ctx.ellipse(x, y + r * 0.08, r * 1.65, r * 0.32, -0.4, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalAlpha = 1.0

      // Selection effect — beautiful rotating orbiting ring (as requested)
      if (selectedId === coin.id) {
        const t = Date.now()

        // Soft wide cyan glow (stable, no tremble)
        ctx.globalAlpha = 0.22
        ctx.fillStyle = '#67f6ff'
        ctx.beginPath()
        ctx.arc(x, y, r + 28, 0, Math.PI * 2)
        ctx.fill()

        // Main crisp ring (slightly pulsing radius but very subtle)
        ctx.globalAlpha = 0.95
        ctx.strokeStyle = '#67f6ff'
        ctx.lineWidth = isMobile ? 2.0 : 2.6   // richer on desktop
        const ringRadius = r + 7.5 + Math.sin(t / 520) * 0.8
        ctx.beginPath()
        ctx.arc(x, y, ringRadius, 0, Math.PI * 2)
        ctx.stroke()

        // Extra "locked focus" outer ring — desktop only (stronger premium selection state)
        if (!isMobile) {
          ctx.globalAlpha = 0.28
          ctx.strokeStyle = '#67f6ff'
          ctx.lineWidth = 1.0
          ctx.beginPath()
          ctx.arc(x, y, r + 32, 0, Math.PI * 2)
          ctx.stroke()
        }

        // Rotating dashed energy ring (the "spinning" feeling)
        ctx.globalAlpha = 0.75
        ctx.lineWidth = 1.6
        ctx.strokeStyle = '#a5f3fc'
        ctx.setLineDash([4, 7])
        ctx.lineDashOffset = -(t / 220) % 22   // even calmer rotation
        ctx.beginPath()
        ctx.arc(x, y, r + 13, 0, Math.PI * 2)
        ctx.stroke()
        ctx.setLineDash([])

        // Orbiting bright particles — very expensive, completely skip during mobile drag
        if (!simplifyForDrag && r > 20) {
          ctx.globalAlpha = 1.0
          const orbitCount = isMobile ? 3 : 5   // richer desktop selection energy
          for (let i = 0; i < orbitCount; i++) {
            const speed1 = t / 720 + (i * (Math.PI * 2 / orbitCount))
            const speed2 = t / 1050 + (i * 1.7)

            const dist = r + 17.5 + Math.sin(speed2) * 2.2
            const ox = x + Math.cos(speed1) * dist
            const oy = y + Math.sin(speed1) * dist * 0.93

            ctx.fillStyle = '#67f6ff'
            ctx.beginPath()
            ctx.arc(ox, oy, isMobile ? 1.7 : 2.1, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = '#ffffff'
            ctx.beginPath()
            ctx.arc(ox, oy, isMobile ? 0.75 : 0.95, 0, Math.PI * 2)
            ctx.fill()
          }

          // Second orbit — only on bigger planets (more particles on desktop)
          if (r > 26) {
            const secondCount = isMobile ? 2 : 3
            for (let i = 0; i < secondCount; i++) {
              const angle = (t / 1650) + (i * 1.8)
              const dist2 = r + 25 + Math.cos(t / 820 + i) * 1.5
              const ox2 = x + Math.cos(angle) * dist2
              const oy2 = y + Math.sin(angle) * dist2 * 0.9

              ctx.fillStyle = i % 2 === 0 ? '#a5f3fc' : '#67f6ff'
              ctx.beginPath()
              ctx.arc(ox2, oy2, isMobile ? 1.4 : 1.7, 0, Math.PI * 2)
              ctx.fill()
            }
          }
        }
      }

      // DESKTOP HOVER PREVIEW (Visual & UX Polish item 4)
      // Soft elegant ring + floating info badge when hovering a planet (without selecting it)
      // Gives instant rich feedback and "mini info on hover" feel on desktop only
      if (!isMobile && !simplifyForDrag && hoveredIdRef.current === coin.id && selectedId !== coin.id) {
        const t = Date.now()

        // Very soft wide preview ring (distinct from selection, gentle presence)
        ctx.globalAlpha = 0.13
        ctx.fillStyle = '#e0f2fe'
        ctx.beginPath()
        ctx.arc(x, y, r + 36, 0, Math.PI * 2)
        ctx.fill()

        ctx.globalAlpha = 0.65
        ctx.strokeStyle = '#bae6fd'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, r + 18 + Math.sin(t / 640) * 0.6, 0, Math.PI * 2)
        ctx.stroke()

        // Tiny floating info badge (drawn in canvas — clean, no DOM sync)
        ctx.globalAlpha = 0.92
        const badgePrice = coin.current_price || 0
        const badgeChg = coin.price_change_percentage_24h || 0

        // Better price formatting for very small coins (common in PulseChain)
        let priceLabel: string
        if (badgePrice >= 1000) {
          priceLabel = '$' + badgePrice.toFixed(0)
        } else if (badgePrice >= 1) {
          priceLabel = '$' + badgePrice.toFixed(2)
        } else if (badgePrice >= 0.01) {
          priceLabel = '$' + badgePrice.toFixed(4)
        } else if (badgePrice >= 0.0001) {
          priceLabel = '$' + badgePrice.toFixed(6)
        } else if (badgePrice >= 0.000001) {
          priceLabel = '$' + badgePrice.toFixed(8)
        } else {
          priceLabel = '$' + badgePrice.toExponential(2)
        }
        const chgLabel = (badgeChg > 0 ? '+' : '') + badgeChg.toFixed(1) + '%'

        // Measure text for pill background
        ctx.font = '600 11px Inter, system-ui, sans-serif'
        const textW = ctx.measureText(coin.symbol + '  ' + priceLabel + '  ' + chgLabel).width
        const pillW = Math.max(78, textW + 22)
        const pillH = 19
        const pillX = x - pillW / 2
        const pillY = y - r - 29

        // Subtle pill background (reliable, works on all browsers)
        ctx.fillStyle = 'rgba(17,17,24,0.92)'
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, pillH, 5)
        ctx.fill()

        // Border accent
        ctx.strokeStyle = 'rgba(103,246,255,0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.roundRect(pillX, pillY, pillW, pillH, 5)
        ctx.stroke()

        // Text content
        ctx.fillStyle = '#e0f2fe'
        ctx.fillText(coin.symbol, pillX + 9, pillY + 13.5)

        ctx.fillStyle = '#f1f5f9'
        ctx.fillText(priceLabel, pillX + 9 + ctx.measureText(coin.symbol + '  ').width, pillY + 13.5)

        ctx.fillStyle = badgeChg >= 0 ? '#4ade80' : '#f87171'
        ctx.fillText(chgLabel, pillX + pillW - 9 - ctx.measureText(chgLabel).width, pillY + 13.5)

        ctx.globalAlpha = 1.0
      }

      // Orbiting sparkles when a big mover is highlighted — skip entirely during mobile drag
      if (!simplifyForDrag && isCurrentlyHighlighted && r > 18) {
        const t = Date.now()
        ctx.globalAlpha = 0.9
        const sparkCount = isMobile ? 3 : 4
        for (let s = 0; s < sparkCount; s++) {
          const angle = (t / 420) + (s * (Math.PI * 2 / sparkCount))
          const dist = r * (1.35 + Math.sin(t / 180 + s) * 0.15)
          const sx = x + Math.cos(angle) * dist
          const sy = y + Math.sin(angle) * dist * 0.9
          const sparkSize = 1.4 + Math.sin(t / 110 + s * 2) * 0.6

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

    // Labels are completely disabled on mobile (as per previous requirement)
    if (!isMobile) {
      updateLabels(bubbles, labelsContainer)
    }

    // Schedule next frame ONLY when physics is running
    if (!paused) {
      animationRef.current = requestAnimationFrame(tick)
    }
  }, [selectedId, paused, highlightUntil, favorites, sizeMetric, onTogglePaused])

  // Highly optimized label sync — avoids innerHTML and repeated getBoundingClientRect per frame
  const updateLabels = (bubbles: Bubble[], container: HTMLDivElement) => {
    // Completely remove floating labels on mobile (user request: only show name/price when selected)
    if (isMobile) return

    // Compute scale ONCE outside the loop (very expensive otherwise)
    const canvas = canvasRef.current
    const rect = container.getBoundingClientRect()
    const canvasW = canvas?.width || 1600
    const canvasH = canvas?.height || 900
    const scaleX = rect.width / canvasW
    const scaleY = rect.height / canvasH

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
        // Create stable structure once — never use innerHTML again
        label = document.createElement('div')
        label.className = 'bubble-label'
        label.dataset.id = b.id

        const symbol = document.createElement('div')
        symbol.className = 'symbol'
        symbol.dataset.role = 'symbol'

        const row = document.createElement('div')
        row.style.display = 'flex'
        row.style.alignItems = 'baseline'
        row.style.gap = '4px'
        row.style.justifyContent = 'center'
        row.style.marginTop = '1px'

        const priceEl = document.createElement('span')
        priceEl.className = 'price'
        priceEl.dataset.role = 'price'

        const changeEl = document.createElement('span')
        changeEl.className = 'change'
        changeEl.dataset.role = 'change'

        row.appendChild(priceEl)
        row.appendChild(changeEl)

        label.appendChild(symbol)
        label.appendChild(row)
        container.appendChild(label)
      }

      // Position (cheap style writes)
      const screenX = b.x * scaleX
      const screenY = b.y * scaleY + b.r * scaleY + 8
      label.style.left = `${screenX}px`
      label.style.top = `${screenY}px`

      // Cheap textContent updates only — no HTML parsing, no reflow storm
      const symbolEl = label.querySelector('[data-role="symbol"]') as HTMLDivElement | null
      const priceEl = label.querySelector('[data-role="price"]') as HTMLSpanElement | null
      const changeEl = label.querySelector('[data-role="change"]') as HTMLSpanElement | null

      if (symbolEl && symbolEl.textContent !== b.coin.symbol) {
        symbolEl.textContent = b.coin.symbol
      }

      const price = b.coin.current_price || 0
      let priceStr: string
      if (price >= 1000) {
        priceStr = '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 })
      } else if (price >= 1) {
        priceStr = '$' + price.toFixed(2)
      } else if (price >= 0.01) {
        priceStr = '$' + price.toFixed(4)
      } else if (price >= 0.0001) {
        priceStr = '$' + price.toFixed(6)
      } else if (price >= 0.000001) {
        priceStr = '$' + price.toFixed(8)
      } else {
        priceStr = '$' + price.toExponential(2)
      }

      if (priceEl && priceEl.textContent !== priceStr) {
        priceEl.textContent = priceStr
      }

      const chg = b.coin.price_change_percentage_24h || 0
      const chgClass = chg >= 0 ? 'change-up' : 'change-down'
      const chgStr = (chg >= 0 ? '+' : '') + chg.toFixed(1) + '%'

      if (changeEl) {
        if (changeEl.textContent !== chgStr) changeEl.textContent = chgStr
        if (!changeEl.classList.contains(chgClass)) {
          changeEl.className = `change ${chgClass}`
        }
      }
    })

    existing.forEach((el, id) => {
      if (!visibleIds.has(id)) el.remove()
    })
  }

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const parent = canvas.parentElement
    if (!parent) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2.5)

    let displayWidth = parent.clientWidth
    let displayHeight = parent.clientHeight

    // Mobile-only viewport handling (notch, dynamic island, address bar, keyboard)
    // IMPORTANT: Only apply on mobile so we don't change desktop behavior
    if (isMobile) {
      if ('visualViewport' in window && window.visualViewport) {
        displayHeight = window.visualViewport.height
      }

      // Add extra bottom padding on iOS notched devices (Dynamic Island / notch)
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const extraBottom = isIOS ? 12 : 0
      displayHeight -= extraBottom
    }

    canvas.width = Math.floor(displayWidth * dpr)
    canvas.height = Math.floor(displayHeight * dpr)

    // On desktop we let CSS (width:100%; height:100%) handle sizing cleanly
    // to keep perfect circle rendering. On mobile we set explicit sizes
    // for better control with dynamic viewport.
    if (isMobile) {
      canvas.style.width = displayWidth + 'px'
      canvas.style.height = displayHeight + 'px'
    }

    const ctx = canvas.getContext('2d', { alpha: true })
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    // After resize (especially orientation change), force planets back inside the new bounds
    const bubbles = bubblesRef.current
    if (bubbles.length > 0) {
      const w = canvas.width
      const h = canvas.height
      const mobileBottomReserve = isMobile ? 125 : 0
      const hard = isMobile ? 45 : 12

      bubbles.forEach(b => {
        b.x = Math.max(b.r + hard, Math.min(w - b.r - hard, b.x))
        b.y = Math.max(b.r + hard, Math.min(h - b.r - hard - mobileBottomReserve, b.y))
      })
    }
  }, [isMobile])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    resizeCanvas()

    // Standard resize
    window.addEventListener('resize', resizeCanvas)

    // Very important on mobile: orientation change often needs a small delay
    const handleOrientation = () => setTimeout(resizeCanvas, 150)
    window.addEventListener('orientationchange', handleOrientation)

    // Best practice for modern mobile browsers (dynamic address bar, keyboard, etc.)
    let vvResize: (() => void) | null = null
    if ('visualViewport' in window && window.visualViewport) {
      vvResize = resizeCanvas
      window.visualViewport.addEventListener('resize', vvResize)
    }

    // ResizeObserver for any layout shifts inside the container
    let ro: ResizeObserver | null = null
    const parent = canvas.parentElement
    if (parent && 'ResizeObserver' in window) {
      ro = new ResizeObserver(resizeCanvas)
      ro.observe(parent)
    }

    if (!paused) {
      animationRef.current = requestAnimationFrame(tick)
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas)
      window.removeEventListener('orientationchange', handleOrientation)
      if (vvResize && 'visualViewport' in window && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', vvResize)
      }
      if (ro) ro.disconnect()
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

    // Much better hit detection for mobile:
    // - Use screen pixels for comfortable finger size (min ~30-34px tap radius)
    // - Combine with planet radius but don't over-extend
    // - This prevents "tap empty space selects planet" and "tap one, gets another"
    const rect = canvas.getBoundingClientRect()
    const scale = canvas.width / rect.width

    const minTapRadiusWorld = isMobile ? 38 / scale : 18 / scale   // Slightly larger tap target on mobile for better reliability

    for (let i = 0; i < currentBubbles.length; i++) {
      const b = currentBubbles[i]
      const dist = Math.hypot(b.x - wx, b.y - wy)
      const effectiveRadius = Math.max(b.r * (isMobile ? 2.1 : 1.6), minTapRadiusWorld)

      if (dist < effectiveRadius && dist < minDist) {
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

    // Make drag feel 100% direct and instant on mobile (no waiting for next RAF tick)
    const draggingId = draggingIdRef.current
    if (draggingId) {
      const db = bubblesRef.current.find(b => b.id === draggingId)
      if (db) {
        db.x = wx
        db.y = wy
        db.vx = 0
        db.vy = 0
      }

      // Update last pos for fling calculation (throttled a bit)
      const now = Date.now()
      if (now - lastDragPosRef.current.time > 16) {
        lastDragPosRef.current = { x: wx, y: wy, time: now }
      }
      // While dragging, clear hover preview
      hoveredIdRef.current = null
      return
    }

    // Desktop-only hover preview detection (smooth, cheap, feels premium)
    // Only on desktop and when not interacting — gives rich "info on hover" without clicking
    if (!isMobile) {
      const now = Date.now()
      if (now - lastHoverCheckRef.current > 32) { // ~30fps hover test is plenty
        lastHoverCheckRef.current = now

        const currentBubbles = bubblesRef.current
        let closest: Bubble | null = null
        let minDist = Infinity

        const hoverRadius = 52 // generous comfortable hover target on desktop

        for (let i = 0; i < currentBubbles.length; i++) {
          const b = currentBubbles[i]
          const dist = Math.hypot(b.x - wx, b.y - wy)
          const effective = b.r + hoverRadius
          if (dist < effective && dist < minDist) {
            minDist = dist
            closest = b
          }
        }

        const newHover = closest ? closest.id : null
        if (newHover !== hoveredIdRef.current) {
          hoveredIdRef.current = newHover
        }
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

      // Calculate fling velocity from drag movement (slightly gentler for smoother release)
      const prev = lastDragPosRef.current
      const dt = Math.max(16, Date.now() - prev.time)
      let flingX = ((wx - prev.x) / dt) * 14
      let flingY = ((wy - prev.y) / dt) * 14

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
    hoveredIdRef.current = null // clear hover preview on leave
  }

  return (
    <div className="viz-container">
      <canvas
        ref={canvasRef}
        style={{ touchAction: 'none' }}   // critical for direct, non-laggy touch on mobile
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

      <div className="absolute top-3 left-3 md:top-4 md:left-4 hud px-3 py-1.5 md:px-4 md:py-2 rounded-2xl text-[10px] md:text-xs flex items-center gap-x-2 md:gap-x-4 z-30">
        <div>Visible: <span className="font-semibold tabular-nums">{tokens.length}</span></div>
        <div className="w-px h-3 bg-white/20 hidden md:block" />
        <div 
          onClick={onTogglePaused}
          className={`cursor-pointer transition-colors ${paused ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}`}
          title="Click to pause or resume physics"
        >
          {paused ? '▶ Resume' : '⏸ Pause'}
        </div>
        <div className="text-[#6b7280] hidden md:block">•</div>
        <div className="text-white/70 hidden md:block text-[10px]">Drag to fling • Arrows / Space / H / F / ESC</div>
      </div>

      {tokens.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[#6b7280] text-sm z-10">
          Loading coins from CoinGecko...
        </div>
      )}

      {selectedId && (
        <div className="absolute bottom-3 right-3 md:bottom-4 md:right-4 bg-[#111118] border border-[#25252f] rounded-2xl p-3 md:p-4 text-sm z-30 w-56 md:w-72">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-xs md:text-sm">Selected</div>
              <div className="font-medium">{tokens.find(t => t.id === selectedId)?.symbol}</div>
            </div>
            <button 
              onClick={() => setSelectedId(null)}
              className="text-[10px] md:text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-[#6b7280] hover:text-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

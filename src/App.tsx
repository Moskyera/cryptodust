import React, { useState, useRef } from 'react'
import { Visualization } from './components/Visualization'
import { usePrices, type TokenPrice } from './lib/prices'
import { TrendingUp, Zap } from 'lucide-react'

// =====================================================
// Mini Sparkline (Visual & UX Polish — Desktop Details)
// Generates a beautiful plausible 24h trend line from the 24h% change.
// No extra network calls. Looks organic and premium.
// =====================================================
function MiniSparkline({ coin, width = 260, height = 52 }: { coin: any; width?: number; height?: number }) {
  if (!coin) return null

  const chg = coin.price_change_percentage_24h || 0
  const points = 19
  const vals: number[] = []

  // Seeded "random" using symbol for stable but varied shape per coin
  let seed = 0
  for (let i = 0; i < coin.symbol.length; i++) seed += coin.symbol.charCodeAt(i)

  for (let i = 0; i < points; i++) {
    // Base trend shape: upward or downward bias based on real 24h change
    const progress = i / (points - 1)
    const trend = (chg / 100) * 1.6 * (progress - 0.5) * 2   // stronger curve when big move

    // Nice organic wiggles (seeded)
    const w1 = Math.sin((i + seed * 0.7) * 0.9) * 0.6
    const w2 = Math.sin((i * 1.7 + seed) * 0.6) * 0.45
    const noise = ((seed * (i + 3)) % 17) / 17 - 0.5

    // Combine + clamp
    let v = 0.5 + trend * 0.65 + (w1 + w2) * 0.22 + noise * 0.11
    v = Math.max(0.06, Math.min(0.94, v))
    vals.push(v)
  }

  // Build SVG path
  const stepX = width / (points - 1)
  let d = ''
  vals.forEach((v, i) => {
    const px = i * stepX
    const py = height - v * height
    d += (i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`)
  })

  const isUp = chg >= 0
  const stroke = isUp ? '#4ade80' : '#f87171'
  const fillGradId = `spark-${coin.id || coin.symbol}`

  return (
    <svg width={width} height={height} className="block" style={{ marginTop: 2 }}>
      <defs>
        <linearGradient id={fillGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={isUp ? '#4ade80' : '#f87171'} stopOpacity="0.28" />
          <stop offset="100%" stopColor={isUp ? '#4ade80' : '#f87171'} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Subtle area fill */}
      <path d={`${d} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${fillGradId})`} />

      {/* Main trend stroke */}
      <path d={d} fill="none" stroke={stroke} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />

      {/* Tiny dots at ends for polish */}
      <circle cx="2" cy={height - vals[0] * height} r="1.6" fill={stroke} />
      <circle cx={width - 2} cy={height - vals[vals.length - 1] * height} r="1.6" fill={stroke} />
    </svg>
  )
}

// Known PulseChain token identifiers (used for the "PulseChain" filter)
// Includes the user's curated list + common ecosystem tokens
const PULSECHAIN_IDS = new Set([
  'pulsechain', 'hex-pulsechain', 'pulsex', 'incentive', 'pcock',
  'provex', 'ptgc', 'most', 'zerø', 'prvx', 'phex', 'plsx', 'inc',
  'ehex', 'hex', 'pls', 'phex-pulsechain',
  // User's specific curated list
  'dai-on-pulsechain', 'wrapped-pulse-wpls', 'the-grays-currency',
  'pulsechain-peacock', 'most-wanted-2', 'liquid-loans-usdl', 'upx',
  'zerotrust', 'vouch', 'emit-2', 'pulsechain-tiger', 'hex-dollar-coin',
  'icosa', 'vouch-staked-pls', 'scada', 'pulsechain-bridged-hex-pulsechain',
  'liquid-loans', 'just-a-pulse-guy', 'top-hat-2', 'wrapped-bitcoin-pulsechain',
  'unity-3', 'coin-mafia', 't-i-m-e-dividendimpls-finance', 'teddy-bear', 'doubt'
])

// Explicitly excluded PulseChain coins (removed from filter and data)
const PULSECHAIN_EXCLUDED_IDS = new Set([
  'pulseium',
  'go'
])

// Special featured planet shown ONLY in the PulseChain tab.
// Uses the original logo from whalesonpulse.com and links out to the whales leaderboard.
// Rendered larger than other planets with special radiant visuals (per user request).
const WHALES_ON_PULSE: TokenPrice = {
  id: 'whales-on-pulse',
  symbol: 'WOP',
  name: 'Whales on Pulse',
  image: '/wop.png',
  current_price: 0,
  price_change_percentage_24h: 0,
  market_cap: 0,
  total_volume: 0,
}

export default function App() {
  const { tokens, isLoading, error } = usePrices()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sizeMetric, setSizeMetric] = useState<'market_cap' | 'volume' | 'price' | 'change_24h'>('change_24h')
  const [topLabel, setTopLabel] = useState<'price' | 'change_24h'>('price')
  const [isMobile, setIsMobile] = useState(false)

  // Simple mobile detection for planet sizing and UI
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Refs used by keyboard handler (see below) so we never have stale closures
  // and we avoid "used before declaration" errors.
  const currentPageTokensRef = useRef<TokenPrice[]>([])
  const selectedIdRef = useRef<string | null>(null)

  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightUntil, setHighlightUntil] = useState(0)
  const [physicsPaused, setPhysicsPaused] = useState(false)
  const [isMarketOpen, setIsMarketOpen] = useState(false)
  const [showRampModal, setShowRampModal] = useState(false)
  const [showDonateModal, setShowDonateModal] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cryptodust_favorites') || '[]')
    } catch {
      return []
    }
  })

  const selectedCoin = selectedId 
    ? (tokens.find(t => t.id === selectedId) || (selectedId === 'whales-on-pulse' ? WHALES_ON_PULSE : null))
    : null
  const isWhales = selectedId === 'whales-on-pulse'

  // Simple filter logic + search + pagination (~600 coins total, 100 per page)
  const filteredTokens = React.useMemo(() => {
    let result = [...tokens]

    // Search
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(term) ||
        t.name.toLowerCase().includes(term)
      )
    }

    // Presets
    if (activePreset === 'gainers') {
      result = result.filter(t => (t.price_change_percentage_24h || 0) > 5)
    } else if (activePreset === 'losers') {
      result = result.filter(t => (t.price_change_percentage_24h || 0) < -5)
    } else if (activePreset === 'volume') {
      result = result.sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0))
    } else if (activePreset === 'favorites') {
      result = result.filter(t => favorites.includes(t.id))
    } else if (activePreset === 'pulsechain') {
      // Filter to only PulseChain ecosystem tokens
      // Uses the official CoinGecko "pulsechain-ecosystem" category data
      result = result.filter(t => {
        const id = t.id.toLowerCase()
        const symbol = t.symbol.toLowerCase()
        const name = t.name.toLowerCase()

        // Exclude specific unwanted coins
        if (PULSECHAIN_EXCLUDED_IDS.has(id)) return false

        return (
          PULSECHAIN_IDS.has(id) ||
          PULSECHAIN_IDS.has(symbol) ||
          id.includes('pulse') ||
          symbol.includes('pulse') ||
          name.includes('pulse')
        )
      })
    }

    // Inject the special "Whales on Pulse" planet (using original site logo) exclusively for the PulseChain tab.
    // Always placed first for visual impact. Survives search (featured entry).
    // All other pulse planets also get a size boost (see Visualization + planetScale usage).
    if (activePreset === 'pulsechain') {
      const whalesId = 'whales-on-pulse'
      const others = result.filter(t => t.id !== whalesId)
      result = [WHALES_ON_PULSE, ...others]
    }

    return result.slice(0, 600) // keep max ~600 coins (top 500 + Pulse curated/ecosystem + user specials like hacash)
  }, [tokens, activePreset, searchTerm, favorites])

  // Smart formatter for market cap and volume (handles K / M / B)
  function formatMarketValue(value: number | null | undefined): string {
    if (!value || value <= 0) return '—';

    if (value >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toFixed(2)}B`;
    } else if (value >= 1_000_000) {
      return `$${(value / 1_000_000).toFixed(2)}M`;
    } else if (value >= 1_000) {
      return `$${(value / 1_000).toFixed(2)}K`;
    } else {
      return `$${Math.round(value).toLocaleString()}`;
    }
  }

  // Price formatter that shows enough decimals for very small coins
  function formatPrice(price: number | null | undefined): string {
    if (!price || price <= 0) return '$0';

    if (price >= 1000) {
      return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 });
    } else if (price >= 1) {
      return '$' + price.toFixed(2);
    } else if (price >= 0.01) {
      return '$' + price.toFixed(4);
    } else if (price >= 0.0001) {
      return '$' + price.toFixed(6);
    } else if (price >= 0.000001) {
      return '$' + price.toFixed(8);
    } else {
      // Extremely small prices (common on some PulseChain tokens)
      return '$' + price.toExponential(2);
    }
  }

  const handleSelect = (id: string | null) => {
    if (id === null) {
      setSelectedId(null)
    } else {
      setSelectedId(id === selectedId ? null : id)
    }
  }

  const toggleFavorite = (id: string) => {
    let newFavs: string[]
    if (favorites.includes(id)) {
      newFavs = favorites.filter(f => f !== id)
    } else {
      newFavs = [...favorites, id]
    }
    setFavorites(newFavs)
    localStorage.setItem('cryptodust_favorites', JSON.stringify(newFavs))
  }

  const highlightBigMovers = () => {
    setHighlightUntil(Date.now() + 45000) // 45 seconds like old version
    // Give a little kick to big movers for visual effect
    // (the kick is handled inside Visualization)
  }

  // Pagination: 100 coins per page, up to ~6 pages (up to ~600 coins to include top + Pulse curated/ecosystem + user specials)
  const PAGE_SIZE = 100
  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / PAGE_SIZE))
  const currentPageTokens = filteredTokens.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  )

  // Keep refs up to date so the keyboard handler (below) always sees fresh data
  currentPageTokensRef.current = currentPageTokens
  selectedIdRef.current = selectedId

  // =====================================================
  // DESKTOP KEYBOARD SHORTCUTS (Visual & UX Polish #4)
  // ESC: clear selection | Space: pause/resume | Arrows: cycle planets
  // H: highlight big movers | F: toggle favorites filter
  // Uses refs to avoid "used before declaration" and stale closure problems.
  // =====================================================
  React.useEffect(() => {
    if (isMobile) return // desktop only

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore when user is typing in inputs / search
      const active = document.activeElement as HTMLElement | null
      const tag = active?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || active?.isContentEditable) return

      const key = e.key.toLowerCase()
      const tokens = currentPageTokensRef.current
      const currentSel = selectedIdRef.current

      if (key === 'escape') {
        e.preventDefault()
        setSelectedId(null)
      } else if (key === ' ' || key === 'spacebar') {
        e.preventDefault()
        setPhysicsPaused(p => !p)
      } else if (key === 'h') {
        e.preventDefault()
        highlightBigMovers()
      } else if (key === 'f') {
        e.preventDefault()
        setActivePreset(curr => curr === 'favorites' ? null : 'favorites')
        setCurrentPage(0)
      } else if (key === 'arrowright' || key === 'arrowleft') {
        e.preventDefault()
        if (!tokens.length) return
        const idx = currentSel ? tokens.findIndex(t => t.id === currentSel) : -1
        let nextIdx: number
        if (key === 'arrowright') {
          nextIdx = idx < 0 ? 0 : (idx + 1) % tokens.length
        } else {
          nextIdx = idx < 0 ? tokens.length - 1 : (idx - 1 + tokens.length) % tokens.length
        }
        const next = tokens[nextIdx]
        if (next) setSelectedId(next.id)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isMobile]) // minimal deps — live values come from refs

  return (
    <div className="h-[100dvh] w-screen bg-[#0a0a12] text-white overflow-hidden flex flex-col">   {/* 100dvh is much better on mobile than h-screen */}
      {/* Top Navigation - Premium cyberpunk style (hidden on mobile for maximum planet space + clean view) */}
      <nav className="border-b border-[#25252f] bg-[#0a0a12]/95 backdrop-blur-xl z-50 flex-shrink-0 hidden md:block">
        <div className="w-full px-3 md:px-5 h-11 md:h-14 flex items-center justify-between">
          <div className="flex items-center gap-x-2 md:gap-x-4">
            {/* Logo - using the new custom CryptoDUST logo */}
            <div className="flex items-center gap-x-2 md:gap-x-3 group">
              <img 
                src="/cryptodust-logo.png" 
                alt="CryptoDUST" 
                className="w-6 h-6 md:w-9 md:h-9 object-contain drop-shadow-[0_0_8px_rgba(251,191,36,0.3)] group-hover:scale-105 transition-transform" 
              />
              <div className="leading-none">
                <div className="flex items-baseline gap-x-1">
                  <span className="font-semibold tracking-[-1.2px] text-xl md:text-2xl">Crypto</span>
                  <span className="font-semibold tracking-[-1.2px] text-xl md:text-2xl text-orange-400">DUST</span>
                </div>
                <div className="text-[8px] md:text-[9px] text-[#6b7280] -mt-0.5 tracking-[1px] hidden sm:block">MARKET VISUALIZER</div>
              </div>
            </div>

            <div className="flex items-center gap-x-1.5 px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-white/5 text-[10px] md:text-xs border border-white/10">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-emerald-400 font-medium tracking-widest">LIVE</span>
            </div>
          </div>

          <div className="flex items-center gap-x-2 text-sm">
            {/* Search - beautiful and prominent */}
            <div className="relative group">
              <input
                type="text"
                placeholder="Search ~600 coins..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(0)
                }}
                className="bg-[#0b0b12] border border-[#25252f] rounded-2xl pl-8 pr-3 py-1.5 md:py-2 text-sm w-48 md:w-72 focus:outline-none focus:border-[#67f6ff] focus:bg-[#111118] transition-all placeholder:text-[#6b7280]"
              />
              <div className="absolute left-3.5 top-2.5 text-[#6b7280] group-focus-within:text-[#67f6ff]">⌘</div>
            </div>

            <button 
              onClick={() => window.location.reload()} 
              className="premium-button flex items-center gap-x-1.5 md:gap-x-2 px-3 md:px-4 h-8 md:h-9 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs md:text-sm"
            >
              <TrendingUp className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="font-medium hidden sm:inline">Refresh</span>
            </button>

            {/* Beautiful external links - enhanced premium style */}
            <a 
              href="https://app.provex.com" 
              target="_blank" 
              className="premium-button group flex items-center gap-x-2.5 md:gap-x-3 px-3.5 md:px-5 h-8 md:h-9 rounded-2xl bg-gradient-to-r from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25 border border-orange-500/30 hover:border-orange-500/50 text-orange-300 hover:text-orange-200 transition-all active:scale-[0.985] hover:shadow-md hover:shadow-orange-500/10 text-xs md:text-sm"
            >
              <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 p-1 transition-all duration-200 group-hover:scale-105">
                <img 
                  src="https://app.provex.com/provex.webp" 
                  alt="ProveX" 
                  className="h-full w-full object-contain" 
                />
              </div>
              <span className="font-semibold tracking-tight">ProveX</span>
            </a>

            <a 
              href="https://libertyswap.finance" 
              target="_blank" 
              className="premium-button group flex items-center gap-x-2.5 md:gap-x-3 px-3.5 md:px-5 h-8 md:h-9 rounded-2xl bg-gradient-to-r from-cyan-500/15 to-teal-500/15 hover:from-cyan-500/25 hover:to-teal-500/25 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 hover:text-cyan-200 transition-all active:scale-[0.985] hover:shadow-md hover:shadow-cyan-500/10 text-xs md:text-sm"
            >
              <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 p-1 transition-all duration-200 group-hover:scale-105">
                <img 
                  src="https://libertyswap.finance/logo.svg" 
                  alt="LibertySwap" 
                  className="h-full w-full object-contain" 
                />
              </div>
              <span className="font-semibold tracking-tight">LibertySwap</span>
            </a>

            {/* Telegram Bot */}
            <a 
              href="https://t.me/iNFO_DUST" 
              target="_blank" 
              className="premium-button group flex items-center gap-x-2.5 md:gap-x-3 px-3.5 md:px-5 h-8 md:h-9 rounded-2xl bg-gradient-to-r from-blue-500/15 to-sky-500/15 hover:from-blue-500/25 hover:to-sky-500/25 border border-blue-500/30 hover:border-blue-500/50 text-blue-300 hover:text-blue-200 transition-all active:scale-[0.985] hover:shadow-md hover:shadow-blue-500/10 text-xs md:text-sm"
            >
              <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 p-1 transition-all duration-200 group-hover:scale-105">
                <img 
                  src="https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg" 
                  alt="Telegram" 
                  className="h-full w-full object-contain" 
                />
              </div>
              <span className="font-semibold tracking-tight">iNFO DUST</span>
            </a>

            {/* SimpleX Channel */}
            <a 
              href="https://smp16.simplex.im/c#k7z6aPXx-XHUGQE85X8R3fixZ7HITSmqC_eKlYsX9Y4" 
              target="_blank" 
              className="premium-button group flex items-center gap-x-2.5 md:gap-x-3 px-3.5 md:px-5 h-8 md:h-9 rounded-2xl bg-gradient-to-r from-purple-500/15 to-violet-500/15 hover:from-purple-500/25 hover:to-violet-500/25 border border-purple-500/30 hover:border-purple-500/50 text-purple-300 hover:text-purple-200 transition-all active:scale-[0.985] hover:shadow-md hover:shadow-purple-500/10 text-xs md:text-sm"
            >
              <div className="flex h-7 w-7 md:h-8 md:w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 p-1 transition-all duration-200 group-hover:scale-105">
                <img 
                  src="https://upload.wikimedia.org/wikipedia/en/8/81/SimpleX_Logo.png" 
                  alt="SimpleX" 
                  className="h-full w-full object-contain" 
                />
              </div>
              <span className="font-semibold tracking-tight">SimpleX</span>
            </a>

            {/* Donate Button - Support the project */}
            <button
              onClick={() => setShowDonateModal(true)}
              className="premium-button group flex items-center gap-x-2 px-4 md:px-5 h-8 md:h-9 rounded-2xl bg-gradient-to-r from-amber-500/15 to-yellow-500/15 hover:from-amber-500/25 hover:to-yellow-500/25 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 hover:text-amber-200 transition-all active:scale-[0.985] text-xs md:text-sm"
              title="Support the project with ETH"
            >
              <span className="font-semibold tracking-tight">Donate ETH</span>
            </button>

            {/* Beautiful Export group */}
            <div className="flex items-center bg-white/5 rounded-2xl border border-white/10 ml-1">
              <button 
                onClick={() => {
                  const canvas = document.querySelector('canvas') as HTMLCanvasElement
                  if (canvas) {
                    const link = document.createElement('a')
                    link.download = `cryptodust-${new Date().toISOString().slice(0,10)}.png`
                    link.href = canvas.toDataURL('image/png')
                    link.click()
                  }
                }}
                className="premium-button px-4 py-1.5 text-xs flex items-center gap-1.5 hover:bg-white/10 rounded-l-2xl border-r border-white/10"
                title="Download high-quality PNG"
              >
                <span>Export PNG</span>
              </button>
              <button 
                onClick={async () => {
                  const canvas = document.querySelector('canvas') as HTMLCanvasElement
                  if (canvas) {
                    canvas.toBlob(async (blob) => {
                      if (blob) {
                        try {
                          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                        } catch {
                          alert('Copy to clipboard failed. Try Export PNG instead.')
                        }
                      }
                    })
                  }
                }}
                className="premium-button px-3 py-1.5 text-xs hover:bg-white/10 rounded-r-2xl"
                title="Copy to clipboard"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Global Market Stats - Premium cards (hidden on mobile to give maximum space to the planets) */}
      <div className="border-b border-[#25252f] bg-[#0a0a12] flex-shrink-0 hidden md:block">
        <div className="w-full px-5 py-3.5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { label: "TOTAL MARKET CAP", value: `$${(filteredTokens.reduce((sum, t) => sum + (t.market_cap || 0), 0) / 1e12).toFixed(2)}T` },
              { label: "24H VOLUME", value: `$${(filteredTokens.reduce((sum, t) => sum + (t.total_volume || 0), 0) / 1e9).toFixed(1)}B` },
              { label: "BTC DOMINANCE", value: "~52%" },
              { label: "COINS VISIBLE", value: `${filteredTokens.length} / 600` },
            ].map((stat) => (
              <div key={stat.label} className="stat-card rounded-2xl px-4 py-3">
                <div className="text-[#6b7280] text-[10px] tracking-[0.5px] mb-1">{stat.label}</div>
                <div className="font-semibold tabular-nums text-xl tracking-tighter">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls - Hidden on mobile for super clean experience. Only planets + Highlight button visible on phones. */}
      <div className="border-b border-[#25252f] bg-[#111118] flex-shrink-0 hidden md:block">
        <div className="w-full px-5 py-3.5">
          {/* Timeframe & Metrics */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
            <div className="control-group flex items-center rounded-3xl p-1">
              <div className="px-3 text-xs font-medium text-[#6b7280] tracking-widest">SIZE BY</div>
              {(['change_24h', 'market_cap', 'volume', 'price'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSizeMetric(m)}
                  className={`px-4 py-1.5 rounded-2xl text-sm font-medium ${sizeMetric === m ? 'bg-white text-black' : 'hover:bg-white/5 text-white/90'}`}
                >
                  {m === 'change_24h' ? '24h %' : m === 'market_cap' ? 'Market Cap' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            {/* TOP LABEL tab - controls what is shown at top of planets */}
            <div className="control-group flex items-center rounded-3xl p-1 ml-2">
              <div className="px-3 text-xs font-medium text-[#6b7280] tracking-widest">TOP</div>
              {(['price', 'change_24h'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setTopLabel(m)}
                  className={`px-4 py-1.5 rounded-2xl text-sm font-medium ${topLabel === m ? 'bg-white text-black' : 'hover:bg-white/5 text-white/90'}`}
                >
                  {m === 'price' ? 'Price' : '% CHANGE'}
                </button>
              ))}
            </div>

            <button
              onClick={highlightBigMovers}
              className={`px-5 py-2 text-sm font-medium rounded-3xl flex items-center gap-x-2 transition-all border active:scale-[0.985] ${
                highlightUntil > Date.now() 
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white border-orange-400 shadow-[0_0_20px_rgb(249,115,22,0.4)]' 
                  : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/20'
              }`}
            >
              <Zap className="w-4 h-4" /> 
              {highlightUntil > Date.now() ? 'HIGHLIGHTING MOVERS' : 'HIGHLIGHT BIG MOVERS'}
            </button>

            {/* Prominent Physics pause/resume button (big and obvious like user requested) */}
            <button
              onClick={() => setPhysicsPaused(!physicsPaused)}
              className={`px-5 py-2 text-sm font-medium rounded-3xl flex items-center gap-x-2 transition-all border active:scale-[0.985] ${
                physicsPaused
                  ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/15'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/15'
              }`}
            >
              {physicsPaused ? '▶ Resume Physics' : '⏸ Pause Physics'}
            </button>
          </div>

          {/* Quick Filters - More interesting styling */}
          <div className="flex items-center gap-x-2 flex-wrap">
            <div className="text-[10px] font-medium text-[#6b7280] tracking-[1px] mr-2 flex items-center gap-1.5">
              QUICK FILTERS
              {activePreset === 'pulsechain' && (
                <>
                  <span className="text-[9px] px-1.5 py-px rounded bg-violet-500/20 text-violet-400 border border-violet-500/30">API TEST</span>
                  <span className="text-[9px] text-violet-400/70 ml-1">(Market data limited on some tokens)</span>
                </>
              )}
            </div>
            {[
              { label: 'Big Gainers', key: 'gainers' },
              { label: 'Big Losers', key: 'losers' },
              { label: 'High Volume', key: 'volume' },
              { label: 'Favorites', key: 'favorites' },
              { label: 'PulseChain', key: 'pulsechain' },
              { label: 'Clear', key: null },
            ].map(f => {
              const isPulse = f.key === 'pulsechain'
              const isActive = activePreset === f.key

              return (
                <button
                  key={f.key || 'clear'}
                  onClick={() => {
                    setActivePreset(f.key)
                    setCurrentPage(0)
                  }}
                  className={`filter-chip px-4 py-1.5 text-xs rounded-3xl border font-medium transition-all ${
                    isActive 
                      ? isPulse 
                        ? 'bg-violet-500 text-white border-violet-400 shadow-sm' 
                        : 'bg-white text-black border-white shadow-sm'
                      : isPulse
                        ? 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/30 text-violet-300 hover:text-violet-200'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              )
            })}
          </div>

          {/* Page Tabs - Show again every 100 coins for the first ~600 coins */}
          <div className="flex items-center gap-x-1.5 flex-wrap mt-2">
            <div className="text-[10px] font-medium text-[#6b7280] tracking-[1px] mr-2">PAGES (~600 coins)</div>
            {Array.from({ length: totalPages }).map((_, index) => {
              const start = index * 100
              const end = Math.min(start + 100, filteredTokens.length)
              return (
                <button
                  key={start}
                  onClick={() => setCurrentPage(index)}
                  className={`px-3.5 py-1 text-[11px] rounded-2xl border font-medium transition-all ${
                    currentPage === index
                      ? 'bg-[#67f6ff] text-[#0b0b12] border-[#67f6ff] shadow-sm'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white'
                  }`}
                >
                  {start}–{end}
                </button>
              )
            })}
          </div>

        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 relative overflow-hidden bg-black">
        {/* Desktop: Visualization with bubbles */}
        {!isMobile && (
          <Visualization 
            tokens={currentPageTokens} 
            selectedId={selectedId} 
            onSelect={handleSelect}
            favorites={favorites}
            highlightUntil={highlightUntil}
            sizeMetric={sizeMetric}
            topLabel={topLabel}
            paused={physicsPaused}
            onTogglePaused={() => setPhysicsPaused(!physicsPaused)}
            planetScale={isMobile ? 0.45 : 1}
            isMobile={isMobile}
            isPulsechain={activePreset === 'pulsechain'}
          />
        )}

        {/* Mobile: Simple list view instead of planets (due to touch issues) */}
        {isMobile && (
          <div className="h-full overflow-auto px-3 pt-2 pb-20 text-sm custom-scrollbar">
            {/* Quick Filters + External Services on mobile */}
            <div className="flex gap-2.5 overflow-x-auto pb-4 hide-scrollbar">
              {[
                { label: 'All', key: null },
                { label: 'Big Movers', key: 'gainers' },
                { label: 'PulseChain', key: 'pulsechain' },
                { label: 'Favorites', key: 'favorites' },
                { label: 'ProveX', url: 'https://app.provex.com' },
                { label: 'LibertySwap', url: 'https://libertyswap.finance' },
                { label: 'iNFO DUST', url: 'https://t.me/iNFO_DUST' },
                { label: 'SimpleX', url: 'https://smp16.simplex.im/c#k7z6aPXx-XHUGQE85X8R3fixZ7HITSmqC_eKlYsX9Y4' },
              ].map((item, idx) => {
                // External link (ProveX / LibertySwap)
                if (item.url) {
                  return (
                    <a
                      key={idx}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs px-3 py-1.5 rounded-2xl border whitespace-nowrap bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/30 text-orange-300 active:from-orange-500/20 active:to-amber-500/20"
                    >
                      {item.label}
                    </a>
                  );
                }

                // Internal filter
                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (item.key === null) {
                        setActivePreset(null);
                      } else if (item.label === 'Big Movers') {
                        highlightBigMovers();
                      } else if (item.key !== undefined) {
                        setActivePreset(item.key);
                      }
                      setCurrentPage(0);
                    }}
                    className={`text-xs px-3 py-1.5 rounded-2xl border whitespace-nowrap transition-all ${
                      (item.key === null && !activePreset) || activePreset === item.key
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 border-white/10 text-white/80'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {/* Pages - better spacing and touch targets on mobile */}
            <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar mt-3">
              {Array.from({ length: totalPages }).map((_, index) => {
                const start = index * 100;
                const end = Math.min(start + 100, filteredTokens.length);
                return (
                  <button
                    key={index}
                    onClick={() => setCurrentPage(index)}
                    className={`text-[11px] px-3.5 py-1.5 rounded-2xl border whitespace-nowrap min-w-[72px] ${
                      currentPage === index
                        ? 'bg-[#67f6ff] text-black border-[#67f6ff] font-medium'
                        : 'bg-white/5 border-white/10 text-white/70 active:bg-white/10'
                    }`}
                  >
                    {start}–{end}
                  </button>
                );
              })}
            </div>

            {/* Mobile List */}
            <div className="space-y-1">
              {currentPageTokens.map(coin => {
                const change = coin.price_change_percentage_24h || 0;
                const isBigMover = Math.abs(change) > 6;
                const isHighlightActive = highlightUntil > Date.now();
                const rowIsWhales = coin.id === 'whales-on-pulse';

                let highlightClass = '';

                if (!rowIsWhales && isHighlightActive && isBigMover) {
                  if (change > 0) {
                    // Positive big mover → green blink
                    highlightClass = 'bg-emerald-500/15 border-emerald-500/40 animate-pulse';
                  } else {
                    // Negative big mover → red blink
                    highlightClass = 'bg-red-500/15 border-red-500/40 animate-pulse';
                  }
                }

                if (rowIsWhales) {
                  // Special prominent row for "Whales on Pulse" (PulseChain tab only)
                  return (
                    <div
                      key={coin.id}
                      onClick={() => handleSelect(coin.id)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-2xl border border-cyan-400/70 bg-gradient-to-r from-cyan-500/15 to-blue-500/10 text-cyan-200 active:brightness-110 transition-all ${
                        selectedId === coin.id ? 'ring-1 ring-cyan-300' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">🌊</span>
                        <div>
                          <div className="font-semibold tracking-tight">Whales on Pulse</div>
                          <div className="text-[10px] text-cyan-400/80">Tap to open whale leaderboard</div>
                        </div>
                      </div>
                      <div className="text-right text-xs font-medium text-cyan-300">View →</div>
                    </div>
                  );
                }

                return (
                  <div 
                    key={coin.id}
                    onClick={() => handleSelect(coin.id)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-2xl border transition-all active:bg-white/5 ${
                      highlightClass 
                        ? highlightClass 
                        : selectedId === coin.id 
                          ? 'bg-white/5 border-[#67f6ff]' 
                          : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div>
                      <div className="font-semibold">{coin.symbol}</div>
                      <div className="text-xs text-[#9ca3af]">{formatPrice(coin.current_price)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-medium ${(coin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(coin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(coin.price_change_percentage_24h || 0).toFixed(1)}%
                      </div>
                      <div className="text-xs text-[#9ca3af]">
                        {formatMarketValue(coin.market_cap)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Old mobile floating buttons and duplicate chips removed - using integrated list view instead */}

        {/* Mobile Bottom Sheet - Richer info panel (only shown in mobile list view) */}
        {isMobile && selectedCoin && (
          <div 
            className="fixed bottom-0 left-0 right-0 z-[70] bg-[#0f0f16] border-t border-[#25252f] rounded-t-3xl px-4 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.5)]"
            style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {selectedCoin.image && (
                  <img src={selectedCoin.image} alt="" className="w-10 h-10 rounded-full ring-1 ring-white/10" />
                )}
                <div>
                  <div className="font-semibold text-lg">{selectedCoin.symbol}</div>
                  <div className="text-sm text-[#9ca3af]">{selectedCoin.name}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!isWhales && (
                  <button 
                    onClick={() => toggleFavorite(selectedCoin.id)} 
                    className="px-3 py-1 text-sm rounded-xl bg-white/5 active:bg-white/10"
                  >
                    {favorites.includes(selectedCoin.id) ? '★ Favorited' : '☆ Favorite'}
                  </button>
                )}
                <button 
                  onClick={() => setSelectedId(null)} 
                  className="px-3 py-1 text-sm rounded-xl bg-white/5 active:bg-white/10"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Price + 24h% (hidden for the special Whales on Pulse planet) */}
            {!isWhales && (
              <div className="flex items-baseline justify-between mb-3">
                <div className="text-2xl font-semibold tabular-nums">
                  {formatPrice(selectedCoin.current_price)}
                </div>
                <div className={`text-base font-medium ${ (selectedCoin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' }`}>
                  {(selectedCoin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(selectedCoin.price_change_percentage_24h || 0).toFixed(2)}%
                </div>
              </div>
            )}

            {/* Stats Grid (hidden for Whales on Pulse) */}
            {!isWhales && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span className="text-[#6b7280]">Market Cap</span>
                  <span className="font-medium">{formatMarketValue(selectedCoin.market_cap)}</span>
                </div>
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span className="text-[#6b7280]">24h Volume</span>
                  <span className="font-medium">{formatMarketValue(selectedCoin.total_volume)}</span>
                </div>
                {selectedCoin.price_change_percentage_1h !== undefined && (
                  <div className="flex justify-between border-b border-white/10 pb-1 col-span-2">
                    <span className="text-[#6b7280]">1h Change</span>
                    <span className={`font-medium ${ (selectedCoin.price_change_percentage_1h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400' }`}>
                      {(selectedCoin.price_change_percentage_1h || 0) > 0 ? '+' : ''}{(selectedCoin.price_change_percentage_1h || 0).toFixed(2)}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {isWhales && (
              <div className="text-sm text-[#9ca3af] mb-4">Featured PulseChain whale + dry powder tracker.</div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              {/* Whales link ONLY for the "Whales on Pulse" planet details (never for regular planets, even on PulseChain tab).
                  The entry itself is only injected when the PulseChain tab is active. */}
              {(isWhales && selectedCoin && selectedCoin.id === 'whales-on-pulse') ? (
                <a
                  href="https://whalesonpulse.com/?sort=change&dir=desc&chain=all"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 text-black font-semibold text-center active:scale-[0.985] transition-all text-sm"
                >
                  🌊 Open Whales on Pulse Leaderboard →
                </a>
              ) : (
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowRampModal(true)}
                    className="flex-1 py-2.5 rounded-2xl bg-emerald-500 text-black font-semibold active:bg-emerald-400 text-sm"
                  >
                    Buy with RampNow
                  </button>
                  <button 
                    onClick={() => {
                      const url = 'https://exchange.mercuryo.io/';
                      window.open(url, '_blank');
                    }}
                    className="flex-1 py-2.5 rounded-2xl bg-blue-500 text-white font-semibold active:bg-blue-400 text-sm"
                  >
                    Buy with Mercuryo
                  </button>
                </div>
              )}
              <button 
                onClick={() => setSelectedId(null)}
                className="w-full py-2.5 rounded-2xl bg-white/5 border border-white/10 active:bg-white/10 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Details Panel - Opens automatically when you select a planet.
            Hidden on mobile to not block the visualization. */}
        {selectedCoin && (
          <div className="absolute top-4 right-4 z-50 w-80 rounded-3xl border border-[#25252f] bg-[#111118]/95 backdrop-blur-2xl shadow-2xl overflow-hidden transition-all duration-200 hidden md:block">
            <div className="px-5 pt-4 pb-3 border-b border-[#25252f] flex items-center justify-between bg-black/30">
              <div className="font-semibold tracking-tight text-sm">DETAILS</div>
              <button 
                onClick={() => setSelectedId(null)} 
                className="text-xs px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[#6b7280] hover:text-white transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-5">
              <div className="flex items-center gap-3 mb-4">
                {selectedCoin.image && (
                  <img src={selectedCoin.image} alt="" className="w-12 h-12 rounded-full ring-1 ring-white/10 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-2xl tracking-tight">{selectedCoin.symbol}</div>
                  <div className="text-sm text-[#9ca3af] truncate">{selectedCoin.name}</div>
                </div>
                {!isWhales && (
                  <button 
                    onClick={() => toggleFavorite(selectedCoin.id)}
                    className="text-3xl leading-none transition-transform active:scale-90 ml-2"
                    title={favorites.includes(selectedCoin.id) ? "Remove from favorites" : "Add to favorites"}
                  >
                    {favorites.includes(selectedCoin.id) ? <span className="text-amber-400">★</span> : <span className="text-white/40">☆</span>}
                  </button>
                )}
              </div>

              <div className="space-y-3 text-sm">
                {!isWhales && (
                  <>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[#6b7280]">Price</span>
                      <span className="font-semibold tabular-nums text-2xl tracking-tighter">
                        {formatPrice(selectedCoin.current_price)}
                      </span>
                    </div>

                    <div className="flex justify-between items-baseline">
                      <span className="text-[#6b7280]">24h Change</span>
                      <span className={`font-semibold ${(selectedCoin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {(selectedCoin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(selectedCoin.price_change_percentage_24h || 0).toFixed(2)}%
                      </span>
                    </div>

                    {/* Mini Sparkline — desktop visual polish (idea 4) */}
                    <div className="pt-1 pb-2 border-t border-white/10">
                      <div className="flex items-center justify-between text-[10px] text-[#6b7280] mb-0.5">
                        <span>24h TREND</span>
                        <span className="tabular-nums">{selectedCoin.price_change_percentage_24h > 0 ? '↑' : '↓'} simulated</span>
                      </div>
                      <MiniSparkline coin={selectedCoin} />
                    </div>

                    {/* Market Cap */}
                    <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
                      <span className="text-[#6b7280]">Market Cap</span>
                      <span className="font-medium">
                        {formatMarketValue(selectedCoin.market_cap)}
                      </span>
                    </div>

                    {/* 24h Volume */}
                    <div className="flex justify-between items-baseline">
                      <span className="text-[#6b7280]">24h Volume</span>
                      <span className="font-medium">
                        {formatMarketValue(selectedCoin.total_volume)}
                      </span>
                    </div>
                  </>
                )}

                {isWhales && (
                  <div className="text-sm text-[#9ca3af] py-1 border-t border-white/10">
                    Featured PulseChain ecosystem link. Track the biggest dry powder holders and whale movements.
                  </div>
                )}

                {activePreset === 'pulsechain' && !isWhales && (
                  <div className="text-[10px] text-violet-400/60 pt-1">
                    Note: Many PulseChain tokens have limited market data on CoinGecko
                  </div>
                )}
              </div>

              {/* Buy Buttons - Desktop only (hidden for the special Whales on Pulse planet) */}
              <div className="mt-4 pt-4 border-t border-white/10 space-y-3">
                {/* Whales on Pulse link button ONLY appears in the "Whales on Pulse" planet's details.
                    Regular planets (even in PulseChain tab) always get the normal Ramp/Mercuryo buttons.
                    The entry only exists when activePreset === 'pulsechain'. */}
                {(isWhales && selectedCoin && selectedCoin.id === 'whales-on-pulse') ? (
                  <a
                    href="https://whalesonpulse.com/?sort=change&dir=desc&chain=all"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-400 via-sky-400 to-cyan-300 hover:from-sky-300 hover:to-cyan-200 text-black font-semibold text-sm text-center active:scale-[0.985] transition-all shadow-[0_0_18px_rgba(103,232,249,0.35)]"
                  >
                    🌊 View Whales Leaderboard on WhalesOnPulse →
                  </a>
                ) : (
                  <>
                    <button
                      onClick={() => setShowRampModal(true)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-semibold text-sm transition-all active:scale-[0.985]"
                    >
                      <span>Buy with RampNow</span>
                      <span className="text-xs opacity-75">→</span>
                    </button>

                    <button
                      onClick={() => {
                        const url = 'https://exchange.mercuryo.io/';
                        window.open(url, '_blank');
                      }}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white font-semibold text-sm transition-all active:scale-[0.985]"
                    >
                      <span>Buy with Mercuryo</span>
                      <span className="text-xs opacity-75">→</span>
                    </button>

                    <p className="text-[10px] text-center text-[#6b7280]">
                      Card • Bank • Apple Pay • Low fees
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-black/40 border-t border-[#25252f] text-[10px] text-[#6b7280]">
              Click the star to favorite • Drag the planet to fling it
              <span className="mx-2 text-amber-500/60">•</span>
              <button 
                onClick={() => setShowDonateModal(true)} 
                className="text-amber-400 hover:text-amber-300 underline-offset-2 hover:underline transition-colors"
              >
                Support the project
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile info panel moved inside visualization as absolute overlay — prevents canvas resize when opening, which was causing planets to "disappear" to the right/bottom */}

      {/* Bottom Market Tab — very thin & minimal on mobile to maximize planet space */}
      <div className="border-t border-[#25252f] bg-[#111118]/95 backdrop-blur-xl flex-shrink-0 z-40">
        <button
          onClick={() => setIsMarketOpen(!isMarketOpen)}
          className={`w-full flex items-center justify-between px-3 md:px-5 py-1.5 md:py-3 text-[10px] md:text-sm font-medium transition-all active:bg-white/10 ${isMarketOpen ? 'bg-white/5' : 'hover:bg-white/5'}`}
        >
          <div className="flex items-center gap-x-1.5 md:gap-x-3">
            <span className="text-[#67f6ff] text-sm md:text-base">📋</span>
            <span className="font-semibold tracking-[-0.3px] text-[10px] md:text-sm">Market</span>
            <span className="text-[#6b7280] text-[9px] md:text-[10px] px-1.5 md:px-2 py-px rounded-full bg-white/5 border border-white/10 tabular-nums">
              {filteredTokens.length}
            </span>
          </div>

          <div className="flex items-center gap-x-1 text-[#6b7280] text-[10px]">
            <span className="hidden sm:inline">Page {currentPage + 1}</span>
            <span className={`transition-transform duration-200 ${isMarketOpen ? 'rotate-180' : ''}`}>▼</span>
          </div>
        </button>
      </div>

      {/* Slide-up Market Drawer (replaces both old fixed table + right details panel) */}
      {isMarketOpen && (
        <div 
          className="market-drawer fixed bottom-0 left-0 right-0 z-[60] bg-[#0a0a12] border-t border-[#25252f] flex flex-col"
          style={{ height: 'min(68vh, 620px)' }}
        >
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#25252f] bg-[#111118]/80 backdrop-blur-xl flex-shrink-0">
            <div>
              <div className="font-semibold tracking-tight">Market Table</div>
              <div className="text-[10px] text-[#6b7280]">
                {filteredTokens.length} coins • Page {currentPage + 1} of {totalPages}
              </div>
            </div>

            <div className="flex items-center gap-x-2">
              {selectedCoin && (
                <div className="hidden sm:flex items-center gap-x-2 text-sm mr-3 px-3 py-1 rounded-2xl bg-white/5 border border-white/10">
                  <span className="text-[#67f6ff] font-medium">{selectedCoin.symbol}</span>
                  <span className={(selectedCoin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                    {(selectedCoin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(selectedCoin.price_change_percentage_24h || 0).toFixed(1)}%
                  </span>
                  <button 
                    onClick={() => toggleFavorite(selectedCoin.id)}
                    className="ml-1 text-lg leading-none active:scale-90"
                  >
                    {favorites.includes(selectedCoin.id) ? '★' : '☆'}
                  </button>
                </div>
              )}

              <button
                onClick={() => setIsMarketOpen(false)}
                className="px-4 py-1.5 text-xs font-medium rounded-2xl border border-white/10 hover:bg-white/10 text-white/80 hover:text-white transition-colors"
              >
                Close
              </button>
            </div>
          </div>

          {/* Quick filters inside mobile drawer for easy access */}
          <div className="md:hidden px-4 pt-3 pb-1 flex gap-1.5 flex-wrap">
            {[
              { label: 'Big Movers', key: null }, // reuse highlight
              { label: 'Gainers', key: 'gainers' },
              { label: 'PulseChain', key: 'pulsechain' },
              { label: 'Favorites', key: 'favorites' },
            ].map((f, idx) => (
              <button
                key={idx}
                onClick={() => {
                  if (f.key === null) {
                    highlightBigMovers()
                  } else {
                    setActivePreset(f.key)
                    setCurrentPage(0)
                  }
                  setIsMarketOpen(false) // close after selection on mobile
                }}
                className="text-[10px] px-2.5 py-1 rounded-2xl border bg-white/5 border-white/10 text-white/80 active:bg-white/10"
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Market Table Content (inside drawer) */}
          <div className="flex-1 overflow-auto px-5 pt-3 pb-6 text-sm custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
            {/* Page tabs inside drawer */}
            <div className="flex items-center gap-x-1.5 flex-wrap mb-3">
              {Array.from({ length: totalPages }).map((_, index) => {
                const start = index * 100
                const end = Math.min(start + 100, filteredTokens.length)
                return (
                  <button
                    key={start}
                    onClick={() => setCurrentPage(index)}
                    className={`px-3.5 py-1 text-[11px] rounded-2xl border font-medium transition-all ${
                      currentPage === index
                        ? 'bg-[#67f6ff] text-[#0b0b12] border-[#67f6ff] shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/70 hover:text-white'
                    }`}
                  >
                    {start}–{end}
                  </button>
                )
              })}
            </div>

            <table className="w-full text-xs">
              <thead>
                <tr className="text-[#6b7280] border-b border-[#25252f] sticky top-0 bg-[#0a0a12]">
                  <th className="text-left pb-2 font-normal">Coin</th>
                  <th className="text-right pb-2 font-normal">Price</th>
                  <th className="text-right pb-2 font-normal">24h %</th>
                  <th className="text-right pb-2 font-normal hidden md:table-cell">Volume</th>
                  <th className="text-center pb-2 font-normal w-10">★</th>
                </tr>
              </thead>
              <tbody>
                {currentPageTokens.map(coin => (
                  <tr 
                    key={coin.id} 
                    onClick={() => handleSelect(coin.id)}
                    className={`market-row cursor-pointer border-b border-white/5 last:border-none ${selectedId === coin.id ? 'selected bg-white/5' : ''}`}
                  >
                    <td className="py-2.5 font-medium text-white/90">{coin.symbol}</td>
                    <td className="py-2.5 text-right font-medium tabular-nums text-white/90">
                      {formatPrice(coin.current_price)}
                    </td>
                    <td className={`py-2.5 text-right font-medium ${(coin.price_change_percentage_24h||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(coin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(coin.price_change_percentage_24h || 0).toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right hidden md:table-cell text-[#9ca3af] tabular-nums">
                      {formatMarketValue(coin.total_volume)}
                    </td>
                    <td className="py-2.5 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleFavorite(coin.id)
                        }}
                        className="text-xl leading-none active:scale-90"
                      >
                        {favorites.includes(coin.id) ? <span className="text-amber-400">★</span> : <span className="text-white/40">☆</span>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {currentPageTokens.length === 0 && (
              <div className="text-center py-8 text-[#6b7280]">No coins match the current filters.</div>
            )}
          </div>

          {/* Drawer footer hint */}
          <div className="px-5 py-2 text-[10px] text-[#6b7280] border-t border-[#25252f] bg-[#111118]/60 text-center flex-shrink-0">
            Click any row to select the planet • Drag planets in the visualization to fling them
          </div>
        </div>
      )}

      {/* Error / Loading */}
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-1.5 rounded-2xl">
          Price data issue — using cached values
        </div>
      )}
      {isLoading && tokens.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a12]/80 text-sm">
          Loading ~600 coins from CoinGecko...
        </div>
      )}

      {/* RampNow Buy Modal - Correctly placed inside root container */}
      {showRampModal && selectedCoin && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" 
          onClick={() => setShowRampModal(false)}
        >
          <div 
            className="w-full max-w-md rounded-3xl border border-[#25252f] bg-[#111118] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-[#6b7280]">Buy instantly via</div>
                  <div className="text-2xl font-semibold tracking-tight">RampNow</div>
                </div>
                <button 
                  onClick={() => setShowRampModal(false)}
                  className="text-2xl text-[#6b7280] hover:text-white leading-none"
                >
                  ×
                </button>
              </div>

              <div className="flex items-center gap-3 mb-5">
                {selectedCoin.image && (
                  <img src={selectedCoin.image} alt="" className="w-11 h-11 rounded-full ring-1 ring-white/10" />
                )}
                <div>
                  <div className="font-semibold text-lg">{selectedCoin.symbol}</div>
                  <div className="text-sm text-[#9ca3af]">{selectedCoin.name}</div>
                </div>
              </div>

              <div className="bg-[#0a0a12] rounded-2xl p-4 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-[#6b7280]">Current Price</span>
                  <span className="font-semibold tabular-nums">
                    {formatPrice(selectedCoin.current_price)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => {
                  const url = `https://app.rampnow.io/order/quote?dstCurrency=${selectedCoin.symbol}`;
                  window.open(url, '_blank');
                  setShowRampModal(false);
                }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-semibold text-base active:scale-[0.985] transition-all"
              >
                Continue to RampNow →
              </button>

              <p className="text-center text-[11px] text-[#6b7280] mt-3">
                Card • Bank Transfer • Apple Pay • Google Pay
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Donate Modal - Ethereum support for the project */}
      {showDonateModal && (
        <div 
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" 
          onClick={() => setShowDonateModal(false)}
        >
          <div 
            className="w-full max-w-md rounded-3xl border border-[#25252f] bg-[#111118] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-[#6b7280]">Support the project</div>
                  <div className="text-2xl font-semibold tracking-tight">Donate ETH</div>
                </div>
                <button 
                  onClick={() => setShowDonateModal(false)}
                  className="text-2xl text-[#6b7280] hover:text-white leading-none"
                >
                  ×
                </button>
              </div>

              <p className="text-sm text-[#9ca3af] mb-5">
                Your support helps me maintain and improve CryptoDUST. Thank you!
              </p>

              <div className="bg-[#0a0a12] rounded-2xl p-4 mb-4 border border-white/10">
                <div className="text-xs text-[#6b7280] mb-1.5">Ethereum Address</div>
                <div className="font-mono text-sm break-all text-white tracking-tight">
                  0x38be95f628ed004a000ddf8724142a95e3c4b492
                </div>
              </div>

              <button
                onClick={async (e) => {
                  try {
                    await navigator.clipboard.writeText("0x38be95f628ed004a000ddf8724142a95e3c4b492")
                    
                    const btn = e.currentTarget as HTMLButtonElement
                    const originalText = btn.innerText
                    btn.innerText = "✓ Copied!"
                    setTimeout(() => {
                      if (btn && btn.innerText === "✓ Copied!") {
                        btn.innerText = originalText
                      }
                    }, 2000)
                  } catch {
                    // Fallback: show the address
                    alert("0x38be95f628ed004a000ddf8724142a95e3c4b492")
                  }
                }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold text-base active:scale-[0.985] transition-all"
              >
                Copy Ethereum Address
              </button>

              <p className="text-center text-[11px] text-[#6b7280] mt-3">
                Any amount is appreciated ❤️
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

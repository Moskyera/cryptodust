import React, { useState, useRef } from 'react'
import { Visualization } from './components/Visualization'
import { usePrices, type TokenPrice } from './lib/prices'
import {
  Zap, Pause, Play, Gauge, Search, RefreshCw, Download, Copy, Heart,
  X, Coins, BarChart3, Bitcoin, Layers, ArrowUpRight, Check,
} from 'lucide-react'

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
  'pulsechain', 'hex-pulsechain', 'pulsex', 'pulsex-incentive-token', 'pcock',
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

// Partner / community links. One source of truth so desktop nav and mobile chips
// can never drift apart again.
const EXTERNAL_LINKS = [
  {
    label: 'ProveX',
    href: 'https://app.provex.com',
    img: 'https://app.provex.com/provex.webp',
    ring: 'hover:border-orange-500/60 hover:text-orange-200 hover:bg-orange-500/10',
    text: 'text-orange-300',
  },
  {
    label: 'LibertySwap',
    href: 'https://libertyswap.finance',
    img: 'https://libertyswap.finance/logo.svg',
    ring: 'hover:border-cyan-500/60 hover:text-cyan-200 hover:bg-cyan-500/10',
    text: 'text-cyan-300',
  },
  {
    label: 'iNFO DUST',
    href: 'https://t.me/iNFO_DUST',
    img: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
    ring: 'hover:border-blue-500/60 hover:text-blue-200 hover:bg-blue-500/10',
    text: 'text-blue-300',
  },
  {
    label: 'SimpleX',
    href: 'https://smp16.simplex.im/c#k7z6aPXx-XHUGQE85X8R3fixZ7HITSmqC_eKlYsX9Y4',
    img: 'https://upload.wikimedia.org/wikipedia/en/8/81/SimpleX_Logo.png',
    ring: 'hover:border-purple-500/60 hover:text-purple-200 hover:bg-purple-500/10',
    text: 'text-purple-300',
  },
] as const

const DONATION_ADDRESS = '0x38be95f628ed004a000ddf8724142a95e3c4b492'

export default function App() {
  const { tokens, isLoading, error } = usePrices()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sizeMetric, setSizeMetric] = useState<'market_cap' | 'volume' | 'price' | 'change_24h' | 'liquidity'>('change_24h')
  const [topLabel, setTopLabel] = useState<'price' | 'change_24h'>('price')
  const [isMobile, setIsMobile] = useState(false)

  // PWA Install prompt - only for mobile, minimal non-intrusive addition
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  // Simple mobile detection for planet sizing and UI
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // PWA install prompt listener - careful, only used for mobile install button
  React.useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
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
  const [performanceMode, setPerformanceMode] = useState(() => {
    try {
      return localStorage.getItem('cryptodust_performance_mode') === '1'
    } catch {
      return false
    }
  })
  const [isMarketOpen, setIsMarketOpen] = useState(false)
  const [pagesPanelExpanded, setPagesPanelExpanded] = useState(true)
  const [showRampModal, setShowRampModal] = useState(false)
  const [showDonateModal, setShowDonateModal] = useState(false)

  // Small transient "done" confirmations instead of the old alert()/innerText hacks
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedCanvas, setCopiedCanvas] = useState(false)

  const searchRef = useRef<HTMLInputElement | null>(null)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cryptodust_favorites') || '[]')
    } catch {
      return []
    }
  })

  // Holdings for favorites (desktop only feature) - amount user holds per coin
  const [holdings, setHoldings] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem('cryptodust_holdings') || '{}')
    } catch {
      return {}
    }
  })

  const updateHolding = (id: string, amount: number) => {
    const newHoldings = { ...holdings }
    if (amount > 0) {
      newHoldings[id] = amount
    } else {
      delete newHoldings[id]
    }
    setHoldings(newHoldings)
    localStorage.setItem('cryptodust_holdings', JSON.stringify(newHoldings))
  }

  // Very careful PWA install handler - only triggers if browser offers it
  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      // User installed the app
    }
    setDeferredPrompt(null)
  }

  const selectedCoin = selectedId
    ? (tokens.find(t => t.id === selectedId) || (selectedId === 'whales-on-pulse' ? WHALES_ON_PULSE : null))
    : null
  const isWhales = selectedId === 'whales-on-pulse'

  // The visualization canvas is transparent (the space backdrop is CSS behind it),
  // so exports must composite it onto the dark background or the PNG comes out
  // see-through in image viewers and chat apps.
  const compositeCanvas = (): HTMLCanvasElement | null => {
    const src = document.querySelector('canvas') as HTMLCanvasElement | null
    if (!src) return null
    const out = document.createElement('canvas')
    out.width = src.width
    out.height = src.height
    const ctx = out.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#0a0a12'
    ctx.fillRect(0, 0, out.width, out.height)
    ctx.drawImage(src, 0, 0)
    return out
  }

  // Simple filter logic + search + pagination (~500 top + ~98 Pulse coins for the PulseChain tab)
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

    return result // top ~500 (HAC at 498-499) + up to ~98 pure Pulse coins (from Pulse sources) for the tab
  }, [tokens, activePreset, searchTerm, favorites])

  // Portfolio value: live USD total for favorited coins where user has entered holdings
  const portfolioValue = React.useMemo(() => {
    if (!tokens.length) return 0
    return favorites.reduce((total, id) => {
      const amount = holdings[id] || 0
      if (amount <= 0) return total
      const coin = tokens.find(t => t.id === id)
      if (!coin) return total
      return total + amount * (coin.current_price || 0)
    }, 0)
  }, [favorites, holdings, tokens])

  // Global market stats.
  // BTC dominance used to be the hardcoded string "~52%". It is now derived from the
  // data we already have (top ~600 coins cover the large majority of total cap), so the
  // number moves with the market instead of lying.
  const marketStats = React.useMemo(() => {
    let cap = 0
    let vol = 0
    let btcCap = 0
    for (const t of tokens) {
      cap += t.market_cap || 0
      vol += t.total_volume || 0
      if (t.id === 'bitcoin') btcCap = t.market_cap || 0
    }
    return {
      cap,
      vol,
      dominance: cap > 0 && btcCap > 0 ? (btcCap / cap) * 100 : null,
    }
  }, [tokens])

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

  // Compact valuation for list rows. Falls back through market cap -> FDV -> liquidity
  // and returns the label with it, so a PulseChain token never silently shows an FDV
  // where the row above it shows a real market cap.
  function valuationFor(coin: TokenPrice): { label: string; value: string; tone: string } {
    if ((coin.market_cap ?? 0) > 0) {
      return { label: 'MCap', value: formatMarketValue(coin.market_cap), tone: 'text-[#6b7280]' }
    }
    if ((coin.fdv ?? 0) > 0) {
      return { label: 'FDV', value: formatMarketValue(coin.fdv), tone: 'text-amber-400/70' }
    }
    if ((coin.liquidity ?? 0) > 0) {
      return { label: 'Liq', value: formatMarketValue(coin.liquidity), tone: 'text-[#67f6ff]/70' }
    }
    return { label: '', value: '—', tone: 'text-[#6b7280]' }
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
    const wasFavorited = favorites.includes(id)
    if (wasFavorited) {
      newFavs = favorites.filter(f => f !== id)
      // clean up holding data when unfavoriting (desktop feature)
      const newHoldings = { ...holdings }
      delete newHoldings[id]
      setHoldings(newHoldings)
      localStorage.setItem('cryptodust_holdings', JSON.stringify(newHoldings))
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

  // Pagination: 100 coins per page for the first 5 tabs (0-499).
  // PulseChain tab (the 6th / last) shows up to ~98 pure PulseChain coins (the ones from
  // the ecosystem category + curated + special, limited in prices.ts).
  // No leaks, previous tabs untouched.
  const PAGE_SIZE = 100
  const MAIN_PAGES = 5 // 0–500, in pages of 100
  const MAIN_SECTION_SIZE = MAIN_PAGES * PAGE_SIZE
  // Was Math.ceil(600 / 100), which also implied a hard 600-coin ceiling on the
  // PulseChain tab. The tab now shows whatever the Pulse sources actually return.
  const totalPages = MAIN_PAGES + 1
  const isLastPageForTokens = currentPage === totalPages - 1
  const currentPageTokens = isLastPageForTokens
    ? filteredTokens.slice(MAIN_SECTION_SIZE) // every Pulse coin, not a fixed 98
    : filteredTokens.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  // No planet scale boosts (as requested).
  const baseScale = isMobile ? 0.45 : 1
  const planetScale = baseScale

  // Top offset for the collapsible pages/tabs panel on desktop only.
  // Expanded: ~46px (tabs bar) so planets stay below it. Minimized: tiny 7px bar for max planet surface.
  const desktopTopOffset = !isMobile ? (pagesPanelExpanded ? 46 : 7) : 0

  // Helper to determine blockchain for a coin.
  // Uses existing PULSECHAIN_IDS + static map for common chains.
  // No additional API calls as requested.
  const getBlockchain = (coin: TokenPrice) => {
    const id = coin.id.toLowerCase();
    const symbol = coin.symbol.toLowerCase();
    const name = coin.name.toLowerCase();

    if (
      PULSECHAIN_IDS.has(id) ||
      PULSECHAIN_IDS.has(symbol) ||
      id.includes('pulse') ||
      symbol.includes('pulse') ||
      name.includes('pulse')
    ) {
      return 'PulseChain';
    }

    // Static mapping for major blockchains (top coins mostly)
    const chainMap: Record<string, string> = {
      'bitcoin': 'Bitcoin',
      'ethereum': 'Ethereum',
      'solana': 'Solana',
      'binancecoin': 'BNB Chain',
      'ripple': 'XRP Ledger',
      'cardano': 'Cardano',
      'dogecoin': 'Dogecoin',
      'avalanche-2': 'Avalanche',
      'tron': 'Tron',
      'the-open-network': 'TON',
      'polkadot': 'Polkadot',
      'chainlink': 'Ethereum',
      'polygon-ecosystem-token': 'Polygon',
    };

    return chainMap[id] || 'Ethereum'; // fallback for most ERC-20 and other tokens
  };

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
      const active = document.activeElement as HTMLElement | null
      const tag = active?.tagName?.toLowerCase()
      const typing = tag === 'input' || tag === 'textarea' || active?.isContentEditable

      // ⌘K / Ctrl+K focuses search — works even while typing elsewhere.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
        return
      }

      // Escape blurs the search field first, then clears the selection.
      if (typing) {
        if (e.key === 'Escape') (active as HTMLInputElement)?.blur()
        return
      }

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
    <div className="app-shell relative h-[100dvh] w-screen text-white overflow-hidden flex flex-col">   {/* 100dvh is much better on mobile than h-screen */}
      {/* Space backdrop — nebula tints + two twinkling star layers. Fixed and
          composited, so it costs nothing on scroll; the transparent canvas lets
          the planets float over it. Shared by desktop and mobile. */}
      <div className="app-backdrop" aria-hidden="true" />
      {/* Top Navigation - Premium cyberpunk style (hidden on mobile for maximum planet space + clean view) */}
      <nav className="nav-hairline bg-[#0a0a12]/80 backdrop-blur-xl z-50 flex-shrink-0 hidden md:block">
        <div className="w-full px-4 lg:px-5 h-14 flex items-center justify-between gap-x-4">
          <div className="flex items-center gap-x-3 flex-shrink-0">
            {/* Logo - using the new custom CryptoDUST logo */}
            <div className="flex items-center gap-x-2.5 group">
              <img
                src="/cryptodust-logo.png"
                alt="CryptoDUST"
                className="w-9 h-9 object-contain drop-shadow-[0_0_10px_rgba(251,191,36,0.35)] group-hover:scale-105 transition-transform"
              />
              <div className="leading-none">
                <div className="flex items-baseline gap-x-1">
                  <span className="font-semibold tracking-[-1.1px] text-[22px]">Crypto</span>
                  <span className="wordmark-dust font-bold tracking-[-1.1px] text-[22px]">DUST</span>
                </div>
                <div className="text-[9px] text-[#6b7280] mt-0.5 tracking-[1.4px] hidden lg:block">
                  MARKET VISUALIZER
                </div>
              </div>
            </div>

            <div className="flex items-center gap-x-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-[10px] border border-emerald-500/25">
              <div className="live-dot w-1.5 h-1.5 bg-emerald-400 rounded-full" />
              <span className="text-emerald-400 font-semibold tracking-[1.2px]">LIVE</span>
            </div>
          </div>

          <div className="flex items-center gap-x-2 text-sm min-w-0">
            {/* HIGHLIGHT BIG MOVERS — label collapses on narrower desktops instead of overflowing */}
            <button
              onClick={highlightBigMovers}
              title="Highlight big movers for 45s (H)"
              className={`premium-button px-3 xl:px-4 h-9 text-[13px] font-semibold rounded-2xl flex items-center gap-x-2 border flex-shrink-0 ${
                highlightUntil > Date.now()
                  ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white border-orange-400 shadow-[0_0_20px_rgb(249,115,22,0.4)]'
                  : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/25'
              }`}
            >
              <Zap className="w-4 h-4 flex-shrink-0" />
              <span className="hidden lg:inline whitespace-nowrap">
                {highlightUntil > Date.now() ? 'Highlighting' : 'Big movers'}
              </span>
            </button>

            {/* Search — real icon + ⌘K hint (the old one showed a decorative "⌘" as the icon) */}
            <div className="relative group flex-shrink min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280] group-focus-within:text-[#67f6ff] transition-colors pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search coins..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(0)
                }}
                className="bg-[#0b0b12] border border-[#25252f] rounded-2xl pl-9 pr-16 h-9 text-sm w-44 xl:w-64 focus:outline-none focus:border-[#67f6ff] focus:bg-[#111118] focus:w-64 xl:focus:w-72 transition-all placeholder:text-[#6b7280]"
              />
              {searchTerm ? (
                <button
                  onClick={() => { setSearchTerm(''); setCurrentPage(0) }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-white"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span className="kbd absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden xl:block">
                  ⌘K
                </span>
              )}
            </div>

            <button
              onClick={() => window.location.reload()}
              title="Refresh market data"
              aria-label="Refresh market data"
              className="premium-button flex items-center justify-center w-9 h-9 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white flex-shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <div className="w-px h-6 bg-white/10 mx-0.5 flex-shrink-0" />

            {/* Partner links — icon-first pills. Labels appear when there's room,
                so the bar stops overflowing on 1280–1440px screens. */}
            <div className="flex items-center gap-x-1.5 flex-shrink-0">
              {EXTERNAL_LINKS.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={link.label}
                  className={`premium-button group flex items-center gap-x-2 h-9 px-1.5 2xl:pr-3.5 rounded-2xl bg-white/[0.04] border border-white/10 ${link.text} ${link.ring}`}
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 p-0.5 transition-transform group-hover:scale-105">
                    <img src={link.img} alt="" className="h-full w-full object-contain" />
                  </span>
                  <span className="font-semibold tracking-tight text-[13px] hidden 2xl:inline whitespace-nowrap">
                    {link.label}
                  </span>
                </a>
              ))}
            </div>

            <div className="w-px h-6 bg-white/10 mx-0.5 flex-shrink-0" />

            {/* Donate */}
            <button
              onClick={() => setShowDonateModal(true)}
              className="premium-button flex items-center gap-x-2 px-3 h-9 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 hover:border-amber-500/50 text-amber-300 hover:text-amber-200 text-[13px] flex-shrink-0"
              title="Support the project with ETH"
            >
              <Heart className="w-4 h-4" />
              <span className="font-semibold tracking-tight hidden xl:inline">Donate</span>
            </button>

            {/* Export group */}
            <div className="flex items-center bg-white/5 rounded-2xl border border-white/10 h-9 overflow-hidden flex-shrink-0">
              <button
                onClick={() => {
                  const canvas = compositeCanvas()
                  if (canvas) {
                    const link = document.createElement('a')
                    link.download = `cryptodust-${new Date().toISOString().slice(0, 10)}.png`
                    link.href = canvas.toDataURL('image/png')
                    link.click()
                  }
                }}
                className="h-full px-3 flex items-center gap-1.5 text-xs text-white/80 hover:text-white hover:bg-white/10 border-r border-white/10 transition-colors"
                title="Download the visualization as PNG"
                aria-label="Download the visualization as PNG"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  const canvas = compositeCanvas()
                  if (!canvas) return
                  canvas.toBlob(async (blob) => {
                    if (!blob) return
                    try {
                      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                      setCopiedCanvas(true)
                      setTimeout(() => setCopiedCanvas(false), 1800)
                    } catch {
                      /* clipboard blocked — the download button above still works */
                    }
                  })
                }}
                className="h-full px-3 flex items-center text-xs text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                title="Copy the visualization to clipboard"
                aria-label="Copy the visualization to clipboard"
              >
                {copiedCanvas
                  ? <Check className="w-4 h-4 text-emerald-400" />
                  : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Slim mobile header — the app had no branding at all on phones. */}
      <header className="nav-hairline md:hidden flex-shrink-0 bg-[#0a0a12]/80 backdrop-blur-xl z-50">
        <div className="h-12 px-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/cryptodust-logo.png" alt="CryptoDUST" className="w-7 h-7 object-contain flex-shrink-0" />
            <div className="flex items-baseline gap-1 leading-none">
              <span className="font-semibold tracking-[-0.8px] text-lg">Crypto</span>
              <span className="wordmark-dust font-bold tracking-[-0.8px] text-lg">DUST</span>
            </div>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 flex-shrink-0">
              <span className="live-dot w-1 h-1 bg-emerald-400 rounded-full" />
              <span className="text-emerald-400 text-[8px] font-semibold tracking-[1px]">LIVE</span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            {deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-xl bg-orange-500/12 text-orange-300 border border-orange-500/30 active:bg-orange-500/25"
              >
                Install
              </button>
            )}
            <button
              onClick={() => setShowDonateModal(true)}
              aria-label="Support the project"
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 active:bg-amber-500/20"
            >
              <Heart className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.location.reload()}
              aria-label="Refresh market data"
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/70 active:bg-white/10"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Global Market Stats - Premium cards (hidden on mobile to give maximum space to the planets) */}
      <div className="border-b border-white/[0.06] bg-[#0a0a12]/70 backdrop-blur-md flex-shrink-0 hidden md:block">
        <div className="w-full px-4 lg:px-5 py-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-sm">
            {[
              {
                label: 'TOTAL MARKET CAP',
                value: `$${(marketStats.cap / 1e12).toFixed(2)}T`,
                icon: Coins,
                tint: 'text-emerald-400',
                chip: 'bg-emerald-500/10 ring-emerald-400/25',
                glow: 'hover:shadow-[0_0_24px_-8px_rgba(52,211,153,0.35)] hover:border-emerald-400/25',
                hint: 'Sum of the tracked coins',
              },
              {
                label: '24H VOLUME',
                value: `$${(marketStats.vol / 1e9).toFixed(1)}B`,
                icon: BarChart3,
                tint: 'text-sky-400',
                chip: 'bg-sky-500/10 ring-sky-400/25',
                glow: 'hover:shadow-[0_0_24px_-8px_rgba(56,189,248,0.35)] hover:border-sky-400/25',
                hint: 'Traded in the last 24 hours',
              },
              {
                label: 'BTC DOMINANCE',
                value: marketStats.dominance != null ? `${marketStats.dominance.toFixed(1)}%` : '—',
                icon: Bitcoin,
                tint: 'text-amber-400',
                chip: 'bg-amber-500/10 ring-amber-400/25',
                glow: 'hover:shadow-[0_0_24px_-8px_rgba(251,191,36,0.35)] hover:border-amber-400/25',
                hint: 'BTC share of the tracked market cap',
              },
              {
                label: 'COINS VISIBLE',
                value: `${filteredTokens.length}`,
                suffix: `/ ${tokens.length}`,
                icon: Layers,
                tint: 'text-violet-400',
                chip: 'bg-violet-500/10 ring-violet-400/25',
                glow: 'hover:shadow-[0_0_24px_-8px_rgba(167,139,250,0.35)] hover:border-violet-400/25',
                hint: 'Matching the active filter and search',
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className={`stat-card rounded-2xl px-4 py-2.5 flex items-center gap-3 ${stat.glow}`}
                title={stat.hint}
              >
                <span className={`flex items-center justify-center w-8 h-8 rounded-xl ring-1 flex-shrink-0 ${stat.chip}`}>
                  <stat.icon className={`w-4 h-4 ${stat.tint}`} />
                </span>
                <div className="min-w-0">
                  <div className="text-[#6b7280] text-[10px] font-medium tracking-[0.8px] mb-0.5 truncate">
                    {stat.label}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-semibold tabular-nums text-[21px] tracking-[-0.5px] leading-none">
                      {isLoading && !tokens.length ? '—' : stat.value}
                    </span>
                    {stat.suffix && (
                      <span className="text-[#6b7280] text-xs tabular-nums">{stat.suffix}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls (Size by + TOP + Highlight + Pause + Quick Filters + Whales button).
          Hidden on mobile. On desktop: visibility is tied to the minimizable pages tabs panel state.
          When you minimize the pages panel (center arrow), these controls also hide to give maximum planet surface. */}
      {pagesPanelExpanded && (
        <div className="border-b border-[#25252f] bg-gradient-to-b from-[#13131b] to-[#101017] flex-shrink-0 hidden md:block">
          <div className="w-full px-4 lg:px-5 py-3 flex items-center gap-x-2.5 gap-y-2.5 flex-wrap">
            {/* One 34px control height and one radius across the whole band — the pieces
                used to range from py-1 to py-2 with rounded-2xl/3xl mixed together. */}
            <div className="seg">
              <span className="seg-label">Size</span>
              {(['change_24h', 'market_cap', 'volume', 'price', 'liquidity'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSizeMetric(m)}
                  title={
                    m === 'liquidity'
                      ? 'DEX pool depth — the meaningful size metric for PulseChain tokens'
                      : undefined
                  }
                  className={`seg-item ${sizeMetric === m ? 'seg-item-on' : ''}`}
                >
                  {m === 'change_24h' ? '24h %' : m === 'market_cap' ? 'Market cap' : m.charAt(0).toUpperCase() + m.slice(1)}
                </button>
              ))}
            </div>

            <div className="seg">
              <span className="seg-label">Label</span>
              {(['price', 'change_24h'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setTopLabel(m)}
                  className={`seg-item ${topLabel === m ? 'seg-item-on' : ''}`}
                >
                  {m === 'price' ? 'Price' : '24h %'}
                </button>
              ))}
            </div>

            <div className="w-px h-6 bg-white/[0.08]" />

            <button
              onClick={() => setPhysicsPaused(!physicsPaused)}
              className={`ctl ${
                physicsPaused
                  ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/15'
                  : 'bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
              title={physicsPaused ? 'Resume physics simulation (Space)' : 'Pause physics simulation (Space)'}
            >
              {physicsPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              {physicsPaused ? 'Resume' : 'Pause'}
            </button>

            <button
              onClick={() => {
                setPerformanceMode(prev => {
                  const next = !prev
                  try {
                    localStorage.setItem('cryptodust_performance_mode', next ? '1' : '0')
                  } catch { /* ignore */ }
                  return next
                })
              }}
              className={`ctl ${
                performanceMode
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/35 hover:bg-amber-500/20'
                  : 'bg-white/[0.04] text-white/70 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
              title={
                performanceMode
                  ? 'Manual performance mode on — max savings'
                  : 'Enable manual performance mode (smart perf auto-optimizes when idle)'
              }
            >
              <Gauge className="w-3.5 h-3.5" />
              {performanceMode ? 'Perf on' : 'Perf'}
            </button>

            <div className="w-px h-6 bg-white/[0.08]" />

            {/* Filters sit on the same line now instead of a second stacked row */}
            {[
              { label: 'Gainers', key: 'gainers' },
              { label: 'Losers', key: 'losers' },
              { label: 'Volume', key: 'volume' },
              { label: 'Favorites', key: 'favorites' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => {
                  setActivePreset(activePreset === f.key ? null : f.key)
                  setCurrentPage(0)
                }}
                className={`filter-chip ctl ${
                  activePreset === f.key
                    ? 'bg-white text-black border-white font-semibold'
                    : 'bg-white/[0.04] border-white/10 text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}

            {activePreset && (
              <button
                onClick={() => { setActivePreset(null); setCurrentPage(0) }}
                className="ctl bg-transparent border-transparent text-[#6b7280] hover:text-white px-2"
                title="Clear filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            <div className="ml-auto flex items-center gap-x-2.5">
              {portfolioValue > 0 && (
                <div
                  className="ctl bg-emerald-500/10 border-emerald-500/30 text-emerald-400 tabular-nums font-semibold cursor-default"
                  title="Total value of your holdings in Favorites (enter amounts in the Details panel)"
                >
                  <span className="text-[9px] tracking-[1px] text-emerald-400/60 font-medium">PORTFOLIO</span>
                  ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              )}

              <button
                onClick={() => setSelectedId('whales-on-pulse')}
                className="glow-special group flex items-center gap-2 h-[34px] pl-1 pr-3.5 rounded-2xl border bg-violet-500/[0.08] hover:bg-violet-500/15 transition-colors flex-shrink-0"
                title="Whales on Pulse — whale & dry powder leaderboard"
              >
                <span className="w-[26px] h-[26px] rounded-full bg-sky-300 overflow-hidden flex-shrink-0 ring-1 ring-white/20">
                  <img src="/wop.png" alt="" className="w-full h-full object-contain scale-95" />
                </span>
                <span className="text-[13px] font-semibold tracking-tight text-violet-100 whitespace-nowrap">
                  Whales on Pulse
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Area */}
      {/* Transparent, not bg-black — the space backdrop lives behind this area */}
      <div className="flex-1 relative overflow-hidden">
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
            planetScale={planetScale}
            isMobile={isMobile}
            isPulsechain={activePreset === 'pulsechain'}
            topOffset={desktopTopOffset}
            performanceMode={performanceMode}
            marketTableOpen={isMarketOpen}
          />
        )}

        {/* Desktop-only collapsible Pages/Tabs panel (absolute overlay on viz for max planet space).
            Left-aligned tabs (old position) + centered ▲/▼ arrow to toggle.
            When minimized: thin bar + larger canvas area for planets.
            When expanding: planets in the way get pushed down via topOffset in physics.
            This state also controls visibility of the upper "Size by" + Quick Filters bar. */}
        {!isMobile && (
          <div className="absolute top-0 left-0 right-0 z-[45] pointer-events-auto select-none">
            {pagesPanelExpanded ? (
              // Expanded: tabs row (left aligned) with page selectors + centered collapse arrow
              <div className="relative flex items-center justify-start gap-x-1.5 bg-[#0f0f17]/90 backdrop-blur-xl border-b border-white/[0.07] px-4 py-2">
                {Array.from({ length: totalPages }).map((_, index) => {
                  const start = index * 100
                  // Clamped to >= start: when fewer coins are loaded than the page
                  // range, this used to render nonsense like "200–108".
                  const end = Math.max(start, Math.min(start + 100, filteredTokens.length))
                  const isLastPage = index === totalPages - 1
                  const label = isLastPage ? 'PulseChain' : `${start}–${end}`
                  const isActive = currentPage === index
                  return (
                    <button
                      key={index}
                      onClick={() => setCurrentPage(index)}
                      className={`text-[11px] h-[26px] px-3 rounded-xl border whitespace-nowrap tabular-nums transition-colors ${isLastPage ? 'min-w-[104px] font-semibold' : 'min-w-[62px]'} ${
                        isActive
                          ? 'bg-[#67f6ff] text-black border-[#67f6ff] font-semibold'
                          : 'bg-white/[0.04] border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                      } ${isLastPage && !isActive ? 'glow-special' : ''}`}
                    >
                      {label}
                    </button>
                  )
                })}

                {/* Collapse handle — was a bare "▲" glyph in a circle */}
                <button
                  onClick={() => setPagesPanelExpanded(false)}
                  className="collapse-handle"
                  title="Hide the toolbar for more planet space"
                  aria-label="Hide the toolbar"
                >
                  <span className="collapse-grip" />
                </button>
              </div>
            ) : (
              // Minimized: thin bar so planets have maximum surface. Click anywhere to reopen.
              <div
                className="group h-[8px] bg-[#0f0f17]/70 border-b border-white/[0.06] cursor-pointer hover:bg-[#0f0f17] transition-colors"
                onClick={() => setPagesPanelExpanded(true)}
                title="Show the toolbar"
              >
                <button
                  onClick={(e) => { e.stopPropagation(); setPagesPanelExpanded(true) }}
                  className="collapse-handle collapse-handle-down"
                  aria-label="Show the toolbar"
                >
                  <span className="collapse-grip" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Mobile: Simple list view instead of planets (due to touch issues) */}
        {isMobile && (
          <div className="h-full overflow-auto px-3 pt-2 pb-20 text-sm custom-scrollbar">
            {/* Row 1 — real filters. Previously "Big Movers" was mixed in here but only
                triggered the highlight effect, so its active state never matched. */}
            <div className="flex gap-2 overflow-x-auto pb-2.5 hide-scrollbar scroll-fade-x">
              {[
                { label: 'All', key: null },
                { label: 'Gainers', key: 'gainers' },
                { label: 'Losers', key: 'losers' },
                { label: 'Volume', key: 'volume' },
                { label: 'Favorites', key: 'favorites' },
              ].map(f => {
                const isActive = activePreset === f.key
                return (
                  <button
                    key={f.label}
                    onClick={() => {
                      setActivePreset(f.key)
                      setCurrentPage(0)
                    }}
                    className={`filter-chip text-xs px-3.5 py-2 rounded-2xl border whitespace-nowrap flex-shrink-0 ${
                      isActive
                        ? 'bg-white text-black border-white font-semibold'
                        : 'bg-white/5 border-white/10 text-white/80'
                    }`}
                  >
                    {f.label}
                  </button>
                )
              })}

              <button
                onClick={highlightBigMovers}
                className={`filter-chip text-xs px-3.5 py-2 rounded-2xl border whitespace-nowrap flex-shrink-0 flex items-center gap-1.5 ${
                  highlightUntil > Date.now()
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white border-orange-400'
                    : 'bg-orange-500/10 border-orange-500/25 text-orange-300'
                }`}
              >
                <Zap className="w-3 h-3" />
                Big movers
              </button>

              <button
                onClick={() => {
                  setSelectedId('whales-on-pulse')
                  setCurrentPage(0)
                }}
                className="glow-special filter-chip text-xs px-3.5 py-2 rounded-2xl border whitespace-nowrap flex-shrink-0 bg-violet-500/10 text-violet-200 flex items-center gap-1.5"
              >
                <img src="/wop.png" alt="" className="w-4 h-4 object-contain rounded-full" />
                Whales on Pulse
              </button>
            </div>

            {/* Row 2 — partner links, with their actual logos */}
            <div className="flex gap-2 overflow-x-auto pb-3 hide-scrollbar scroll-fade-x">
              {EXTERNAL_LINKS.map(link => (
                <a
                  key={link.label}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-[11px] pl-1.5 pr-3 py-1.5 rounded-2xl border whitespace-nowrap flex-shrink-0 flex items-center gap-2 bg-white/[0.04] border-white/10 ${link.text} active:bg-white/10`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/10 ring-1 ring-white/15 p-0.5">
                    <img src={link.img} alt="" className="h-full w-full object-contain" />
                  </span>
                  <span className="font-medium">{link.label}</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60" />
                </a>
              ))}
            </div>

            {/* Mobile Search - full width, touch friendly, themed */}
            <div className="sticky top-0 z-10 bg-[#0a0a12]/85 backdrop-blur-md py-1 -mx-3 px-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search coins..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(0)
                  }}
                  className="w-full bg-[#0b0b12] border border-[#25252f] rounded-2xl pl-10 pr-10 py-3 text-sm focus:outline-none focus:border-[#67f6ff] focus:bg-[#111118] transition-all placeholder:text-[#6b7280]"
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6b7280]" />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('')
                      setCurrentPage(0)
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#6b7280] active:text-white text-lg leading-none"
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              {searchTerm && (
                <div className="mt-1.5 text-[10px] text-[#9ca3af] flex items-center justify-between">
                  <span>{filteredTokens.length} results</span>
                  <button
                    onClick={() => {
                      setSearchTerm('')
                      setCurrentPage(0)
                    }}
                    className="text-[#67f6ff] active:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Pages - better spacing and touch targets on mobile */}
            {/* Always 6 tabs (same as desktop) */}
            <div className="flex gap-2 overflow-x-auto pb-4 hide-scrollbar mt-3">
              {Array.from({ length: totalPages }).map((_, index) => {
                const start = index * 100;
                const end = Math.max(start, Math.min(start + 100, filteredTokens.length));
                const isLastPage = index === totalPages - 1;
                const label = isLastPage ? 'PulseChain' : `${start}–${end}`;
                return (
                  <button
                    key={index}
                    onClick={() => setCurrentPage(index)}
                    className={`text-[11px] px-3.5 py-1.5 rounded-2xl border whitespace-nowrap ${isLastPage ? 'min-w-[160px] px-4' : 'min-w-[72px]'} ${
                      currentPage === index
                        ? 'bg-[#67f6ff] text-black border-[#67f6ff] font-medium'
                        : 'bg-white/5 border-white/10 text-white/70 active:bg-white/10'
                    } ${isLastPage && currentPage !== index ? 'glow-special' : ''}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Portfolio value — moved ABOVE the list. It used to render after ~100 rows,
                so on mobile you had to scroll to the bottom to ever see it. */}
            {portfolioValue > 0 && (
              <div className="mb-3 flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-[10px] tracking-[1px] text-emerald-400/80 font-medium">PORTFOLIO</span>
                <span className="text-base font-semibold tabular-nums text-emerald-400">
                  ${portfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {/* Mobile List */}
            <div className="space-y-1.5">
              {currentPageTokens.map((coin, idx) => {
                const change = coin.price_change_percentage_24h || 0;
                const isBigMover = Math.abs(change) > 6;
                const isHighlightActive = highlightUntil > Date.now();
                const isExtremeGainer = change > 60;
                const isFav = favorites.includes(coin.id);
                const isSelected = selectedId === coin.id;

                let highlightClass = '';

                if (isHighlightActive && isBigMover) {
                  highlightClass = change > 0
                    ? 'bg-emerald-500/15 border-emerald-500/40'
                    : 'bg-red-500/15 border-red-500/40';
                }

                return (
                  <div
                    key={coin.id}
                    onClick={() => handleSelect(coin.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl border transition-colors active:bg-white/10 ${
                      highlightClass
                        ? highlightClass
                        : isSelected
                          ? 'bg-[#67f6ff]/10 border-[#67f6ff]'
                          : 'bg-white/[0.04] border-white/[0.08]'
                    } ${isExtremeGainer
                        ? 'shadow-[0_0_14px_-2px_rgba(74,222,128,0.55)] border-emerald-400/70'
                        : change >= 0 ? 'row-edge-up' : 'row-edge-down'}`}
                  >
                    <span className="w-5 text-[10px] tabular-nums text-[#6b7280] flex-shrink-0 text-right">
                      {currentPage * PAGE_SIZE + idx + 1}
                    </span>

                    {coin.image ? (
                      <img
                        src={coin.image}
                        alt=""
                        loading="lazy"
                        className="w-9 h-9 rounded-full flex-shrink-0 ring-1 ring-white/10"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full flex-shrink-0 bg-white/5 ring-1 ring-white/10" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold uppercase tracking-tight">{coin.symbol}</span>
                        {isFav && <span className="text-amber-400 text-xs leading-none">★</span>}
                      </div>
                      <div className="text-[11px] text-[#9ca3af] truncate">{coin.name}</div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="font-semibold tabular-nums leading-tight">
                        {formatPrice(coin.current_price)}
                      </div>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        {(() => {
                          const v = valuationFor(coin)
                          return (
                            <span className={`text-[10px] tabular-nums ${v.tone}`}>
                              {v.label && <span className="mr-1 opacity-70">{v.label}</span>}
                              {v.value}
                            </span>
                          )
                        })()}
                        <span
                          className={`text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md ${
                            change >= 0
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'text-red-400 bg-red-500/10'
                          }`}
                        >
                          {change > 0 ? '+' : ''}{change.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {currentPageTokens.length === 0 && !isLoading && (
              <div className="text-center py-14 px-6">
                <div className="text-[#6b7280] text-sm mb-1">No coins match your filters</div>
                <button
                  onClick={() => { setSearchTerm(''); setActivePreset(null); setCurrentPage(0) }}
                  className="text-[#67f6ff] text-xs active:underline"
                >
                  Reset filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Old mobile floating buttons and duplicate chips removed - using integrated list view instead */}

        {/* Mobile Bottom Sheet - Richer info panel (only shown in mobile list view) */}
        {isMobile && selectedCoin && (
          <div
            className={`sheet-in fixed bottom-0 left-0 right-0 z-[70] bg-[#0f0f16] border-t border-[#25252f] rounded-t-3xl px-4 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.5)] ${ (selectedCoin.price_change_percentage_24h || 0) > 60 ? 'shadow-[0_-8px_18px_#4ade80,0_-8px_30px_rgba(0,0,0,0.5)] border-t-emerald-400/60' : '' }`}
            style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
          >
            {/* Grab handle — makes it read as a sheet */}
            <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mb-3" />

            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                {selectedCoin.image && (
                  <img src={selectedCoin.image} alt="" className="w-10 h-10 rounded-full ring-1 ring-white/10" />
                )}
                <div>
                  <div className={`font-semibold text-lg ${(selectedCoin.price_change_percentage_24h || 0) > 60 ? 'text-emerald-300 drop-shadow-[0_0_4px_#4ade80]' : ''}`}>{selectedCoin.symbol}</div>
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
                  aria-label="Close"
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/10 text-white/70"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Holdings input for favorited coins. Was nested inside the flex header above,
                which made it a third row item instead of its own line. */}
            {!isWhales && favorites.includes(selectedCoin.id) && (
              <div className="flex items-center gap-2 text-xs mb-3 px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                <span className="text-[#6b7280] flex-shrink-0">My holdings</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  placeholder="0"
                  className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:border-[#67f6ff]"
                  value={holdings[selectedCoin.id] || ''}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value)
                    updateHolding(selectedCoin.id, isFinite(val) ? val : 0)
                  }}
                />
                <span className="text-[#9ca3af] flex-shrink-0">{selectedCoin.symbol}</span>
                {holdings[selectedCoin.id] > 0 && selectedCoin.current_price && (
                  <span className="text-emerald-400 text-[11px] font-semibold tabular-nums flex-shrink-0">
                    ${(holdings[selectedCoin.id] * selectedCoin.current_price).toFixed(2)}
                  </span>
                )}
              </div>
            )}

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

            {/* Stats Grid (hidden for Whales on Pulse) — mirrors the desktop Details
                panel: real market cap when a source has one, honestly-labelled FDV
                when only a fully diluted figure exists, DEX liquidity when known. */}
            {!isWhales && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4">
                {(selectedCoin.market_cap ?? 0) > 0 ? (
                  <div className="flex justify-between border-b border-white/10 pb-1">
                    <span className="text-[#6b7280]">Market Cap</span>
                    <span className="font-medium">{formatMarketValue(selectedCoin.market_cap)}</span>
                  </div>
                ) : (selectedCoin.fdv ?? 0) > 0 ? (
                  <div className="flex justify-between border-b border-amber-500/20 pb-1">
                    <span className="text-amber-400/80">FDV</span>
                    <span className="font-medium">{formatMarketValue(selectedCoin.fdv)}</span>
                  </div>
                ) : (
                  <div className="flex justify-between border-b border-white/10 pb-1">
                    <span className="text-[#6b7280]">Market Cap</span>
                    <span className="font-medium text-[#6b7280]">—</span>
                  </div>
                )}
                <div className="flex justify-between border-b border-white/10 pb-1">
                  <span className="text-[#6b7280]">24h Volume</span>
                  <span className="font-medium">{formatMarketValue(selectedCoin.total_volume)}</span>
                </div>
                {(selectedCoin.liquidity ?? 0) > 0 && (
                  <div className="flex justify-between border-b border-cyan-500/20 pb-1 col-span-2">
                    <span className="text-[#67f6ff]/80">DEX Liquidity</span>
                    <span className="font-medium">
                      {formatMarketValue(selectedCoin.liquidity)}
                      <span className="ml-1.5 text-[9px] text-[#6b7280] uppercase">{selectedCoin.dexSource || 'dex'}</span>
                    </span>
                  </div>
                )}
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
          <div className="panel-accent pop-in absolute top-4 right-4 z-50 w-[336px] rounded-3xl overflow-hidden hidden md:block backdrop-blur-2xl">
            <div className="px-5 pt-4 pb-4 border-b border-white/[0.07] bg-black/25">
              <div className="flex items-center gap-3">
                {selectedCoin.image && (
                  <img src={selectedCoin.image} alt="" className="w-11 h-11 rounded-full ring-1 ring-white/10 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xl tracking-tight uppercase">{selectedCoin.symbol}</span>
                    {/* Skip the chain badge when it just repeats the coin name (BTC → "Bitcoin") */}
                    {!isWhales && getBlockchain(selectedCoin).toLowerCase() !== selectedCoin.name.toLowerCase() && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/[0.08] border border-white/10 text-[#9ca3af] font-medium">
                        {getBlockchain(selectedCoin)}
                      </span>
                    )}
                  </div>
                  <div className="text-[13px] text-[#9ca3af] truncate">{selectedCoin.name}</div>
                </div>

                {!isWhales && (
                  <button
                    onClick={() => toggleFavorite(selectedCoin.id)}
                    className="text-2xl leading-none transition-transform hover:scale-110 active:scale-90 flex-shrink-0"
                    title={favorites.includes(selectedCoin.id) ? 'Remove from favorites' : 'Add to favorites'}
                  >
                    {favorites.includes(selectedCoin.id) ? <span className="text-amber-400">★</span> : <span className="text-white/35">☆</span>}
                  </button>
                )}
                <button
                  onClick={() => setSelectedId(null)}
                  aria-label="Close details"
                  className="w-7 h-7 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 text-[#6b7280] hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-5">
              {/* Holdings for this favorite. Amounts feed the live portfolio total in the filter bar. */}
              {favorites.includes(selectedCoin.id) && (
                <div className="mb-4 flex items-center gap-2 text-xs px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10">
                  <span className="text-white/50 flex-shrink-0">Holdings</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    className="flex-1 min-w-0 bg-black/40 border border-white/15 rounded-lg px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:border-[#67f6ff]"
                    value={holdings[selectedCoin.id] || ''}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value)
                      updateHolding(selectedCoin.id, isFinite(val) ? val : 0)
                    }}
                    placeholder="0"
                  />
                  <span className="text-white/60 flex-shrink-0">{selectedCoin.symbol}</span>
                  {holdings[selectedCoin.id] > 0 && selectedCoin.current_price && (
                    <span className="text-emerald-400 text-[11px] font-semibold tabular-nums flex-shrink-0">
                      ${(holdings[selectedCoin.id] * selectedCoin.current_price).toFixed(2)}
                    </span>
                  )}
                </div>
              )}

              <div className="space-y-3 text-sm">
                {!isWhales && (
                  <>
                    {/* Hero price + change pill */}
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-[10px] text-[#6b7280] tracking-[1px] mb-1">PRICE</div>
                        <div className="font-semibold tabular-nums text-[26px] tracking-[-1px] leading-none truncate">
                          {formatPrice(selectedCoin.current_price)}
                        </div>
                      </div>
                      <span
                        className={`text-[13px] font-semibold tabular-nums px-2 py-1 rounded-lg flex-shrink-0 ${
                          selectedCoin.price_change_percentage_24h >= 0
                            ? 'text-emerald-400 bg-emerald-500/12 border border-emerald-500/25'
                            : 'text-red-400 bg-red-500/12 border border-red-500/25'
                        }`}
                      >
                        {selectedCoin.price_change_percentage_24h > 0 ? '+' : ''}
                        {(selectedCoin.price_change_percentage_24h || 0).toFixed(2)}%
                      </span>
                    </div>

                    {/* Mini Sparkline — desktop visual polish (idea 4) */}
                    <div className="pt-2 pb-1 border-t border-white/[0.07]">
                      <div className="flex items-center justify-between text-[10px] text-[#6b7280] mb-1">
                        <span className="tracking-[1px]">24H TREND</span>
                        <span title="Shape generated from the 24h change — not tick data">simulated</span>
                      </div>
                      <MiniSparkline coin={selectedCoin} width={288} height={52} />
                    </div>

                    {/* Market cap when it is a real circulating figure. For most PulseChain
                        tokens no source has circulating supply, so DexScreener's fully
                        diluted value is shown under its own name instead of being passed
                        off as a market cap. */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      {(selectedCoin.market_cap ?? 0) > 0 ? (
                        <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2">
                          <div className="text-[9px] text-[#6b7280] tracking-[0.8px] mb-0.5">MARKET CAP</div>
                          <div className="font-semibold tabular-nums text-[13px]">
                            {formatMarketValue(selectedCoin.market_cap)}
                          </div>
                        </div>
                      ) : (selectedCoin.fdv ?? 0) > 0 ? (
                        <div
                          className="rounded-xl bg-amber-500/[0.06] border border-amber-500/20 px-3 py-2"
                          title="Fully diluted valuation (total supply × price). No source publishes a circulating supply for this token, so this is not a market cap."
                        >
                          <div className="text-[9px] text-amber-400/80 tracking-[0.8px] mb-0.5">FDV</div>
                          <div className="font-semibold tabular-nums text-[13px]">
                            {formatMarketValue(selectedCoin.fdv)}
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2">
                          <div className="text-[9px] text-[#6b7280] tracking-[0.8px] mb-0.5">MARKET CAP</div>
                          <div className="font-semibold tabular-nums text-[13px] text-[#6b7280]">—</div>
                        </div>
                      )}

                      <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2">
                        <div className="text-[9px] text-[#6b7280] tracking-[0.8px] mb-0.5">24H VOLUME</div>
                        <div className="font-semibold tabular-nums text-[13px]">
                          {formatMarketValue(selectedCoin.total_volume)}
                        </div>
                      </div>

                      {(selectedCoin.liquidity ?? 0) > 0 && (
                        <div
                          className="col-span-2 rounded-xl bg-cyan-500/[0.05] border border-cyan-500/20 px-3 py-2 flex items-center justify-between"
                          title={`Total USD liquidity in the deepest pool${selectedCoin.dexSource ? ` on ${selectedCoin.dexSource}` : ''}`}
                        >
                          <div>
                            <div className="text-[9px] text-[#67f6ff]/80 tracking-[0.8px] mb-0.5">DEX LIQUIDITY</div>
                            <div className="font-semibold tabular-nums text-[13px]">
                              {formatMarketValue(selectedCoin.liquidity)}
                            </div>
                          </div>
                          <span className="text-[9px] text-[#6b7280] uppercase tracking-wide">
                            {selectedCoin.dexSource || 'dexscreener'}
                          </span>
                        </div>
                      )}
                    </div>

                    <a
                      href={`https://www.coingecko.com/en/coins/${selectedCoin.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1 text-[11px] text-[#67f6ff]/80 hover:text-[#67f6ff] transition-colors"
                    >
                      View on CoinGecko
                      <ArrowUpRight className="w-3 h-3" />
                    </a>
                  </>
                )}

                {isWhales && (
                  <div className="text-sm text-[#9ca3af] py-1 border-t border-white/10">
                    Featured PulseChain ecosystem link. Track the biggest dry powder holders and whale movements.
                  </div>
                )}

                {activePreset === 'pulsechain' && !isWhales && (selectedCoin.market_cap ?? 0) <= 0 && (
                  <div className="text-[10px] text-violet-400/60 pt-1">
                    No source publishes circulating supply for this token — FDV (total supply × price) is shown instead.
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
          <div className="flex items-center gap-x-2 md:gap-x-2.5">
            <Layers className="w-3.5 h-3.5 md:w-4 md:h-4 text-[#67f6ff]" />
            <span className="font-semibold tracking-[-0.3px] text-[11px] md:text-sm">Market table</span>
            <span className="text-[#9ca3af] text-[9px] md:text-[10px] px-1.5 md:px-2 py-0.5 rounded-full bg-white/5 border border-white/10 tabular-nums">
              {filteredTokens.length}
            </span>
          </div>

          <div className="flex items-center gap-x-2 text-[#6b7280] text-[10px]">
            <span className="hidden sm:inline tabular-nums">
              Page {currentPage + 1} / {totalPages}
            </span>
            <span className={`transition-transform duration-200 inline-block ${isMarketOpen ? 'rotate-180' : ''}`}>▼</span>
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
                {currentPage === totalPages - 1 && ' (PulseChain)'}
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

          {/* Minimal Privacy link for app stores - only mobile drawer */}
          {isMobile && (
            <div className="px-4 pb-2 text-[10px] text-[#6b7280]">
              {/* Was an <a href="#">, which jumped the page to the top on tap. */}
              <button
                onClick={() => alert('Privacy Policy: We do not store personal data. Prices are fetched from CoinGecko.')}
                className="underline underline-offset-2 active:text-white"
              >
                Privacy Policy
              </button>
            </div>
          )}

          {/* Compact search in mobile drawer */}
          {isMobile && (
            <div className="px-4 pb-2">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search table..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value)
                    setCurrentPage(0)
                  }}
                  className="w-full bg-[#0b0b12] border border-[#25252f] rounded-xl pl-8 pr-8 py-2 text-xs focus:outline-none focus:border-[#67f6ff]"
                />
                <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-[#6b7280]" />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2 text-xs text-[#6b7280]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Market Table Content (inside drawer) */}
          <div className="flex-1 overflow-auto px-5 pt-3 pb-6 text-sm custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
            {/* Page tabs inside drawer */}
            <div className="flex items-center gap-x-1.5 flex-wrap mb-3">
              {Array.from({ length: totalPages }).map((_, index) => {
                const start = index * 100
                const end = Math.min(start + 100, filteredTokens.length)
                const isLast = index === totalPages - 1
                const label = isLast ? 'PulseChain' : `${start}–${end}`
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
                    {label}
                  </button>
                )
              })}
            </div>

            <table className="w-full text-xs market-table">
              <thead>
                <tr className="sticky top-0 z-10 bg-[#0a0a12]">
                  <th className="text-left w-8">#</th>
                  <th className="text-left">Coin</th>
                  <th className="text-right">Price</th>
                  <th className="text-right w-20">24h</th>
                  <th className="text-right hidden lg:table-cell">Volume</th>
                  <th className="text-right hidden md:table-cell">Valuation</th>
                  <th className="text-center w-10" aria-label="Favorite" />
                </tr>
              </thead>
              <tbody>
                {currentPageTokens.map((coin, idx) => {
                  const chain = getBlockchain(coin);
                  const isPulseChain = chain === 'PulseChain';
                  const change = coin.price_change_percentage_24h || 0;
                  const val = valuationFor(coin);

                  return (
                    <tr
                      key={coin.id}
                      onClick={() => handleSelect(coin.id)}
                      className={`market-row group/row cursor-pointer ${selectedId === coin.id ? 'selected' : ''}`}
                    >
                      <td className="text-[10px] tabular-nums text-[#6b7280]">
                        {isLastPageForTokens ? MAIN_SECTION_SIZE + idx + 1 : currentPage * PAGE_SIZE + idx + 1}
                      </td>

                      {/* Symbol + name stacked, with the chain badge and the outbound link
                          pushed out of the way instead of all four crammed onto one line. */}
                      <td>
                        <div className="flex items-center gap-2 min-w-0">
                          {coin.image ? (
                            <img src={coin.image} alt="" loading="lazy" className="w-6 h-6 rounded-full flex-shrink-0 ring-1 ring-white/10" />
                          ) : (
                            <div className="w-6 h-6 rounded-full flex-shrink-0 bg-white/5 ring-1 ring-white/10" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white/90 uppercase">{coin.symbol}</span>
                              {/* Skipped when it just repeats the coin name, e.g. BTC / "Bitcoin" / "Bitcoin" */}
                              {chain.toLowerCase() !== coin.name.toLowerCase() && (
                                <span className={`text-[8px] px-1.5 py-px rounded font-medium ${isPulseChain ? 'bg-violet-500/20 text-violet-300' : 'bg-white/[0.07] text-[#8b93a1]'}`}>
                                  {chain}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-[#6b7280] truncate max-w-[180px]">{coin.name}</div>
                          </div>
                          <a
                            href={`https://www.coingecko.com/en/coins/${coin.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="ml-1 text-[#6b7280] hover:text-[#67f6ff] opacity-0 group-hover/row:opacity-100 transition-opacity"
                            title="View on CoinGecko"
                            aria-label="View on CoinGecko"
                          >
                            <ArrowUpRight className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>

                      <td className="text-right font-semibold tabular-nums text-white/90">
                        {formatPrice(coin.current_price)}
                      </td>

                      <td className="text-right">
                        <span className={`inline-block px-1.5 py-0.5 rounded-md text-[11px] font-semibold tabular-nums ${
                          change >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                        }`}>
                          {change > 0 ? '+' : ''}{change.toFixed(1)}%
                        </span>
                      </td>

                      <td className="text-right hidden lg:table-cell text-[#9ca3af] tabular-nums">
                        {formatMarketValue(coin.total_volume)}
                      </td>

                      <td className={`text-right hidden md:table-cell tabular-nums ${val.tone}`}>
                        {val.label && <span className="mr-1 text-[9px] opacity-70">{val.label}</span>}
                        {val.value}
                      </td>
                      <td className="text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleFavorite(coin.id)
                          }}
                          className="text-lg leading-none transition-transform hover:scale-110 active:scale-90"
                          aria-label={favorites.includes(coin.id) ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          {favorites.includes(coin.id)
                            ? <span className="text-amber-400">★</span>
                            : <span className="text-white/25 hover:text-white/60">☆</span>}
                        </button>
                      </td>
                    </tr>
                  );
                })}
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

      {/* Error toast — was `absolute` inside a non-positioned flex root, so it anchored
          unpredictably. `fixed` puts it where it's meant to be. */}
      {error && (
        <div className="fade-in fixed bottom-16 left-1/2 -translate-x-1/2 z-[75] flex items-center gap-2 bg-red-500/12 backdrop-blur-md border border-red-500/30 text-red-300 text-xs px-4 py-2 rounded-2xl shadow-lg">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
          Price feed issue — showing cached values
        </div>
      )}

      {isLoading && tokens.length === 0 && (
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-5 bg-[#0a0a12]">
          <img
            src="/cryptodust-logo.png"
            alt=""
            className="w-14 h-14 object-contain drop-shadow-[0_0_16px_rgba(251,191,36,0.35)]"
          />
          <div className="flex items-baseline gap-1">
            <span className="font-semibold tracking-[-1px] text-[22px]">Crypto</span>
            <span className="font-semibold tracking-[-1px] text-[22px] text-orange-400">DUST</span>
          </div>
          <div className="w-36 h-0.5 rounded-full bg-white/10 overflow-hidden">
            <div className="skeleton h-full w-full rounded-full" />
          </div>
          <div className="text-[11px] text-[#6b7280] tracking-wide">Loading market data…</div>
        </div>
      )}

      {/* RampNow Buy Modal - Correctly placed inside root container */}
      {showRampModal && selectedCoin && (
        <div 
          className="fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowRampModal(false)}
        >
          <div
            className="panel-accent pop-in w-full max-w-md rounded-3xl overflow-hidden"
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
          className="fade-in fixed inset-0 z-[80] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowDonateModal(false)}
        >
          <div
            className="panel-accent pop-in w-full max-w-md rounded-3xl overflow-hidden"
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
                <div className="font-mono text-sm break-all text-white tracking-tight select-all">
                  {DONATION_ADDRESS}
                </div>
              </div>

              {/* Was mutating the button's innerText directly (fights React) and fell back
                  to alert(). Now it's plain state. */}
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(DONATION_ADDRESS)
                    setCopiedAddress(true)
                    setTimeout(() => setCopiedAddress(false), 2000)
                  } catch {
                    /* clipboard blocked — the address above is selectable */
                  }
                }}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-semibold text-base active:scale-[0.985] transition-all flex items-center justify-center gap-2"
              >
                {copiedAddress ? <><Check className="w-4 h-4" /> Copied!</> : 'Copy Ethereum Address'}
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

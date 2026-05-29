import React, { useState } from 'react'
import { Visualization } from './components/Visualization'
import { usePrices } from './lib/prices'
import { TrendingUp, Zap, ExternalLink } from 'lucide-react'

export default function App() {
  const { tokens, isLoading, error } = usePrices()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sizeMetric, setSizeMetric] = useState<'market_cap' | 'volume' | 'price'>('market_cap')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightUntil, setHighlightUntil] = useState(0)
  const [physicsPaused, setPhysicsPaused] = useState(false)
  const [isMarketOpen, setIsMarketOpen] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('cryptodust_favorites') || '[]')
    } catch {
      return []
    }
  })

  const selectedCoin = selectedId ? tokens.find(t => t.id === selectedId) : null

  // Simple filter logic + search + pagination (500 coins total, 100 per page)
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
    }

    return result.slice(0, 500) // keep max 500 coins
  }, [tokens, activePreset, searchTerm, favorites])

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

  // Pagination: 100 coins per page, max 5 pages (500 coins)
  const PAGE_SIZE = 100
  const totalPages = Math.max(1, Math.ceil(filteredTokens.length / PAGE_SIZE))
  const currentPageTokens = filteredTokens.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  )

  return (
    <div className="h-screen w-screen bg-[#0a0a12] text-white overflow-hidden flex flex-col">
      {/* Top Navigation - Premium cyberpunk style */}
      <nav className="border-b border-[#25252f] bg-[#0a0a12]/95 backdrop-blur-xl z-50 flex-shrink-0">
        <div className="w-full px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-x-4">
            {/* Logo - using the new custom CryptoDUST logo */}
            <div className="flex items-center gap-x-3 group">
              <img 
                src="/cryptodust-logo.png" 
                alt="CryptoDUST" 
                className="w-9 h-9 object-contain drop-shadow-[0_0_8px_rgba(251,191,36,0.3)] group-hover:scale-105 transition-transform" 
              />
              <div className="leading-none">
                <div>
                  <span className="font-semibold tracking-[-1.5px] text-2xl">Crypto</span>
                  <span className="font-semibold tracking-[-1.5px] text-2xl text-orange-400">DUST</span>
                </div>
                <div className="text-[9px] text-[#6b7280] -mt-1 tracking-[1px]">MARKET VISUALIZER</div>
              </div>
            </div>

            <div className="flex items-center gap-x-2 px-3 py-1 rounded-full bg-white/5 text-xs border border-white/10">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-emerald-400 font-medium tracking-widest">LIVE</span>
            </div>
          </div>

          <div className="flex items-center gap-x-2 text-sm">
            {/* Search - beautiful and prominent */}
            <div className="relative group">
              <input
                type="text"
                placeholder="Search 500 coins..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setCurrentPage(0)
                }}
                className="bg-[#0b0b12] border border-[#25252f] rounded-2xl pl-10 pr-4 py-2 text-sm w-72 focus:outline-none focus:border-[#67f6ff] focus:bg-[#111118] transition-all placeholder:text-[#6b7280]"
              />
              <div className="absolute left-3.5 top-2.5 text-[#6b7280] group-focus-within:text-[#67f6ff]">⌘</div>
            </div>

            <button 
              onClick={() => window.location.reload()} 
              className="premium-button flex items-center gap-x-2 px-4 h-9 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10"
            >
              <TrendingUp className="w-4 h-4" />
              <span className="font-medium">Refresh</span>
            </button>

            {/* Beautiful external links - enhanced premium style */}
            <a 
              href="https://app.provex.com" 
              target="_blank" 
              className="premium-button group flex items-center gap-x-2 px-5 h-9 rounded-2xl bg-gradient-to-r from-orange-500/15 to-amber-500/15 hover:from-orange-500/25 hover:to-amber-500/25 border border-orange-500/30 hover:border-orange-500/50 text-orange-300 hover:text-orange-200 transition-all active:scale-[0.985] hover:shadow-md hover:shadow-orange-500/10"
            >
              <ExternalLink className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              <span className="hidden md:inline font-semibold tracking-tight">ProveX</span>
            </a>

            <a 
              href="https://libertyswap.finance" 
              target="_blank" 
              className="premium-button group flex items-center gap-x-2 px-5 h-9 rounded-2xl bg-gradient-to-r from-cyan-500/15 to-teal-500/15 hover:from-cyan-500/25 hover:to-teal-500/25 border border-cyan-500/30 hover:border-cyan-500/50 text-cyan-300 hover:text-cyan-200 transition-all active:scale-[0.985] hover:shadow-md hover:shadow-cyan-500/10"
            >
              <ExternalLink className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              <span className="hidden md:inline font-semibold tracking-tight">LibertySwap</span>
            </a>

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

      {/* Global Market Stats - Premium cards */}
      <div className="border-b border-[#25252f] bg-[#0a0a12] flex-shrink-0">
        <div className="w-full px-5 py-3.5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {[
              { label: "TOTAL MARKET CAP", value: `$${(filteredTokens.reduce((sum, t) => sum + (t.market_cap || 0), 0) / 1e12).toFixed(2)}T` },
              { label: "24H VOLUME", value: `$${(filteredTokens.reduce((sum, t) => sum + (t.total_volume || 0), 0) / 1e9).toFixed(1)}B` },
              { label: "BTC DOMINANCE", value: "~52%" },
              { label: "COINS VISIBLE", value: `${filteredTokens.length} / 500` },
            ].map((stat, index) => (
              <div key={index} className="stat-card rounded-2xl px-4 py-3">
                <div className="text-[#6b7280] text-[10px] tracking-[0.5px] mb-1">{stat.label}</div>
                <div className="font-semibold tabular-nums text-xl tracking-tighter">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Controls + Quick Filters - More beautiful and interesting */}
      <div className="border-b border-[#25252f] bg-[#111118] flex-shrink-0">
        <div className="w-full px-5 py-3.5">
          {/* Timeframe & Metrics */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
            <div className="control-group flex items-center rounded-3xl p-1">
              <div className="px-3 text-xs font-medium text-[#6b7280] tracking-widest">SIZE BY</div>
              {(['market_cap','volume','price'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSizeMetric(m)}
                  className={`px-4 py-1.5 rounded-2xl text-sm font-medium ${sizeMetric === m ? 'bg-white text-black' : 'hover:bg-white/5 text-white/90'}`}
                >
                  {m === 'market_cap' ? 'Market Cap' : m.charAt(0).toUpperCase() + m.slice(1)}
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
            <div className="text-[10px] font-medium text-[#6b7280] tracking-[1px] mr-2">QUICK FILTERS</div>
            {[
              { label: 'Big Gainers', key: 'gainers' },
              { label: 'Big Losers', key: 'losers' },
              { label: 'High Volume', key: 'volume' },
              { label: 'Favorites', key: 'favorites' },
              { label: 'Clear', key: null },
            ].map(f => (
              <button
                key={f.key || 'clear'}
                onClick={() => {
                  setActivePreset(f.key)
                  setCurrentPage(0)
                }}
                className={`filter-chip px-4 py-1.5 text-xs rounded-3xl border font-medium ${
                  activePreset === f.key 
                    ? 'bg-white text-black border-white shadow-sm' 
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-white/80 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Page Tabs - Show again every 100 coins for the first 500 coins */}
          <div className="flex items-center gap-x-1.5 flex-wrap mt-2">
            <div className="text-[10px] font-medium text-[#6b7280] tracking-[1px] mr-2">PAGES (500 coins)</div>
            {Array.from({ length: totalPages }).map((_, index) => {
              const start = index * 100
              const end = Math.min(start + 100, filteredTokens.length)
              return (
                <button
                  key={index}
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

      {/* Main Area: Full immersive Visualization */}
      <div className="flex-1 relative overflow-hidden bg-black">
        <Visualization 
          tokens={currentPageTokens} 
          selectedId={selectedId} 
          onSelect={handleSelect}
          favorites={favorites}
          highlightUntil={highlightUntil}
          sizeMetric={sizeMetric}
          paused={physicsPaused}
          onTogglePaused={() => setPhysicsPaused(!physicsPaused)}
        />

        {/* Details Panel - Opens automatically when you select a planet (slide-in from right) */}
        {selectedCoin && (
          <div className="absolute top-4 right-4 z-50 w-80 rounded-3xl border border-[#25252f] bg-[#111118]/95 backdrop-blur-2xl shadow-2xl overflow-hidden transition-all duration-200">
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
                <button 
                  onClick={() => toggleFavorite(selectedCoin.id)}
                  className="text-3xl leading-none transition-transform active:scale-90 ml-2"
                  title={favorites.includes(selectedCoin.id) ? "Remove from favorites" : "Add to favorites"}
                >
                  {favorites.includes(selectedCoin.id) ? <span className="text-amber-400">★</span> : <span className="text-white/40">☆</span>}
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-baseline">
                  <span className="text-[#6b7280]">Price</span>
                  <span className="font-semibold tabular-nums text-2xl tracking-tighter">
                    ${selectedCoin.current_price?.toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between items-baseline">
                  <span className="text-[#6b7280]">24h Change</span>
                  <span className={`font-semibold ${(selectedCoin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(selectedCoin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(selectedCoin.price_change_percentage_24h || 0).toFixed(2)}%
                  </span>
                </div>

                {selectedCoin.market_cap && (
                  <div className="flex justify-between items-baseline pt-2 border-t border-white/10">
                    <span className="text-[#6b7280]">Market Cap</span>
                    <span className="font-medium">${(selectedCoin.market_cap / 1e9).toFixed(2)}B</span>
                  </div>
                )}

                {selectedCoin.total_volume && (
                  <div className="flex justify-between items-baseline">
                    <span className="text-[#6b7280]">24h Volume</span>
                    <span className="font-medium">${(selectedCoin.total_volume / 1e9).toFixed(2)}B</span>
                  </div>
                )}
              </div>
            </div>

            <div className="px-5 py-3 bg-black/40 border-t border-[#25252f] text-[10px] text-[#6b7280]">
              Click the star to favorite • Drag the planet to fling it
            </div>
          </div>
        )}
      </div>

      {/* Bottom Market Tab — Tap to open the beautiful slide-up drawer */}
      <div className="border-t border-[#25252f] bg-[#111118]/95 backdrop-blur-xl flex-shrink-0 z-40">
        <button
          onClick={() => setIsMarketOpen(!isMarketOpen)}
          className={`w-full flex items-center justify-between px-5 py-3 text-sm font-medium transition-all active:bg-white/10 ${isMarketOpen ? 'bg-white/5' : 'hover:bg-white/5'}`}
        >
          <div className="flex items-center gap-x-3">
            <span className="text-[#67f6ff] text-base">📋</span>
            <span className="font-semibold tracking-[-0.3px]">Market Table</span>
            <span className="text-[#6b7280] text-[10px] px-2.5 py-px rounded-full bg-white/5 border border-white/10 tabular-nums">
              {filteredTokens.length}
            </span>
          </div>

          <div className="flex items-center gap-x-2 text-[#6b7280] text-xs">
            <span className="hidden sm:inline">Page {currentPage + 1}</span>
            <span className={`transition-transform duration-200 ${isMarketOpen ? 'rotate-180' : ''} text-[10px]`}>▼</span>
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

          {/* Market Table Content (inside drawer) */}
          <div className="flex-1 overflow-auto px-5 pt-3 pb-6 text-sm custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
            {/* Page tabs inside drawer */}
            <div className="flex items-center gap-x-1.5 flex-wrap mb-3">
              {Array.from({ length: totalPages }).map((_, index) => {
                const start = index * 100
                const end = Math.min(start + 100, filteredTokens.length)
                return (
                  <button
                    key={index}
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
                      ${coin.current_price?.toLocaleString()}
                    </td>
                    <td className={`py-2.5 text-right font-medium ${(coin.price_change_percentage_24h||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(coin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(coin.price_change_percentage_24h || 0).toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right hidden md:table-cell text-[#9ca3af] tabular-nums">
                      {coin.total_volume ? '$' + (coin.total_volume / 1e6).toFixed(0) + 'M' : '—'}
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
          Loading 500 coins from CoinGecko...
        </div>
      )}
    </div>
  )
}

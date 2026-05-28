import React, { useState } from 'react'
import { Visualization } from './components/Visualization'
import { usePrices } from './lib/prices'
import { TrendingUp, Zap, ExternalLink } from 'lucide-react'

export default function App() {
  const { tokens, isLoading, error } = usePrices()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<'1h' | '24h' | '7d' | '30d'>('24h')
  const [sizeMetric, setSizeMetric] = useState<'market_cap' | 'volume' | 'price'>('market_cap')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [highlightUntil, setHighlightUntil] = useState(0)
  const [physicsPaused, setPhysicsPaused] = useState(false)
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
            {/* Logo - more premium */}
            <div className="flex items-center gap-x-3 group">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-500 via-amber-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-orange-500/20 group-hover:shadow-orange-500/40 transition-shadow">
                <span className="text-black font-bold text-base tracking-tighter">CD</span>
              </div>
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

            {/* Beautiful external links */}
            <a 
              href="https://app.provex.com" 
              target="_blank" 
              className="premium-button flex items-center gap-x-2 px-4 h-9 rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 hover:from-orange-500/20 hover:to-amber-500/20 border border-orange-500/20 text-orange-400"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden md:inline font-medium">ProveX</span>
            </a>

            <a 
              href="https://libertyswap.finance" 
              target="_blank" 
              className="premium-button flex items-center gap-x-2 px-4 h-9 rounded-2xl bg-gradient-to-r from-cyan-500/10 to-teal-500/10 hover:from-cyan-500/20 hover:to-teal-500/20 border border-cyan-500/20 text-cyan-400"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden md:inline font-medium">LibertySwap</span>
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
              <div className="px-3 text-xs font-medium text-[#6b7280] tracking-widest">TIMEFRAME</div>
              {(['1h','24h','7d','30d'] as const).map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-5 py-1.5 rounded-2xl text-sm font-medium ${timeframe === tf ? 'bg-white text-black' : 'hover:bg-white/5 text-white/90'}`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

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

          {/* Page Tabs - Elegant and interesting */}
          <div className="flex items-center gap-x-1.5 flex-wrap mt-1">
            <div className="text-[10px] font-medium text-[#6b7280] tracking-[1px] mr-2">PAGES</div>
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

      {/* Main Area: Visualization + Sidebar */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Visualization Area */}
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
        </div>

        {/* Right Sidebar - Premium details panel */}
        <div className="w-80 border-l border-[#25252f] bg-[#111118] flex flex-col overflow-hidden flex-shrink-0 detail-panel">
          <div className="px-5 pt-5 pb-4 border-b border-[#25252f] flex items-center justify-between">
            <div className="font-semibold tracking-tight">DETAILS</div>
            {selectedCoin && (
              <button 
                onClick={() => setSelectedId(null)} 
                className="text-xs px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-[#6b7280] hover:text-white transition-colors"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-5 text-sm">
            {selectedCoin ? (
              <div>
                <div className="flex items-center gap-3 mb-5">
                  {selectedCoin.image && (
                    <img src={selectedCoin.image} alt="" className="w-11 h-11 rounded-full ring-1 ring-white/10" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-xl tracking-tight">{selectedCoin.symbol}</div>
                    <div className="text-sm text-[#9ca3af] truncate">{selectedCoin.name}</div>
                  </div>
                  <button 
                    onClick={() => toggleFavorite(selectedCoin.id)}
                    className="text-2xl leading-none transition-transform active:scale-90"
                    title={favorites.includes(selectedCoin.id) ? "Remove from favorites" : "Add to favorites"}
                  >
                    {favorites.includes(selectedCoin.id) ? <span className="text-amber-400">★</span> : <span className="text-white/40">☆</span>}
                  </button>
                </div>

                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[#6b7280]">Price</span>
                    <span className="font-semibold tabular-nums text-xl tracking-tighter">
                      ${selectedCoin.current_price?.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[#6b7280]">24h Change</span>
                    <span className={`font-medium ${(selectedCoin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(selectedCoin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(selectedCoin.price_change_percentage_24h || 0).toFixed(2)}%
                    </span>
                  </div>
                  {selectedCoin.market_cap && (
                    <div className="flex justify-between items-baseline pt-1 border-t border-white/10">
                      <span className="text-[#6b7280]">Market Cap</span>
                      <span className="font-medium">${(selectedCoin.market_cap / 1e9).toFixed(2)}B</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#6b7280]">
                <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center mb-4">
                  <span className="text-2xl opacity-50">◎</span>
                </div>
                <div className="font-medium text-white/80">Select a planet</div>
                <div className="text-xs mt-1 max-w-[180px]">Click any bubble in the visualization to inspect details</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Market Table - Beautiful & interesting */}
      <div className="border-t border-[#25252f] h-52 bg-[#111118] flex-shrink-0 overflow-auto text-sm">
        <div className="px-5 pt-3">
          <div className="flex justify-between items-baseline mb-2 px-1">
            <div className="font-semibold tracking-tight">Market Table — Page {currentPage + 1} ({currentPageTokens.length} coins)</div>
            <div className="text-[10px] text-[#6b7280]">Click any row or planet to select</div>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#6b7280] border-b border-[#25252f]">
                <th className="text-left pb-2 font-normal">Coin</th>
                <th className="text-right pb-2 font-normal">Price</th>
                <th className="text-right pb-2 font-normal">24h %</th>
                <th className="text-right pb-2 font-normal hidden md:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody>
              {currentPageTokens.slice(0, 14).map(coin => (
                <tr 
                  key={coin.id} 
                  onClick={() => handleSelect(coin.id)}
                  className={`market-row cursor-pointer ${selectedId === coin.id ? 'selected' : ''}`}
                >
                  <td className="py-2 font-medium text-white/90">{coin.symbol}</td>
                  <td className="py-2 text-right font-medium tabular-nums text-white/90">${coin.current_price?.toLocaleString()}</td>
                  <td className={`py-2 text-right font-medium ${(coin.price_change_percentage_24h||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(coin.price_change_percentage_24h || 0) > 0 ? '+' : ''}{(coin.price_change_percentage_24h || 0).toFixed(1)}%
                  </td>
                  <td className="py-2 text-right hidden md:table-cell text-[#9ca3af] tabular-nums">
                    {coin.total_volume ? '$' + (coin.total_volume / 1e6).toFixed(0) + 'M' : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Error / Loading */}
      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-1.5 rounded-2xl">
          Price data issue — using cached values
        </div>
      )}
      {isLoading && tokens.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a12]/80 text-sm">
          Loading 1000 coins from CoinGecko...
        </div>
      )}
    </div>
  )
}

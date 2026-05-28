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
  }, [tokens, activePreset, searchTerm])

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
      {/* Top Navigation - similar to old version */}
      <nav className="border-b border-[#25252f] bg-[#0a0a12] z-50 flex-shrink-0">
        <div className="w-full px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-x-4">
            {/* Logo */}
            <div className="flex items-center gap-x-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
                <span className="text-black font-bold text-sm">CD</span>
              </div>
              <div>
                <span className="font-semibold tracking-tighter text-2xl">Crypto</span>
                <span className="font-semibold tracking-tighter text-2xl text-orange-400">DUST</span>
              </div>
            </div>
            <div className="px-3 py-1 rounded-full bg-white/5 text-xs flex items-center gap-x-1.5 border border-white/10">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
              <span className="text-emerald-400 text-xs font-medium">LIVE</span>
            </div>
          </div>

          <div className="flex items-center gap-x-3 text-sm">
            {/* Search - old feature restored */}
            <input
              type="text"
              placeholder="Search coins..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(0) // reset page when searching
              }}
              className="bg-[#0b0b12] border border-[#25252f] rounded-2xl px-4 py-1.5 text-sm w-64 focus:outline-none focus:border-[#67f6ff]"
            />

            <button onClick={() => window.location.reload()} className="flex items-center gap-x-2 px-4 h-9 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer transition-colors">
              <TrendingUp className="w-4 h-4" />
              <span className="font-medium">Refresh</span>
            </button>

            <a 
              href="https://app.provex.com" 
              target="_blank" 
              className="flex items-center gap-x-2 px-4 h-9 rounded-2xl bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 text-orange-400 transition-all active:scale-95"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden md:inline font-medium">ProveX</span>
            </a>

            <a 
              href="https://libertyswap.finance" 
              target="_blank" 
              className="flex items-center gap-x-2 px-4 h-9 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 transition-all active:scale-95"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden md:inline font-medium">LibertySwap</span>
            </a>

            {/* Export options - like the old beautiful version */}
            <div className="flex items-center gap-x-1 ml-2">
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
                className="px-3 py-1.5 text-xs rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
                title="Download beautiful PNG screenshot"
              >
                ⬇ Export
              </button>
              <button 
                onClick={async () => {
                  const canvas = document.querySelector('canvas') as HTMLCanvasElement
                  if (canvas) {
                    canvas.toBlob(async (blob) => {
                      if (blob) {
                        try {
                          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                          alert('Screenshot copied to clipboard!')
                        } catch {
                          alert('Copy failed. Use Export button instead.')
                        }
                      }
                    })
                  }
                }}
                className="px-3 py-1.5 text-xs rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
                title="Copy screenshot to clipboard"
              >
                📋
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Global Market Stats - like before */}
      <div className="border-b border-[#25252f] bg-[#0a0a12] flex-shrink-0">
        <div className="w-full px-4 py-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-[#6b7280] text-xs mb-0.5">TOTAL MARKET CAP</div>
              <div className="font-semibold tabular-nums text-lg">
                ${(filteredTokens.reduce((sum, t) => sum + (t.market_cap || 0), 0) / 1e12).toFixed(2)}T
              </div>
            </div>
            <div>
              <div className="text-[#6b7280] text-xs mb-0.5">24H VOLUME</div>
              <div className="font-semibold tabular-nums text-lg">
                ${(filteredTokens.reduce((sum, t) => sum + (t.total_volume || 0), 0) / 1e9).toFixed(1)}B
              </div>
            </div>
            <div>
              <div className="text-[#6b7280] text-xs mb-0.5">BTC DOMINANCE</div>
              <div className="font-semibold tabular-nums text-lg">~52%</div>
            </div>
            <div>
              <div className="text-[#6b7280] text-xs mb-0.5">COINS SHOWN</div>
              <div className="font-semibold tabular-nums text-lg">{filteredTokens.length} / 500</div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls + Quick Filters */}
      <div className="border-b border-[#25252f] bg-[#111118] flex-shrink-0">
        <div className="w-full px-4 py-3">
          {/* Timeframe & Metrics */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
            <div className="flex items-center bg-[#0b0b12] rounded-3xl p-1 border border-[#25252f]">
              <div className="px-3 text-xs font-medium text-[#6b7280]">TIMEFRAME</div>
              {(['1h','24h','7d','30d'] as const).map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-4 py-1 rounded-3xl text-sm ${timeframe === tf ? 'bg-white/10 text-white' : 'hover:bg-white/5'}`}
                >
                  {tf.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-[#0b0b12] rounded-3xl p-1 border border-[#25252f]">
              <div className="px-3 text-xs font-medium text-[#6b7280]">SIZE</div>
              {(['market_cap','volume','price'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSizeMetric(m)}
                  className={`px-3 py-1 rounded-3xl text-sm ${sizeMetric === m ? 'bg-white/10' : 'hover:bg-white/5'}`}
                >
                  {m === 'market_cap' ? 'MCap' : m === 'volume' ? 'Volume' : 'Price'}
                </button>
              ))}
            </div>

            <button
              onClick={highlightBigMovers}
              className={`px-4 py-2 text-sm rounded-2xl flex items-center gap-x-2 transition-all border ${
                highlightUntil > Date.now() 
                  ? 'bg-orange-500 text-white border-orange-400 shadow-lg' 
                  : 'bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 border-orange-500/20'
              }`}
            >
              <Zap className="w-4 h-4" /> 
              {highlightUntil > Date.now() ? 'Highlighting...' : 'Highlight Big Movers'}
            </button>
          </div>

          {/* Quick Filters - like before */}
          <div className="flex items-center gap-x-2 flex-wrap mb-3">
            <div className="text-xs font-medium text-[#6b7280] mr-2">QUICK FILTERS</div>
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
                className={`px-3 py-1 text-xs rounded-2xl border transition-colors ${
                  activePreset === f.key 
                    ? 'bg-[#67f6ff] text-[#0b0b12] border-[#67f6ff]' 
                    : 'bg-white/5 hover:bg-white/10 border-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Page Tabs - 100 coins per page, 500 total */}
          <div className="flex items-center gap-x-1.5 flex-wrap">
            <div className="text-xs font-medium text-[#6b7280] mr-2">PAGES</div>
            {Array.from({ length: totalPages }).map((_, index) => {
              const start = index * 100
              const end = Math.min(start + 100, filteredTokens.length)
              return (
                <button
                  key={index}
                  onClick={() => setCurrentPage(index)}
                  className={`px-3 py-1 text-xs rounded-2xl border transition-colors ${
                    currentPage === index
                      ? 'bg-[#67f6ff] text-[#0b0b12] border-[#67f6ff]'
                      : 'bg-white/5 hover:bg-white/10 border-white/10'
                  }`}
                >
                  {start}-{end}
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
          />
        </div>

        {/* Right Sidebar - Details (like before) */}
        <div className="w-80 border-l border-[#25252f] bg-[#111118] flex flex-col overflow-hidden flex-shrink-0">
          <div className="px-4 pt-4 pb-3 border-b border-[#25252f] flex items-center justify-between">
            <div className="font-semibold text-sm">DETAILS</div>
            {selectedCoin && (
              <button onClick={() => setSelectedId(null)} className="text-xs text-[#6b7280] hover:text-white">Clear</button>
            )}
          </div>

          <div className="flex-1 overflow-auto p-4">
            {selectedCoin ? (
              <div>
                <div className="flex items-center gap-3 mb-4">
                  {selectedCoin.image && <img src={selectedCoin.image} alt="" className="w-10 h-10 rounded-full" />}
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{selectedCoin.symbol}</div>
                    <div className="text-sm text-[#9ca3af]">{selectedCoin.name}</div>
                  </div>
                  <button 
                    onClick={() => toggleFavorite(selectedCoin.id)}
                    className="text-xl"
                  >
                    {favorites.includes(selectedCoin.id) ? '★' : '☆'}
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[#6b7280]">Price</span>
                    <span className="font-medium tabular-nums">${selectedCoin.current_price?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6b7280]">24h Change</span>
                    <span className={(selectedCoin.price_change_percentage_24h || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {selectedCoin.price_change_percentage_24h?.toFixed(2)}%
                    </span>
                  </div>
                  {selectedCoin.market_cap && (
                    <div className="flex justify-between">
                      <span className="text-[#6b7280]">Market Cap</span>
                      <span>${(selectedCoin.market_cap / 1e9).toFixed(2)}B</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-[#6b7280]">
                <div className="text-4xl mb-3 opacity-40">📈</div>
                <div className="font-medium">Select a bubble</div>
                <div className="text-xs mt-1">Click any planet to see details</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Market Table - simplified version */}
      <div className="border-t border-[#25252f] h-52 bg-[#111118] flex-shrink-0 overflow-auto">
        <div className="px-4 pt-2">
          <div className="flex justify-between items-center mb-2 text-sm">
            <div className="font-semibold">Market Table (Page {currentPage + 1} • {currentPageTokens.length} coins)</div>
            <div className="text-xs text-[#6b7280]">Click planets above to select</div>
          </div>

          <table className="w-full text-xs">
            <thead className="text-[#6b7280] border-b border-[#25252f]">
              <tr>
                <th className="text-left py-1">Coin</th>
                <th className="text-right py-1">Price</th>
                <th className="text-right py-1">24h %</th>
                <th className="text-right py-1 hidden md:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#25252f]">
              {currentPageTokens.slice(0, 12).map(coin => (
                <tr 
                  key={coin.id} 
                  onClick={() => handleSelect(coin.id)}
                  className="hover:bg-white/5 cursor-pointer"
                >
                  <td className="py-1.5 font-medium">{coin.symbol}</td>
                  <td className="py-1.5 text-right tabular-nums">${coin.current_price?.toLocaleString()}</td>
                  <td className={`py-1.5 text-right ${(coin.price_change_percentage_24h||0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {coin.price_change_percentage_24h?.toFixed(1)}%
                  </td>
                  <td className="py-1.5 text-right hidden md:table-cell tabular-nums text-[#9ca3af]">
                    {coin.total_volume ? '$' + (coin.total_volume / 1e6).toFixed(0) + 'M' : '-'}
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

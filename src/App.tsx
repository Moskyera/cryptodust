import React from 'react'
import { Visualization } from './components/Visualization'
import { useHybridPrices } from './lib/prices'
import { TrendingUp, Zap } from 'lucide-react'

export default function App() {
  const { tokens, isLoading, error, missingMoralisKey } = useHybridPrices()

  return (
    <div className="h-screen w-screen bg-[#0a0a12] text-white overflow-hidden flex flex-col">
      {/* Minimal Full-Width Header */}
      <header className="h-14 border-b border-[#25252f] bg-[#0a0a12]/95 backdrop-blur-xl z-50 flex items-center px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-amber-400 flex items-center justify-center">
              <span className="text-black font-bold text-sm">CD</span>
            </div>
            <div>
              <span className="font-semibold tracking-tighter text-2xl">Crypto</span>
              <span className="font-semibold tracking-tighter text-2xl text-orange-400">DUST</span>
            </div>
          </div>
          <div className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-[#6b7280] font-mono">LIVE</div>
        </div>

        <div className="flex-1" />

        {/* Status */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 text-emerald-400">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-xs font-medium">HYBRID PRICING</span>
          </div>

          <div className="text-xs text-[#6b7280]">
            {tokens.length} tokens • Top 300 via Moralis (70s) • Rest via CoinGecko (5m)
          </div>

          {isLoading && (
            <div className="text-xs text-amber-400 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Updating prices...
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button 
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-xl bg-white/5 hover:bg-white/10 border border-white/10"
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Refresh All
        </button>
      </header>

      {/* FULL-SCREEN VISUALIZATION - Takes 100% of remaining space */}
      <div className="flex-1 relative w-full h-full overflow-hidden">
        <Visualization tokens={tokens} />
      </div>

      {/* Helpful banners */}
      {missingMoralisKey && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs px-4 py-2 rounded-2xl max-w-md text-center">
          Add your <strong>VITE_MORALIS_API_KEY</strong> in Vercel environment variables for real-time top 300 prices.
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs px-4 py-1.5 rounded-2xl">
          Price feed degraded — using cached data
        </div>
      )}
    </div>
  )
}

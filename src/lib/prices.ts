/**
 * Price Service for CryptoDUST (CoinGecko only)
 *
 * Fetches the top ~1000 cryptocurrencies from CoinGecko using pagination.
 * Uses SWR for caching and automatic background refreshing (every 5 minutes).
 */

import useSWR from 'swr'

// ==================== CONFIG ====================
const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY || ''
const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

// ==================== TYPES ====================
export interface TokenPrice {
  id: string
  symbol: string
  name: string
  current_price: number
  price_change_percentage_24h: number
  market_cap?: number
  total_volume?: number
  image?: string
}

// ==================== COINGECKO FETCH ====================
async function fetchCoinGeckoPage(page: number, perPage = 250): Promise<TokenPrice[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`

  try {
    const headers: HeadersInit = {}

    if (COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_API_KEY
    }

    const res = await fetch(url, { headers })

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`)
    }

    const data = await res.json()

    return data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      current_price: coin.current_price || 0,
      price_change_percentage_24h: coin.price_change_percentage_24h || 0,
      market_cap: coin.market_cap,
      total_volume: coin.total_volume,
      image: coin.image,
    }))
  } catch (error) {
    console.warn(`CoinGecko page ${page} fetch failed:`, error)
    return []
  }
}

// Fetch top 1000 coins (4 pages of 250)
async function fetchAllCoins(): Promise<TokenPrice[]> {
  try {
    const pages = await Promise.all([
      fetchCoinGeckoPage(1),
      fetchCoinGeckoPage(2),
      fetchCoinGeckoPage(3),
      fetchCoinGeckoPage(4),
    ])

    // Combine and limit to 1000
    return pages.flat().slice(0, 1000)
  } catch (error) {
    console.error('Failed to fetch coins from CoinGecko', error)
    return []
  }
}

// ==================== MAIN HOOK ====================
export function usePrices() {
  const { data: tokens = [], error, isLoading } = useSWR(
    'coingecko-prices',
    fetchAllCoins,
    {
      refreshInterval: REFRESH_INTERVAL,
      revalidateOnFocus: false,
      dedupingInterval: 60000, // avoid refetching too often
    }
  )

  return {
    tokens,
    isLoading,
    error,
    lastUpdated: Date.now(),
  }
}

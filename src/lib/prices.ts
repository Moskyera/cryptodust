/**
 * Hybrid Price Service for CryptoDUST
 * 
 * - Top 300 tokens: Moralis batch API (fast, refreshed every 70s)
 * - Remaining tokens (301-1000): CoinGecko (refreshed every 5 minutes)
 * 
 * Uses SWR for intelligent caching and background revalidation.
 */

import useSWR from 'swr'

// ==================== CONFIG (use environment variables on Vercel) ====================
const MORALIS_API_KEY = import.meta.env.VITE_MORALIS_API_KEY || ''
const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY || ''

const TOP_COUNT = 300
const TOTAL_TOKENS = 1000

const MORALIS_REFRESH = 70 * 1000          // 70 seconds
const COINGECKO_REFRESH = 5 * 60 * 1000    // 5 minutes

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
  isTop300?: boolean
}

interface MoralisPriceResponse {
  [address: string]: {
    usdPrice: number
    usdPrice24hrPercentChange?: number
    // ... other fields
  }
}

// ==================== MORALIS BATCH FETCH (Top 300) ====================
async function fetchMoralisPrices(addresses: string[]): Promise<TokenPrice[]> {
  if (!addresses.length) return []

  // Moralis getMultipleTokenPrices endpoint (EVM example - adjust chain if needed)
  // For production you would map coin IDs to contract addresses.
  // Here we use a simplified approach: we expect the caller to provide addresses.
  const url = `https://deep-index.moralis.io/api/v2.2/erc20/prices`

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'X-API-Key': MORALIS_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        tokens: addresses.map(addr => ({
          token_address: addr,
          chain: 'eth', // or 'bsc', 'polygon', etc. Adjust as needed
        })),
      }),
    })

    if (!response.ok) {
      console.warn('Moralis batch price fetch failed:', response.status)
      return []
    }

    const data: MoralisPriceResponse = await response.json()

    // Convert response to our TokenPrice shape (you will need to enrich with symbol/name)
    return Object.entries(data).map(([address, priceData], index) => ({
      id: address,
      symbol: `T${index}`, // placeholder - real implementation should map address → symbol
      name: `Token ${index}`,
      current_price: priceData.usdPrice || 0,
      price_change_percentage_24h: priceData.usdPrice24hrPercentChange || 0,
      isTop300: true,
    }))
  } catch (error) {
    console.error('Moralis fetch error:', error)
    return []
  }
}

// ==================== COINGECKO FETCH (301-1000) ====================
async function fetchCoinGeckoPrices(page: number = 2, perPage: number = 250): Promise<TokenPrice[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=24h`

  try {
    const res = await fetch(url, {
      headers: COINGECKO_API_KEY !== 'COINGECKO_API_KEY' 
        ? { 'x-cg-demo-api-key': COINGECKO_API_KEY } 
        : {},
    })

    if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`)

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
      isTop300: false,
    }))
  } catch (error) {
    console.warn('CoinGecko fetch failed, using fallback', error)
    return []
  }
}

// ==================== HYBRID HOOK ====================
export function useHybridPrices() {
  const hasMoralisKey = !!MORALIS_API_KEY;

  // Top 300 via Moralis (very frequent refresh)
  const { data: top300 = [], error: moralisError, isLoading: loadingTop } = useSWR(
    hasMoralisKey ? 'moralis-top300' : null,
    () => fetchMoralisPrices([]), // ← TODO: Map top 300 coins to real contract addresses
    {
      refreshInterval: MORALIS_REFRESH,
      revalidateOnFocus: false,
      dedupingInterval: 30000,
    }
  )

  // Remaining 700 via CoinGecko (slower refresh)
  const { data: rest = [], error: cgError, isLoading: loadingRest } = useSWR(
    'coingecko-rest',
    async () => {
      // Fetch pages 2-4 (roughly 301-1000)
      const pages = await Promise.all([
        fetchCoinGeckoPrices(2),
        fetchCoinGeckoPrices(3),
        fetchCoinGeckoPrices(4),
      ])
      return pages.flat().slice(0, 700)
    },
    {
      refreshInterval: COINGECKO_REFRESH,
      revalidateOnFocus: false,
      dedupingInterval: 120000,
    }
  )

  const allTokens: TokenPrice[] = [...top300, ...rest]

  return {
    tokens: allTokens,
    top300,
    rest,
    isLoading: loadingTop || loadingRest,
    error: moralisError || cgError,
    lastUpdated: Date.now(),
    missingMoralisKey: !hasMoralisKey,
  }
}

// Helper to get a stable list of 1000 tokens (you can expand this)
export async function getInitialTokenList(): Promise<{ id: string; symbol: string }[]> {
  // In production, maintain a static list or fetch once from CoinGecko /tokens
  return Array.from({ length: TOTAL_TOKENS }, (_, i) => ({
    id: `token-${i}`,
    symbol: `TK${i}`,
  }))
}

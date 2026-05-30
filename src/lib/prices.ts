/**
 * Price Service for CryptoDUST
 *
 * - Normal coins (top ~500) → CoinGecko (use VITE_COINGECKO_API_KEY)
 * - PulseChain ecosystem tokens → CoinGecko Demo/Free (use VITE_COINGECKO_PULSE_DEMO_KEY)
 *   Now using the official "pulsechain-ecosystem" category for best coverage + logos
 *   https://www.coingecko.com/en/categories/pulsechain-ecosystem
 *
 * Recommended:
 * - Put your main/paid CoinGecko key in VITE_COINGECKO_API_KEY
 * - Put a free/demo CoinGecko key in VITE_COINGECKO_PULSE_DEMO_KEY (this isolates rate limits)
 */

import useSWR from 'swr'

// ==================== CONFIG ====================
// Main CoinGecko key (can be paid or demo)
const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY || ''

// Dedicated key for PulseChain tokens (recommended to use a free/demo key here
// so you don't burn quota on the main list). Falls back to the main key if not set.
const COINGECKO_PULSE_DEMO_KEY = import.meta.env.VITE_COINGECKO_PULSE_DEMO_KEY || COINGECKO_API_KEY

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

// ==================== TYPES ====================
export interface TokenPrice {
  id: string
  symbol: string
  name: string
  current_price: number
  price_change_percentage_24h: number
  price_change_percentage_1h?: number
  market_cap?: number
  total_volume?: number
  image?: string
}

// ==================== COINGECKO FETCH ====================
async function fetchCoinGeckoPage(page: number, perPage = 250): Promise<TokenPrice[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=1h,24h`

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
      price_change_percentage_1h: coin.price_change_percentage_1h || 0,
      market_cap: coin.market_cap,
      total_volume: coin.total_volume,
      image: coin.image,
    }))
  } catch (error) {
    console.warn(`CoinGecko page ${page} fetch failed:`, error)
    return []
  }
}

// Special PulseChain tokens we still want to ensure are included
// (especially native PLS which may not always rank high in the category)
const SPECIAL_PULSECHAIN_IDS = [
  'pulsechain',           // PLS
  'hex-pulsechain',       // pHEX / eHEX on PulseChain
  'pulsex',               // PLSX
  'incentive',            // INC
  'pcock'                 // PCOCK
]

async function fetchSpecialPulseChainTokens(): Promise<TokenPrice[]> {
  if (SPECIAL_PULSECHAIN_IDS.length === 0) return []

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${SPECIAL_PULSECHAIN_IDS.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h`
    const res = await fetch(url)
    if (!res.ok) return []

    const data = await res.json()
    return data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      current_price: coin.current_price || 0,
      price_change_percentage_24h: coin.price_change_percentage_24h || 0,
      price_change_percentage_1h: coin.price_change_percentage_1h || 0,
      market_cap: coin.market_cap,
      total_volume: coin.total_volume,
      image: coin.image,
    }))
  } catch {
    return []
  }
}

// =====================================================
// PULSECHAIN ECOSYSTEM via CoinGecko Category
// Using the official "pulsechain-ecosystem" category
// This is much more efficient and provides better logos + stats
// Source: https://www.coingecko.com/en/categories/pulsechain-ecosystem
// =====================================================

async function fetchPulseChainEcosystemTokens(): Promise<TokenPrice[]> {
  console.log('[CryptoDUST] Fetching PulseChain Ecosystem tokens via CoinGecko category...');

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=pulsechain-ecosystem&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h`;

    const headers: HeadersInit = {};
    if (COINGECKO_PULSE_DEMO_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_PULSE_DEMO_KEY;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[CoinGecko Pulse] Rate limit hit on category endpoint.');
      } else {
        console.warn(`[CoinGecko Pulse] Category fetch failed: ${res.status}`);
      }
      return [];
    }

    const data = await res.json();

    const tokens = data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      current_price: coin.current_price || 0,
      price_change_percentage_24h: coin.price_change_percentage_24h || 0,
      price_change_percentage_1h: coin.price_change_percentage_1h || 0,
      market_cap: coin.market_cap,
      total_volume: coin.total_volume,
      image: coin.image,
    }));

    console.log(`[CryptoDUST] PulseChain Ecosystem category returned ${tokens.length} tokens.`);
    return tokens;

  } catch (error) {
    console.warn('[CoinGecko Pulse] Error fetching ecosystem category:', error);
    return [];
  }
}

// Fetch top 500 coins (2 pages of 250) + PulseChain Ecosystem via CoinGecko category
async function fetchAllCoins(): Promise<TokenPrice[]> {
  try {
    const [mainPages, coinGeckoSpecial] = await Promise.all([
      Promise.all([
        fetchCoinGeckoPage(1),
        fetchCoinGeckoPage(2),
      ]),
      fetchSpecialPulseChainTokens()
    ])

    let all = mainPages.flat().slice(0, 500)

    // Merge special tokens (PLS, pHEX etc.)
    const existingIds = new Set(all.map(t => t.id))
    for (const token of coinGeckoSpecial) {
      if (!existingIds.has(token.id)) {
        all.push(token)
      }
    }

    // ============================================
    // PulseChain Ecosystem via official category
    // Much better than manual contract list:
    // - Proper logos from the category
    // - Accurate market stats
    // - More coins automatically
    // Source: https://www.coingecko.com/en/categories/pulsechain-ecosystem
    // ============================================
    try {
      const pulseEcosystem = await fetchPulseChainEcosystemTokens()

      for (const token of pulseEcosystem) {
        const index = all.findIndex(t => t.id === token.id)
        if (index !== -1) {
          // Prefer richer category data when available
          all[index] = { ...all[index], ...token }
        } else {
          all.push(token)
        }
      }
    } catch (e) {
      console.warn('[CryptoDUST] PulseChain Ecosystem category fetch failed', e)
    }

    return all
  } catch (error) {
    console.error('Failed to fetch coins', error)
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

/**
 * Price Service for CryptoDUST
 *
 * - Normal coins (top ~500 + specials) → CoinGecko (use VITE_COINGECKO_API_KEY)
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

// User-requested coins to appear in the 400-500 page/tab
// Fetched directly from CoinGecko with original logos
const SPECIAL_COINS_IDS = [
  'hacash',
  'hacash-diamond'
]

// Curated list of PulseChain tokens the user specifically wants to show
// These are fetched efficiently using one ids= call (very API friendly)
const CURATED_PULSECHAIN_IDS = [
  'dai-on-pulsechain',
  'wrapped-pulse-wpls',
  'the-grays-currency',
  'pulsechain-peacock',
  'most-wanted-2',
  'liquid-loans-usdl',
  'upx',
  'zerotrust',
  'vouch',
  'emit-2',
  'pulsechain-tiger',
  'hex-dollar-coin',
  'icosa',
  'vouch-staked-pls',
  'hex-pulsechain',
  'scada',
  'pulsechain-bridged-hex-pulsechain',
  'liquid-loans',
  'just-a-pulse-guy',
  'top-hat-2',
  'wrapped-bitcoin-pulsechain',
  'unity-3',
  'coin-mafia',
  't-i-m-e-dividendimpls-finance',
  'teddy-bear',
  'doubt'
]

// Coins to explicitly exclude from PulseChain results
const PULSECHAIN_EXCLUDED_IDS = [
  'pulseium',
  'go'
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

// Fetch additional special coins requested by user (e.g. for specific pages like 400-500)
// Uses ids= for efficiency and gets original CoinGecko logos
async function fetchSpecialCoins(): Promise<TokenPrice[]> {
  if (SPECIAL_COINS_IDS.length === 0) return []

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${SPECIAL_COINS_IDS.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h`

    const headers: HeadersInit = {}
    if (COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_API_KEY
    }

    const res = await fetch(url, { headers })
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

    let tokens: TokenPrice[] = data.map((coin: any) => ({
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

    // Remove explicitly excluded coins (e.g. pulseium, go)
    tokens = tokens.filter(t => !PULSECHAIN_EXCLUDED_IDS.includes(t.id.toLowerCase()));

    console.log(`[CryptoDUST] PulseChain Ecosystem category returned ${tokens.length} tokens (after exclusions).`);
    return tokens;

  } catch (error) {
    console.warn('[CoinGecko Pulse] Error fetching ecosystem category:', error);
    return [];
  }
}

// Fetch the user's specific curated PulseChain tokens using the efficient ids= parameter
async function fetchCuratedPulseChainTokens(): Promise<TokenPrice[]> {
  if (CURATED_PULSECHAIN_IDS.length === 0) return [];

  console.log(`[CryptoDUST] Fetching ${CURATED_PULSECHAIN_IDS.length} curated PulseChain tokens...`);

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${CURATED_PULSECHAIN_IDS.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h`;

    const headers: HeadersInit = {};
    if (COINGECKO_PULSE_DEMO_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_PULSE_DEMO_KEY;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[CoinGecko Pulse] Rate limit hit while fetching curated PulseChain tokens.');
      } else {
        console.warn(`[CoinGecko Pulse] Curated list fetch failed: ${res.status}`);
      }
      return [];
    }

    const data = await res.json();

    let tokens: TokenPrice[] = data.map((coin: any) => ({
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

    // Remove explicitly excluded coins
    tokens = tokens.filter(t => !PULSECHAIN_EXCLUDED_IDS.includes(t.id.toLowerCase()));

    console.log(`[CryptoDUST] Successfully fetched ${tokens.length} curated PulseChain tokens (after exclusions).`);
    return tokens;

  } catch (error) {
    console.warn('[CoinGecko Pulse] Error fetching curated PulseChain tokens:', error);
    return [];
  }
}

// Fetch top ~500 coins (2 pages of 250) + PulseChain Ecosystem + user specials via CoinGecko. We keep a generous cap (600) so appended low-cap tokens (curated Pulse + hacash etc.) are not dropped.
async function fetchAllCoins(): Promise<TokenPrice[]> {
  try {
    const [mainPages, coinGeckoSpecial, specialCoins] = await Promise.all([
      Promise.all([
        fetchCoinGeckoPage(1),
        fetchCoinGeckoPage(2),
      ]),
      fetchSpecialPulseChainTokens(),
      fetchSpecialCoins()
    ])

    let all = mainPages.flat().slice(0, 500)

    // Merge special tokens (PLS, pHEX etc.)
    const existingIds = new Set(all.map(t => t.id))
    for (const token of coinGeckoSpecial) {
      if (!existingIds.has(token.id)) {
        all.push(token)
      }
    }

    // Remove any excluded PulseChain coins that might have slipped in
    all = all.filter(t => !PULSECHAIN_EXCLUDED_IDS.includes(t.id.toLowerCase()))

    // ============================================
    // User's Curated PulseChain tokens (highest priority)
    // These are the specific coins you requested to guarantee they appear
    // Fetched efficiently in one call using the ids= parameter
    // ============================================
    try {
      const curatedPulse = await fetchCuratedPulseChainTokens()

      for (const token of curatedPulse) {
        const index = all.findIndex(t => t.id === token.id)
        if (index !== -1) {
          all[index] = { ...all[index], ...token }
        } else {
          all.push(token)
        }
      }
    } catch (e) {
      console.warn('[CryptoDUST] Curated PulseChain fetch failed', e)
    }

    // ============================================
    // PulseChain Ecosystem via official category (broader discovery)
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

    // ============================================
    // User-requested coins for the 400-500 page/tab
    // hacash and hacash-diamond from CoinGecko (with original logos)
    // Appended at the end. The list may slightly exceed 500; the UI cap
    // will be increased to keep them visible in the last page.
    // ============================================
    const requestedIds = ['hacash', 'hacash-diamond']
    const finalExistingIds = new Set(all.map(t => t.id))

    for (const token of specialCoins) {
      if (requestedIds.includes(token.id) && !finalExistingIds.has(token.id)) {
        all.push(token)
      }
    }

    // Return a generous cap so appended low-cap specials (including the user-requested
    // hacash ones at the very end) are not dropped before the UI pagination.
    return all.slice(0, 600)
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

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
const USE_API_PROXY = import.meta.env.PROD

// ==================== TYPES ====================
export interface TokenPrice {
  id: string
  symbol: string
  name: string
  current_price: number
  price_change_percentage_24h: number
  price_change_percentage_1h?: number
  price_change_percentage_7d?: number
  price_change_percentage_30d?: number
  price_change_percentage_1y?: number
  market_cap?: number
  total_volume?: number
  image?: string
}

// ==================== COINGECKO FETCH ====================
function mapCoinGeckoCoin(coin: any): TokenPrice {
  const change24h =
    coin.price_change_percentage_24h ??
    coin.price_change_percentage_24h_in_currency ??
    0

  return {
    id: coin.id,
    symbol: coin.symbol.toUpperCase(),
    name: coin.name,
    current_price: coin.current_price ?? 0,
    price_change_percentage_24h: change24h,
    price_change_percentage_1h:
      coin.price_change_percentage_1h ?? coin.price_change_percentage_1h_in_currency,
    price_change_percentage_7d:
      coin.price_change_percentage_7d ?? coin.price_change_percentage_7d_in_currency,
    price_change_percentage_30d:
      coin.price_change_percentage_30d ?? coin.price_change_percentage_30d_in_currency,
    price_change_percentage_1y:
      coin.price_change_percentage_1y ?? coin.price_change_percentage_1y_in_currency,
    market_cap: coin.market_cap,
    total_volume: coin.total_volume,
    image: coin.image,
  }
}

function mergeTokenData(existing: TokenPrice, incoming: TokenPrice): TokenPrice {
  const merged: TokenPrice = { ...existing, ...incoming }

  // PulseChain supplemental fetches can return null/0 and must not wipe fresher main-list data.
  if (
    (incoming.price_change_percentage_24h == null || incoming.price_change_percentage_24h === 0) &&
    existing.price_change_percentage_24h != null &&
    existing.price_change_percentage_24h !== 0
  ) {
    merged.price_change_percentage_24h = existing.price_change_percentage_24h
  }

  if (
    (incoming.current_price == null || incoming.current_price === 0) &&
    existing.current_price != null &&
    existing.current_price > 0
  ) {
    merged.current_price = existing.current_price
  }

  return merged
}

async function fetchCoinGecko(
  url: string,
  options: { usePulseKey?: boolean } = {}
): Promise<Response> {
  const { usePulseKey = false } = options

  if (USE_API_PROXY) {
    const proxyUrl = `/api/coingecko?url=${encodeURIComponent(url)}&pulse=${usePulseKey ? '1' : '0'}`
    return fetch(proxyUrl)
  }

  const headers: HeadersInit = {}
  const apiKey = usePulseKey ? COINGECKO_PULSE_DEMO_KEY : COINGECKO_API_KEY

  if (apiKey) {
    headers['x-cg-demo-api-key'] = apiKey
  }

  return fetch(url, { headers })
}

async function fetchCoinGeckoPage(page: number, perPage = 250): Promise<TokenPrice[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`

  try {
    const res = await fetchCoinGecko(url)

    if (!res.ok) {
      throw new Error(`CoinGecko API error: ${res.status}`)
    }

    const data = await res.json()
    return data.map(mapCoinGeckoCoin)
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
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${SPECIAL_PULSECHAIN_IDS.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`
    const res = await fetchCoinGecko(url, { usePulseKey: true })
    if (!res.ok) return []

    const data = await res.json()
    return data.map(mapCoinGeckoCoin)
  } catch {
    return []
  }
}

// Fetch additional special coins requested by user (e.g. for specific pages like 400-500)
// Uses ids= for efficiency and gets original CoinGecko logos
async function fetchSpecialCoins(): Promise<TokenPrice[]> {
  if (SPECIAL_COINS_IDS.length === 0) return []

  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${SPECIAL_COINS_IDS.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`
    const res = await fetchCoinGecko(url)
    if (!res.ok) return []

    const data = await res.json()
    return data.map(mapCoinGeckoCoin)
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
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=pulsechain-ecosystem&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`;
    const res = await fetchCoinGecko(url, { usePulseKey: true });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[CoinGecko Pulse] Rate limit hit on category endpoint.');
      } else {
        console.warn(`[CoinGecko Pulse] Category fetch failed: ${res.status}`);
      }
      return [];
    }

    const data = await res.json();

    let tokens: TokenPrice[] = data.map(mapCoinGeckoCoin);

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
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${CURATED_PULSECHAIN_IDS.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`;
    const res = await fetchCoinGecko(url, { usePulseKey: true });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn('[CoinGecko Pulse] Rate limit hit while fetching curated PulseChain tokens.');
      } else {
        console.warn(`[CoinGecko Pulse] Curated list fetch failed: ${res.status}`);
      }
      return [];
    }

    const data = await res.json();

    let tokens: TokenPrice[] = data.map(mapCoinGeckoCoin);

    // Remove explicitly excluded coins
    tokens = tokens.filter(t => !PULSECHAIN_EXCLUDED_IDS.includes(t.id.toLowerCase()));

    console.log(`[CryptoDUST] Successfully fetched ${tokens.length} curated PulseChain tokens (after exclusions).`);
    return tokens;

  } catch (error) {
    console.warn('[CoinGecko Pulse] Error fetching curated PulseChain tokens:', error);
    return [];
  }
}

// Fetch top 500 coins (2 pages of 250) + PulseChain Ecosystem + user specials via CoinGecko. 
// HAC and HACD are inserted at positions 498-499 (end of 400-500 tab).
// Last 100 (500-600) are pure PulseChain coins only.
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
          all[index] = mergeTokenData(all[index], token)
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
          all[index] = mergeTokenData(all[index], token)
        } else {
          all.push(token)
        }
      }
    } catch (e) {
      console.warn('[CryptoDUST] PulseChain Ecosystem category fetch failed', e)
    }

    // Remove specific low-cap tokens (as requested previously)
    const toRemoveFromEnd = ['xen-crypto-pulsechain', 'pulsetrailerpark'];
    all = all.filter(t => !toRemoveFromEnd.includes(t.id));

    // ============================================
    // User-requested coins HAC and HACD placed permanently as the last two
    // of the 400-500 tab (positions 498-499).
    // The last tab (500+) will now contain only PulseChain coins.
    // ============================================
    const requestedIds = ['hacash', 'hacash-diamond']
    // Remove if they were already added earlier (e.g. from ecosystem)
    all = all.filter(t => !requestedIds.includes(t.id));

    const insertIndex = 498;
    const toInsert = specialCoins.filter(t => requestedIds.includes(t.id));
    // Insert in reverse order so hacash then hacash-diamond
    for (let i = toInsert.length - 1; i >= 0; i--) {
      all.splice(insertIndex, 0, toInsert[i]);
    }

    // Cap at 600 so last 100 are pure PulseChain.
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

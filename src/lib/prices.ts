/**
 * Price Service for CryptoDUST
 *
 * - Normal coins (top ~500) → CoinGecko (main markets)
 * - PulseChain ecosystem tokens → CoinGecko Demo/Free via /platform/pulsechain/contract/{address}
 *
 * This approach gives significantly better data quality for PulseChain tokens
 * (PLS, pHEX, PLSX, INC, PCOCK, PRVX, etc.) than the generic markets endpoint.
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

// =====================================================
// PULSECHAIN TOKENS (via CoinGecko platform/contract endpoint)
// =====================================================

// Contract addresses on PulseChain (0x171)
const PULSECHAIN_TOKENS: Record<string, string> = {
  // 'pulsechain': 'native', // Native PLS - handled differently
  'hex-pulsechain': '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', // pHEX
  'pulsex': '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',         // PLSX
  'incentive': '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d',       // INC
  'pcock': '0xc10A4Ed9b4042222d69ff0B374eddd47ed90fC1F',           // PCOCK
'ProveX': '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11', // PRVX
  'pTGC': '0x94534EeEe131840b1c0F61847c572228bdfDDE93',         // pTGC
  'MOST': '0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC',       // MOST
  'ZERØ': '0xf6703DBff070F231eEd966D33B1B6D7eF5207d26',           // ZERØ

}

// Special PulseChain tokens the user wants searchable
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
// PULSECHAIN via CoinGecko (free/demo plan)
// Using /coins/platform/pulsechain/contract/{address}
// This gives much better data for PulseChain tokens than /markets
// =====================================================

async function fetchPulseChainTokenFromCoinGecko(
  address: string,
  symbol: string
): Promise<TokenPrice | null> {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/platform/pulsechain/contract/${address}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`;

    const headers: HeadersInit = {};
    if (COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = COINGECKO_API_KEY;
    }

    const res = await fetch(url, { headers });

    if (!res.ok) {
      if (res.status === 429) {
        console.warn(`[CoinGecko Pulse] Rate limit hit while fetching ${symbol}. Using fallback data.`);
      } else {
        console.warn(`[CoinGecko Pulse] Failed to fetch ${symbol} (${address}): ${res.status}`);
      }
      return null;
    }

    const data = await res.json();
    const md = data.market_data || {};

    return {
      id: symbol.toLowerCase(),
      symbol: symbol.toUpperCase(),
      name: data.name || symbol,
      current_price: md.current_price?.usd || 0,
      price_change_percentage_24h: md.price_change_percentage_24h || 0,
      price_change_percentage_1h: md.price_change_percentage_1h || 0,
      market_cap: md.market_cap?.usd,
      total_volume: md.total_volume?.usd,
      image: data.image?.small || data.image?.thumb,
    };
  } catch (error) {
    console.warn(`[CoinGecko Pulse] Error fetching ${symbol}:`, error);
    return null;
  }
}

async function fetchPulseChainTokensFromCoinGecko(): Promise<TokenPrice[]> {
  console.log('[CryptoDUST] Fetching PulseChain tokens via CoinGecko (demo/free)...');

  const results: TokenPrice[] = [];
  let rateLimitHits = 0;

  for (const [symbol, address] of Object.entries(PULSECHAIN_TOKENS)) {
    const token = await fetchPulseChainTokenFromCoinGecko(address, symbol);
    if (token) {
      results.push(token);
      console.log(`[CoinGecko Pulse] ✅ ${symbol} → $${token.current_price}`);
    } else {
      console.log(`[CoinGecko Pulse] ❌ Failed to fetch ${symbol}`);
      rateLimitHits++;
      // If we hit rate limit multiple times, stop early to avoid wasting calls
      if (rateLimitHits >= 2) {
        console.warn('[CoinGecko Pulse] Multiple rate limit hits detected. Stopping early and using fallback data for remaining tokens.');
        break;
      }
    }

    // Respect CoinGecko demo rate limits (very important on free plan)
    await new Promise((r) => setTimeout(r, 2500)); // ~24 calls per minute max
  }

  console.log(`[CryptoDUST] CoinGecko PulseChain fetch finished. Got ${results.length} tokens.`);
  return results;
}

// Fetch top 500 coins (2 pages of 250) + important PulseChain tokens via CoinGecko
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

    // Merge CoinGecko special tokens first (fallback)
    const existingIds = new Set(all.map(t => t.id))
    for (const token of coinGeckoSpecial) {
      if (!existingIds.has(token.id)) {
        all.push(token)
      }
    }

    // ============================================
    // PulseChain tokens via CoinGecko (demo/free plan)
    // Better coverage than the limited /markets list
    // ============================================
    try {
      const coinGeckoPulse = await fetchPulseChainTokensFromCoinGecko()

      for (const token of coinGeckoPulse) {
        // Prefer CoinGecko PulseChain data over main CoinGecko list
        const index = all.findIndex(t => t.id === token.id)
        if (index !== -1) {
          all[index] = { ...all[index], ...token }
        } else {
          all.push(token)
        }
      }
    } catch (e) {
      console.warn('[CryptoDUST] CoinGecko PulseChain fetch failed', e)
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

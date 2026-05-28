/**
 * Price Service for CryptoDUST (Hybrid: CoinGecko + Moralis)
 *
 * - Normal coins → CoinGecko
 * - PulseChain tokens (PLS, pHEX, PLSX, INC, PCOCK, ...) → Moralis (much better data)
 *
 * Uses SWR for caching and automatic background refreshing (every 5 minutes).
 *
 * To enable Moralis: Set VITE_MORALIS_API_KEY in .env.local or Vercel
 */

import useSWR from 'swr'

// ==================== CONFIG ====================
const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY || ''
const MORALIS_API_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjhjZGEyNzRhLWE2ZTEtNDdhMy04NDNkLWY2N2FlMGRkMzlkYiIsIm9yZ0lkIjoiNTE3ODQzIiwidXNlcklkIjoiNTMyOTIxIiwidHlwZUlkIjoiOTk2YmExNjEtZmMxZC00Yjc3LThkODItNGM5Mjk4OGQ4YjJhIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3Nzk5MjMyMzgsImV4cCI6NDkzNTY4MzIzOH0.gHbcds9T5W_c4WgZfu59D70wEUDaxARwq63BXxTiopg
const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes

// PulseChain chain id in Moralis format
const PULSE_CHAIN = 'pulse' // or '0x171' in some endpoints

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

// =====================================================
// PULSECHAIN TOKENS - Moralis (better data than CoinGecko)
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
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${SPECIAL_PULSECHAIN_IDS.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`
    const res = await fetch(url)
    if (!res.ok) return []

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
  } catch {
    return []
  }
}

// =====================================================
// MORALIS - PulseChain only (for now)
// =====================================================

async function fetchPulseChainTokenFromMoralis(
  symbol: string,
  address: string
): Promise<TokenPrice | null> {
  if (!MORALIS_API_KEY) return null

  try {
    // Moralis v2.2 token price endpoint for PulseChain
    const url = `https://deep-index.moralis.io/api/v2.2/erc20/${address}/price?chain=${PULSE_CHAIN}`

    const res = await fetch(url, {
      headers: {
        'X-API-Key': MORALIS_API_KEY,
      },
    })

    if (!res.ok) {
      console.warn(`Moralis price failed for ${symbol}:`, res.status)
      return null
    }

    const data = await res.json()

    // Normalize to our TokenPrice format
    return {
      id: symbol.toLowerCase(),
      symbol: symbol.toUpperCase(),
      name: data.tokenName || symbol,
      current_price: data.usdPrice || 0,
      price_change_percentage_24h: data.usdPrice24hrPercentChange ?? 0,
      market_cap: undefined,           // Moralis price endpoint doesn't always return FDV
      total_volume: undefined,
      image: undefined,                // We can enhance later with token metadata
    }
  } catch (error) {
    console.warn(`Moralis fetch failed for ${symbol}:`, error)
    return null
  }
}

async function fetchPulseChainTokensMoralis(): Promise<TokenPrice[]> {
  if (!MORALIS_API_KEY) {
    return []
  }

  const results: TokenPrice[] = []

  for (const [id, address] of Object.entries(PULSECHAIN_TOKENS)) {
    const token = await fetchPulseChainTokenFromMoralis(id, address)
    if (token) {
      results.push(token)
    }
    // Small delay to be nice to rate limits
    await new Promise((r) => setTimeout(r, 150))
  }

  return results
}

// Fetch top 500 coins (2 pages of 250) + important PulseChain tokens
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
    // MORALIS - PulseChain priority (if API key exists)
    // ============================================
    if (MORALIS_API_KEY) {
      console.log('[CryptoDUST] Using Moralis for PulseChain token prices')
      try {
        const moralisPulse = await fetchPulseChainTokensMoralis()

        for (const token of moralisPulse) {
          // Replace CoinGecko data with better Moralis data for PulseChain tokens
          const index = all.findIndex(t => t.id === token.id)
          if (index !== -1) {
            all[index] = { ...all[index], ...token }
          } else {
            all.push(token)
          }
        }
      } catch (e) {
        console.warn('Moralis PulseChain fetch failed, using CoinGecko fallback')
      }
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

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
import { useEffect, useRef } from 'react'

// ==================== CONFIG ====================
// Main CoinGecko key (can be paid or demo)
const COINGECKO_API_KEY = import.meta.env.VITE_COINGECKO_API_KEY || ''

// Dedicated key for PulseChain tokens (recommended to use a free/demo key here
// so you don't burn quota on the main list). Falls back to the main key if not set.
const COINGECKO_PULSE_DEMO_KEY = import.meta.env.VITE_COINGECKO_PULSE_DEMO_KEY || COINGECKO_API_KEY

const REFRESH_INTERVAL = 5 * 60 * 1000 // 5 minutes
// Always. Dev used to call CoinGecko straight from the browser, which breaks the
// moment CoinGecko rate-limits: a 429 carries no CORS headers, so it surfaces as
// an opaque "Failed to fetch" and the whole page comes up empty. The dev server
// forwards /api to production (see vite.config.ts), so going through the proxy
// both fixes that and means dev exercises the exact path production does.
const USE_API_PROXY = true

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
  /** % distance from the all-time high (negative; -95 = 95% below ATH) */
  ath_change_percentage?: number
  ath?: number
  ath_date?: string
  high_24h?: number
  low_24h?: number

  // --- DexScreener extras, only set for PulseChain tokens (see backfillFromDexScreener) ---
  /** Fully diluted valuation. NOT a circulating market cap — must be labelled "FDV" in the UI. */
  fdv?: number
  /** Total USD liquidity in the deepest DEX pair. The honest size metric for these tokens. */
  liquidity?: number
  /** Where fdv/liquidity came from, so the UI can attribute it. */
  dexSource?: string
  /**
   * True for coins that exist only on DEXs and have no CoinGecko listing, so
   * the UI never offers a CoinGecko page that would 404.
   */
  dexOnly?: boolean
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
    // CoinGecko populates fully_diluted_valuation even for the 44 PulseChain tokens
    // whose market_cap is 0 — verified against the live category endpoint. This field
    // costs nothing: it is already in every /coins/markets payload we fetch.
    fdv: coin.fully_diluted_valuation ?? undefined,
    ath_change_percentage: coin.ath_change_percentage ?? undefined,
    ath: coin.ath ?? undefined,
    ath_date: coin.ath_date ?? undefined,
    high_24h: coin.high_24h ?? undefined,
    low_24h: coin.low_24h ?? undefined,
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

  // market_cap / total_volume had no such guard, so a supplemental fetch that returned
  // null for them silently wiped good values from the main list.
  if ((incoming.market_cap == null || incoming.market_cap === 0) && (existing.market_cap ?? 0) > 0) {
    merged.market_cap = existing.market_cap
  }

  if ((incoming.total_volume == null || incoming.total_volume === 0) && (existing.total_volume ?? 0) > 0) {
    merged.total_volume = existing.total_volume
  }

  // Same guard for the enrichment fields — a later fetch without them must not erase
  // what an earlier source already provided.
  if ((incoming.fdv == null || incoming.fdv === 0) && (existing.fdv ?? 0) > 0) {
    merged.fdv = existing.fdv
  }

  if ((incoming.liquidity == null || incoming.liquidity === 0) && (existing.liquidity ?? 0) > 0) {
    merged.liquidity = existing.liquidity
    merged.dexSource = existing.dexSource
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

  const apiKey = usePulseKey ? COINGECKO_PULSE_DEMO_KEY : COINGECKO_API_KEY

  // The key goes in the query string, not the x-cg-demo-api-key header: a custom
  // header forces a CORS preflight, and when CoinGecko rate-limits, the OPTIONS
  // response carries no CORS headers — so dev-mode 429s surfaced as opaque
  // "Failed to fetch" errors that no retry could distinguish or recover from.
  // A plain GET with a query param is a "simple request" and skips preflight.
  let finalUrl = url
  if (apiKey) {
    finalUrl += `${url.includes('?') ? '&' : '?'}x_cg_demo_api_key=${apiKey}`
  }

  return fetch(finalUrl)
}

// =====================================================
// Last-good cache: a transient failure in any one source must never shrink the
// coin list mid-session. Without this, one failed category fetch during a 5-minute
// SWR refresh dropped the PulseChain tab from ~107 coins to ~27 until the next cycle.
// =====================================================
const lastGoodResults = new Map<string, TokenPrice[]>()

async function withLastGood(
  key: string,
  fetcher: () => Promise<TokenPrice[]>
): Promise<TokenPrice[]> {
  const result = await fetcher()
  if (result.length > 0) {
    lastGoodResults.set(key, result)
    return result
  }

  const cached = lastGoodResults.get(key)
  if (cached?.length) {
    console.warn(
      `[CryptoDUST] ${key} returned nothing — reusing ${cached.length} tokens from the previous refresh.`
    )
    return cached
  }
  return result
}

/**
 * CoinGecko's free tier throttles bursts, and the PulseChain calls run last in the
 * sequence, so they were the ones that got 429'd. A single failure silently emptied
 * the whole PulseChain tab (it collapsed from ~107 coins to ~26) because every
 * catch here returns []. Retrying on 429/5xx makes the tab stable.
 */
async function fetchCoinGeckoWithRetry(
  url: string,
  options: { usePulseKey?: boolean; retries?: number; label?: string } = {}
): Promise<Response | null> {
  const { usePulseKey = false, retries = 3, label = 'request' } = options

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchCoinGecko(url, { usePulseKey })
      if (res.ok) return res

      const retryable = res.status === 429 || res.status >= 500
      if (!retryable || attempt === retries) {
        console.warn(`[CoinGecko] ${label} failed: ${res.status}`)
        return null
      }

      // 1.2s, 2.4s, 4.8s — enough to clear CoinGecko's per-minute window
      const waitMs = 1200 * Math.pow(2, attempt)
      console.warn(`[CoinGecko] ${label} got ${res.status}, retrying in ${waitMs}ms`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    } catch (error) {
      if (attempt === retries) {
        console.warn(`[CoinGecko] ${label} threw:`, error)
        return null
      }
      await new Promise(resolve => setTimeout(resolve, 1200 * Math.pow(2, attempt)))
    }
  }

  return null
}

async function fetchCoinGeckoPage(page: number, perPage = 250): Promise<TokenPrice[]> {
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${perPage}&page=${page}&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`

  // Without a retry a single transient 429 wiped all 250 coins of this page, which
  // is how the app could end up rendering ~108 coins instead of ~600.
  const res = await fetchCoinGeckoWithRetry(url, { label: `main list page ${page}` })
  if (!res) return []

  try {
    const data = await res.json()
    return data.map(mapCoinGeckoCoin)
  } catch (error) {
    console.warn(`CoinGecko page ${page} parse failed:`, error)
    return []
  }
}

// Special PulseChain tokens we still want to ensure are included
// (especially native PLS which may not always rank high in the category)
const SPECIAL_PULSECHAIN_IDS = [
  'pulsechain',              // PLS
  'hex-pulsechain',          // pHEX / eHEX on PulseChain
  'pulsex',                  // PLSX
  'pulsex-incentive-token',  // INC — 'incentive' is not a real CoinGecko id, so the
                             // old entry fetched nothing and INC only ever arrived
                             // via the ecosystem category
  'pcock'                    // PCOCK
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
    const res = await fetchCoinGeckoWithRetry(url, { usePulseKey: true, label: 'special PulseChain tokens' })
    if (!res) return []

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
    const res = await fetchCoinGeckoWithRetry(url, { label: 'HAC / HACD' })
    if (!res) return []

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
    // Fetch a good number (250) so we have plenty of Pulse coins to pick the top ~98 from
    // (sorted by market cap). The tab will show only the first 98.
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=pulsechain-ecosystem&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`;
    const res = await fetchCoinGeckoWithRetry(url, {
      usePulseKey: true,
      label: 'PulseChain ecosystem category',
    });

    if (!res) return [];

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
    const res = await fetchCoinGeckoWithRetry(url, {
      usePulseKey: true,
      label: 'curated PulseChain tokens',
    });

    if (!res) return [];

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

// =====================================================
// COINPAPRIKA — market cap / volume backfill
//
// Measured against CoinGecko on 2026-08-06:
//   - Prices and 24h volumes match CoinGecko closely (PLS: $0.000008848 vs
//     $0.00000885, volume 32,846 vs 32,881), so there is nothing to gain there.
//   - Market cap is where it wins: CoinGecko returns 0 for the biggest PulseChain
//     coins (PLS, PLSX, HEX, INC), while CoinPaprika has real values
//     ($131M / $157M / $212M / $18.6M). Those coins render as dust in the
//     "Size by: Market Cap" mode without this.
//
// So CoinPaprika is used ONLY to fill gaps, never to overwrite a value CoinGecko
// already provided, and never for price.
//
// The map is explicit on purpose. Matching by symbol looks tempting but is wrong:
// CoinPaprika's top list resolves BASE -> Base Protocol, MAGIC -> Magic (Arbitrum),
// LUCKY -> Lucky Dog, TRIO -> Trio (Ordinals), PLN -> Plearn — all different coins.
// =====================================================
const PAPRIKA_ID_MAP: Record<string, string> = {
  'pulsechain': 'pls-pulsechain',
  'pulsex': 'plsx-pulsex',
  'hex-pulsechain': 'hex-hex-from-pulsechain',
  'pulsex-incentive-token': 'inc-incentive',
  'the-grays-currency': 'ptgc-the-grays-currency',
  'wrapped-pulse-wpls': 'wpls-wrapped-pulse',
  'pulsechain-peacock': 'pcock-pulsechain-peacock',
}
// Checked and deliberately left out: Liquid Loans, Phiat, PowerCity and the Maximus
// tokens do not exist on CoinPaprika at all; Icosa, 9inch and Coin Mafia are there
// but report a market cap of 0, so they would add nothing.

interface PaprikaQuote {
  market_cap?: number
  volume_24h?: number
}

async function fetchPaprikaTicker(paprikaId: string): Promise<PaprikaQuote | null> {
  try {
    const res = await fetch(`https://api.coinpaprika.com/v1/tickers/${paprikaId}?quotes=USD`)
    if (!res.ok) return null

    const data = await res.json()
    const usd = data?.quotes?.USD
    if (!usd) return null

    return { market_cap: usd.market_cap, volume_24h: usd.volume_24h }
  } catch {
    return null
  }
}

/**
 * Fills in market cap / volume for the mapped coins that CoinGecko left empty.
 * Mutates nothing that already has a value, and never touches price.
 */
async function backfillFromCoinPaprika(tokens: TokenPrice[]): Promise<number> {
  const gaps = tokens.filter(
    t => PAPRIKA_ID_MAP[t.id] && ((t.market_cap ?? 0) <= 0 || (t.total_volume ?? 0) <= 0)
  )

  if (gaps.length === 0) return 0

  const results = await Promise.all(
    gaps.map(async token => ({ token, quote: await fetchPaprikaTicker(PAPRIKA_ID_MAP[token.id]) }))
  )

  let filled = 0
  for (const { token, quote } of results) {
    if (!quote) continue

    let touched = false
    if ((token.market_cap ?? 0) <= 0 && (quote.market_cap ?? 0) > 0) {
      token.market_cap = quote.market_cap
      touched = true
    }
    if ((token.total_volume ?? 0) <= 0 && (quote.volume_24h ?? 0) > 0) {
      token.total_volume = quote.volume_24h
      touched = true
    }
    if (touched) filled++
  }

  if (filled > 0) {
    console.log(`[CryptoDUST] CoinPaprika filled market data for ${filled} coin(s).`)
  }
  return filled
}

// =====================================================
// DEXSCREENER — FDV + liquidity for the PulseChain long tail
//
// Verified from the browser on 2026-08-06 (not from a server — CORS was the whole
// question, and api.dexscreener.com does answer a cross-origin fetch, no key needed):
//
//   - chainId "pulsechain" is covered; 33 of the 44 gap tokens resolve.
//   - The response has BOTH marketCap and fdv. For almost every PulseChain token the
//     two are identical, i.e. DexScreener has no circulating supply and is reporting a
//     FULLY DILUTED valuation. It is therefore stored as `fdv`, never as `market_cap`.
//     Concretely: DexScreener says PLSX is $1.06B; its real circulating cap is ~$157M.
//   - FDV on an illiquid token is close to meaningless: AXIS reports $359M FDV against
//     $10k of liquidity (a 35,000x ratio, versus a 45x median). Sizing bubbles by that
//     would make AXIS the second-largest planet on the tab. Liquidity is the honest
//     metric here, so it is captured too and offered as its own "Size by" option.
//
// PulseChain is an Ethereum fork, so a token address exists on BOTH chains and the
// endpoint returns pairs for both — every response MUST be filtered to chainId
// 'pulsechain' or you get the Ethereum token's numbers. This bit us with HEX.
// =====================================================

// CoinGecko id -> PulseChain contract address.
// Harvested via DexScreener search and then gated: an address was only accepted when
// the pair's USD price was within 12% of CoinGecko's price for that id. That check is
// what keeps same-symbol clones out (PulseChain has several duplicate tickers).
const PULSECHAIN_TOKEN_ADDRESSES: Record<string, string> = {
  // ProveX has no CoinGecko listing at all, so unlike every other entry here it
  // has no CoinGecko record to attach to: it is built from scratch out of
  // DexScreener data (see DEX_ONLY_PULSE_TOKENS). Address verified on-chain via
  // rpc.pulsechain.com — name "ProveX", symbol "PRVX", 18 decimals.
  'provex': '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11',                  // PRVX
  // DEV Coin, likewise absent from CoinGecko. Verified on-chain via
  // rpc.pulsechain.com: name "DEV Coin", symbol "DEVC", 18 decimals.
  'devc-pulsechain': '0xA804b9E522A2D1645a19227514CFe856Ad8C2fbC',          // DEVC
  'pulsex': '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',                  // PLSX
  'hex-pulsechain': '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',          // HEX
  'pulsex-incentive-token': '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d',  // INC
  'axis-alive': '0x8BDB63033b02C15f113De51EA1C3a96Af9e8ecb5',              // AXIS
  'texan': '0xcFCFfE432A48dB53F59c301422d2EdD77B2A88d7',                   // TEXAN
  't-i-m-e-dividend': '0xCA35638A3fdDD02fEC597D8c1681198C06b23F58',        // TIME
  '9mm': '0x7b39712Ef45F7dcED2bBDF11F3D5046bA61dA719',                     // 9MM
  'liquid-loans': '0x9159f1D2a9f51998Fc9Ab03fbd8f265ab14A1b3B',            // LOAN
  'phiat-protocol': '0x96E035ae0905EFaC8F733f133462f971Cfa45dB1',          // PHIAT
  'icosa': '0xfc4913214444aF5c715cc9F7b52655e788A569ed',                   // ICSA
  'phame': '0x8854bC985fB5725F872c8856bEA11B917cAEb2fE',                   // PHAME
  'tetra': '0xAeC4C07537B03E3E62fc066EC62401Aed5Fdd361',                   // TETRAP
  '9inch': '0x3ca80d83277e721171284667829c686527B8b3c5',                   // 9INCH
  'maximus-lucky': '0x6B0956258fF7bd7645aa35369B55B61b8e6d6140',           // LUCKY
  'pulseln': '0xa685C45fd071DF23278069Db9137e124564897D0',                 // PLN
  'hexfire': '0xf330cb1d41052dbC74D3325376Cb82E99454e501',                 // FIRE
  'coast-cst': '0x600136dA8cc6D1Ea07449514604dc4ab7098dB82',               // CST
  'powercity-earn-protocol': '0xb513038BbFdF9D40B676F41606f4F61D4b02c4A2', // EARN
  'maximus-base': '0xe9f84d418B008888A992Ff8c6D22389C2C3504e0',            // BASE
  'phux-governance-token': '0x9663c2d75ffd5F4017310405fCe61720aF45B829',   // PHUX
  'flex': '0x9c6fA17D92898B684676993828143596894AA2A6',                    // FLEX
  'maximus-trio': '0xF55cD1e399e1cc3D95303048897a680be3313308',            // TRIO
  'love-io': '0xb55EE890426341FE45EE6dc788D2D93d25B59063',                 // LOVE
  'apin-pulse': '0xBb101431d43b0E1fc31f000bf96826794806e0b4',              // APC
  'powercity-watt': '0xDfdc2836FD2E63Bba9f0eE07901aD465Bff4DE71',          // WATT
  'big-bonus-coin': '0x8b4cfb020aF9AcAd95AD80020cE8f67FBB2C700E',          // BBC
  'rhinofi-2': '0x6C6D7De6C5f366a1995ed5f1e273C5B3760C6043',               // RHINO
  'alien': '0x1B7B541BeA3aF39292FCe08649e4C4e1BEE408a1',                   // ALIEN
  'nuts': '0x97f7259931f98CC64EbCd993fdE03d71716f3E07',                    // NUTS
  'daytona-finance': '0x9F8182aD65c53Fd78bd07648a1b3DDcB675c6772',         // TONI
  'impls-finance': '0x5f63BC3d5bd234946f18d24e98C324f629D9d60e',           // IMPLS
  'hocus-pocus-finance': '0xd22E78C22D7E77229d60cc9fC57b0E294F54488E',     // HOC
  'pulse-drip': '0xeB2CEed77147893Ba8B250c796c2d4EF02a72B68',              // PDRIP
}
// Deliberately absent (checked, no confident PulseChain match on DexScreener):
// PLS (native coin, no token contract — CoinPaprika covers it), the bridged DAI/HEX/USDC
// wrappers, COLA, PRS, MONAT, MAGIC, SOIL, X, $MAFIA, and PARTY (its only pair priced 23%
// away from CoinGecko, so the safety gate rejected it rather than risk a wrong token).
// All of these still get an FDV — CoinGecko ships fully_diluted_valuation for every one
// of them in the payloads we already fetch; DexScreener is only needed for liquidity.

/**
 * PulseChain tokens that exist ONLY on DexScreener.
 *
 * Everything else on the PulseChain tab starts life as a CoinGecko record that
 * DexScreener then enriches. These have no CoinGecko listing to start from, so
 * the record is a stub: a real, on-chain-verified identity, and nothing else.
 * `backfillFromDexScreener` fills the price, the 24h move, liquidity and FDV
 * from the deepest live pool, exactly as it does for the other tokens.
 *
 * The stub carries no market_cap on purpose — there is no circulating supply
 * figure for it anywhere, so the UI shows FDV (amber) and liquidity (cyan) and
 * never implies a market cap it does not have. It also carries no 7d/30d/1y
 * history, because DexScreener does not publish one: the UI hides those chips
 * rather than inventing them.
 *
 * If DexScreener returns nothing for one of these on a given cycle, the stub is
 * dropped before render — an unpriced ghost planet would be worse than absence.
 */
const DEX_ONLY_PULSE_TOKENS: TokenPrice[] = [
  {
    id: 'provex',
    symbol: 'PRVX',
    name: 'ProveX',
    image: '/provex.webp',
    current_price: 0,
    price_change_percentage_24h: 0,
    dexOnly: true,
  },
  {
    id: 'devc-pulsechain',
    symbol: 'DEVC',
    name: 'DEV Coin',
    image: '/devc.jpg',
    current_price: 0,
    price_change_percentage_24h: 0,
    dexOnly: true,
  },
]

/**
 * The page to send someone to for the coin's own numbers. DEX-only tokens have
 * no CoinGecko entry, so linking there would land on a 404.
 */
export function coinSourceLink(coin: TokenPrice): { url: string; label: string } {
  const address = PULSECHAIN_TOKEN_ADDRESSES[coin.id]
  if (coin.dexOnly && address) {
    return { url: `https://dexscreener.com/pulsechain/${address}`, label: 'View on DexScreener' }
  }
  return { url: `https://www.coingecko.com/en/coins/${coin.id}`, label: 'View on CoinGecko' }
}

const DEX_ONLY_PULSE_IDS = new Set(DEX_ONLY_PULSE_TOKENS.map(t => t.id))

const DEXSCREENER_BATCH_SIZE = 30

/**
 * Uses /tokens/v1/{chain}/{addresses}, not the older /latest/dex/tokens.
 * The legacy route caps its response at 30 PAIRS in total, not per token — 10 addresses
 * came back as 30 pairs covering only 6 tokens, so most requested tokens were silently
 * absent. The v1 route returns the top pair per token (10 addresses -> 10 tokens) and is
 * scoped to one chain, which also removes the Ethereum/PulseChain address collision.
 */
async function fetchDexScreenerBatch(addresses: string[]): Promise<any[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/tokens/v1/pulsechain/${addresses.join(',')}`
    )
    if (!res.ok) {
      console.warn(`[DexScreener] batch failed: ${res.status}`)
      return []
    }
    const data = await res.json()
    return Array.isArray(data) ? data : []
  } catch (error) {
    console.warn('[DexScreener] batch threw:', error)
    return []
  }
}

/**
 * Adds fdv + liquidity (and volume, only where CoinGecko had none) to the PulseChain
 * tokens we have a verified address for. Two batched requests for the whole set.
 *
 * Never writes market_cap — see the note above on why DexScreener's value is an FDV.
 */
async function backfillFromDexScreener(tokens: TokenPrice[]): Promise<number> {
  const targets = tokens.filter(t => PULSECHAIN_TOKEN_ADDRESSES[t.id])
  if (targets.length === 0) return 0

  const addresses = targets.map(t => PULSECHAIN_TOKEN_ADDRESSES[t.id])
  const batches: string[][] = []
  for (let i = 0; i < addresses.length; i += DEXSCREENER_BATCH_SIZE) {
    batches.push(addresses.slice(i, i + DEXSCREENER_BATCH_SIZE))
  }

  const pairGroups = await Promise.all(batches.map(fetchDexScreenerBatch))

  // Keep the deepest pair per token address. The chain check is belt-and-braces: the
  // v1 route is already scoped to pulsechain, but the same address also exists on
  // Ethereum (PulseChain is a fork) and mixing them up silently shows Ethereum prices.
  const deepest = new Map<string, any>()
  for (const pair of pairGroups.flat()) {
    if (pair?.chainId && pair.chainId !== 'pulsechain') continue
    const key = pair?.baseToken?.address?.toLowerCase()
    if (!key) continue
    const current = deepest.get(key)
    if (!current || (pair.liquidity?.usd || 0) > (current.liquidity?.usd || 0)) {
      deepest.set(key, pair)
    }
  }

  let filled = 0
  for (const token of targets) {
    const pair = deepest.get(PULSECHAIN_TOKEN_ADDRESSES[token.id].toLowerCase())
    if (!pair) continue

    const fdv = pair.fdv ?? pair.marketCap
    const liquidity = pair.liquidity?.usd

    // DexScreener is the PRICE AUTHORITY for these tokens: it reads the pool
    // itself, so it is fresher than CoinGecko's aggregate. Without this, the
    // 5-minute full refresh kept reverting the fast lane's live pool prices
    // back to CoinGecko's staler ones and values flapped between sources.
    const pairPrice = parseFloat(pair.priceUsd)
    if (pairPrice > 0) token.current_price = pairPrice
    if (typeof pair.priceChange?.h24 === 'number') {
      token.price_change_percentage_24h = pair.priceChange.h24
    }

    // FDV only as a fallback: CoinGecko's fully_diluted_valuation (captured in
    // mapCoinGeckoCoin) is the primary source. Where the two disagree, DexScreener's
    // supply figure is usually the wrong one — measured: $MAFIA 50x low, WPLS 17x low,
    // ICSA 2x high — because it only sees what's in the pools it indexes.
    if ((token.fdv ?? 0) <= 0 && fdv > 0) token.fdv = fdv

    // Liquidity is DexScreener's unique, trustworthy contribution: actual pool depth.
    if (liquidity > 0) token.liquidity = liquidity

    // Volume only as a fallback — CoinGecko aggregates every venue, DexScreener sees
    // one pair, so CoinGecko's number is the better one whenever it exists.
    if ((token.total_volume ?? 0) <= 0 && (pair.volume?.h24 ?? 0) > 0) {
      token.total_volume = pair.volume.h24
    }

    if (fdv > 0 || liquidity > 0) {
      token.dexSource = pair.dexId || 'dexscreener'
      filled++
    }
  }

  if (filled > 0) {
    console.log(`[CryptoDUST] DexScreener added FDV/liquidity for ${filled} PulseChain token(s).`)
  }
  return filled
}

// =====================================================
// MULTI-CHAIN GALAXIES
// Extra ecosystem tabs after PulseChain, each fed by its CoinGecko category.
// Coins already shown in the top-500 or an earlier section are skipped so ids
// stay unique across the flat list (React keys + selection depend on that).
// =====================================================
export interface EcosystemSection {
  key: string
  label: string
  start: number
  end: number
}

const EXTRA_ECOSYSTEMS = [
  { key: 'base', label: 'Base', category: 'base-ecosystem', limit: 100 },
  { key: 'solana', label: 'Solana', category: 'solana-ecosystem', limit: 100 },
  { key: 'bnb', label: 'BNB', category: 'binance-smart-chain', limit: 100 },
]

async function fetchEcosystemCategory(category: string, label: string): Promise<TokenPrice[]> {
  // 250 per category, not 100: the category's top ranks overlap heavily with the
  // main top-500 list and get deduped away — the tab is built from what remains.
  const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&category=${category}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d,1y`
  const res = await fetchCoinGeckoWithRetry(url, { usePulseKey: true, label: `${label} ecosystem` })
  if (!res) return []
  try {
    const data = await res.json()
    return Array.isArray(data) ? data.map(mapCoinGeckoCoin) : []
  } catch {
    return []
  }
}

// Fetch top 500 coins (2 pages of 250) + PulseChain Ecosystem + user specials via CoinGecko.
// HAC and HACD are inserted at positions 498-499 (end of 400-500 tab) via splice.
// The tail (500+) contains ONLY Pulse coins fetched from Pulse sources (ecosystem category + curated + special),
// limited to ~98. No leaks from previous tabs. Impact on 0-499 is zero.
export interface MarketData {
  tokens: TokenPrice[]
  sections: EcosystemSection[]
}

async function fetchAllCoins(): Promise<MarketData> {
  try {
    const [mainPages, coinGeckoSpecial, specialCoins] = await Promise.all([
      Promise.all([
        withLastGood('main page 1', () => fetchCoinGeckoPage(1)),
        withLastGood('main page 2', () => fetchCoinGeckoPage(2)),
      ]),
      withLastGood('special Pulse tokens', fetchSpecialPulseChainTokens),
      withLastGood('HAC/HACD', fetchSpecialCoins),
    ])

    let all = mainPages.flat().slice(0, 500)

    // Merge special tokens (PLS, pHEX etc.)
    const existingIds = new Set(all.map(t => t.id))
    const pulseIds = new Set<string>()
    for (const token of coinGeckoSpecial) {
      if (!existingIds.has(token.id)) {
        all.push(token)
      }
      pulseIds.add(token.id.toLowerCase())
    }

    // Remove any excluded PulseChain coins that might have slipped in
    all = all.filter(t => !PULSECHAIN_EXCLUDED_IDS.includes(t.id.toLowerCase()))

    // ============================================
    // User's Curated PulseChain tokens (highest priority)
    // These are the specific coins you requested to guarantee they appear
    // Fetched efficiently in one call using the ids= parameter
    // ============================================
    try {
      const curatedPulse = await withLastGood('curated Pulse tokens', fetchCuratedPulseChainTokens)

      for (const token of curatedPulse) {
        const index = all.findIndex(t => t.id === token.id)
        if (index !== -1) {
          all[index] = mergeTokenData(all[index], token)
        } else {
          all.push(token)
        }
        pulseIds.add(token.id.toLowerCase())
      }
    } catch (e) {
      console.warn('[CryptoDUST] Curated PulseChain fetch failed', e)
    }

    // ============================================
    // PulseChain Ecosystem via official category (broader discovery)
    // Source: https://www.coingecko.com/en/categories/pulsechain-ecosystem
    // ============================================
    try {
      const pulseEcosystem = await withLastGood('Pulse ecosystem category', fetchPulseChainEcosystemTokens)

      for (const token of pulseEcosystem) {
        const index = all.findIndex(t => t.id === token.id)
        if (index !== -1) {
          all[index] = mergeTokenData(all[index], token)
        } else {
          all.push(token)
        }
        pulseIds.add(token.id.toLowerCase())
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

    // ============================================
    // LEAKAGE FIX (user request):
    // - Keep exactly mainSection (0-499) with HAC/HACD at 498-499. No effect on previous tabs.
    // - Collect ONLY the Pulse coins that were explicitly fetched from Pulse sources
    //   (SPECIAL + CURATED + full ecosystem category) for the tail (500+).
    // - Limit to ~98. This avoids any leaked non-Pulse and ensures all real Pulse coins
    //   from the category are included (not just those with 'pulse' in the name).
    // ============================================
    const mainSection = all.slice(0, 500)
    const seen = new Set(mainSection.map(t => t.id))
    const pulseTail: TokenPrice[] = []

    // Scan to capture every explicitly Pulse-sourced coin (using pulseIds tracked during fetch)
    // This skips the leaked top-market coins that were shifted into tail by the HAC splice.
    for (const t of all) {
      if (seen.has(t.id)) continue
      const id = t.id.toLowerCase()
      if (PULSECHAIN_EXCLUDED_IDS.includes(id)) continue

      if (pulseIds.has(id)) {
        seen.add(t.id)
        pulseTail.push(t)
      }
    }

    // The old limit was 98 while the Pulse sources return ~107, so the tab was
    // silently dropping the smallest coins every load. The cap is now just a
    // sanity bound, and truncation is reported instead of being invisible.
    const PULSE_TAIL_LIMIT = 200
    const limitedPulseTail = pulseTail.slice(0, PULSE_TAIL_LIMIT)

    if (pulseTail.length > PULSE_TAIL_LIMIT) {
      console.warn(
        `[CryptoDUST] PulseChain tab truncated: ${pulseTail.length} coins found, showing ${PULSE_TAIL_LIMIT}.`
      )
    }

    // Tokens with no CoinGecko listing at all: added as stubs here so the
    // DexScreener backfill below can fill them in like any other Pulse token.
    // Guarded against an id that is already on screen from a real listing.
    for (const stub of DEX_ONLY_PULSE_TOKENS) {
      // Guarded on the symbol too, not just the id: if one of these ever gets
      // a CoinGecko listing it will arrive under CoinGecko's own id, and the
      // real record has to win rather than the tab showing the coin twice.
      const already =
        seen.has(stub.id) ||
        limitedPulseTail.some(
          t => t.id === stub.id || t.symbol.toUpperCase() === stub.symbol.toUpperCase()
        )
      if (already) continue
      seen.add(stub.id)
      limitedPulseTail.push({ ...stub })
    }

    // Backfill BEFORE sorting — otherwise PLS/PLSX/HEX sort as if they were worth
    // nothing. CoinPaprika first because it supplies real circulating market caps;
    // DexScreener only ever adds FDV/liquidity alongside them.
    await backfillFromCoinPaprika(limitedPulseTail)
    await backfillFromDexScreener(limitedPulseTail)

    // A DEX-only stub is only real once DexScreener has priced it. If the call
    // failed or the pool vanished, drop it rather than render a $0 planet.
    for (let i = limitedPulseTail.length - 1; i >= 0; i--) {
      const t = limitedPulseTail[i]
      if (DEX_ONLY_PULSE_IDS.has(t.id) && !(t.current_price > 0)) {
        console.warn(`[CryptoDUST] ${t.symbol} has no live DexScreener price this cycle, omitting it.`)
        limitedPulseTail.splice(i, 1)
      }
    }

    // The tab was ordered by whatever order the three source fetches happened to
    // append in, which buried PLS (#69) and PLSX (#74) below far smaller tokens
    // despite the sources being requested as market_cap_desc. Sort it for real.
    //
    // Tokens with a real market cap rank on that. Everything else falls back to DEX
    // liquidity rather than FDV: FDV would put AXIS ($359M FDV / $10k liquidity)
    // above HEX, which is not a useful ordering for anyone.
    const rank = (t: TokenPrice) => t.market_cap || t.liquidity || 0
    limitedPulseTail.sort((a, b) => rank(b) - rank(a))

    // First 500 (with HAC/HACD at 498-499) + every Pulse coin the sources returned.
    const result = [...mainSection, ...limitedPulseTail]
    const sections: EcosystemSection[] = [
      { key: 'pulsechain', label: 'PulseChain', start: mainSection.length, end: result.length },
    ]

    // Extra galaxy tabs (Base, Solana, ...) — fetched sequentially to stay
    // gentle on the rate limit; each dedups against everything already shown.
    for (const eco of EXTRA_ECOSYSTEMS) {
      const fetched = await withLastGood(`${eco.label} ecosystem`, () =>
        fetchEcosystemCategory(eco.category, eco.label)
      )
      const shown = new Set(result.map(t => t.id))
      const fresh = fetched.filter(t => !shown.has(t.id)).slice(0, eco.limit)
      if (fresh.length === 0) continue
      const start = result.length
      result.push(...fresh)
      sections.push({ key: eco.key, label: eco.label, start, end: result.length })
    }

    console.log(
      `[CryptoDUST] ${result.length} coins ready (${mainSection.length} main + ` +
      sections.map(s => `${s.end - s.start} ${s.label}`).join(' + ') + ').'
    )
    return { tokens: result, sections }
  } catch (error) {
    console.error('Failed to fetch coins', error)
    return { tokens: [], sections: [] }
  }
}

// =====================================================
// Compact price formatting for micro-prices.
// "$0.000" tells a PLS holder nothing. The subscript convention CoinGecko and
// DexScreener use — $0.0₅885 = five zeros then 885, i.e. 0.00000885 — shows the
// real price in a handful of characters. Unicode subscript digits render fine
// in both DOM text and canvas fillText.
// =====================================================
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

export function formatCompactPrice(price: number | null | undefined): string {
  if (!price || price <= 0) return '$0'
  if (price >= 1000) return '$' + price.toLocaleString(undefined, { maximumFractionDigits: 0 })
  if (price >= 1) return '$' + price.toFixed(2)
  if (price >= 0.01) return '$' + price.toFixed(4)

  // Number of zeros between the decimal point and the first significant digit
  const zeros = Math.floor(-Math.log10(price))
  if (zeros <= 3) return '$' + price.toFixed(zeros + 3)

  // 3 significant digits, trailing zeros trimmed: 0.00000885 -> "885"
  const digits = String(Math.round(price * Math.pow(10, zeros + 3))).replace(/0+$/, '') || '0'
  const sub = String(zeros).split('').map(d => SUBSCRIPT_DIGITS[+d]).join('')
  return `$0.0${sub}${digits}`
}

// =====================================================
// FAST LANE — light 60-second price refresh.
// The full pipeline (9 CoinGecko calls) stays on its 5-minute cycle; between
// cycles we refresh only what moves the needle at minimal quota cost:
//   - top-250 prices: ONE CoinGecko call, shared across every visitor by the
//     proxy's s-maxage=60 edge cache
//   - every mapped PulseChain token: TWO DexScreener calls, keyless and far
//     under its 300 req/min ceiling
// Runs only while the tab is visible, so idle tabs spend nothing.
// =====================================================
interface FastPulseQuote {
  price: number
  change24?: number
  liquidity?: number
}

async function fetchFastPulseQuotes(): Promise<Map<string, FastPulseQuote>> {
  const out = new Map<string, FastPulseQuote>()
  const entries = Object.entries(PULSECHAIN_TOKEN_ADDRESSES)
  const addrToId = new Map(entries.map(([id, addr]) => [addr.toLowerCase(), id]))
  const addresses = entries.map(([, addr]) => addr)

  const batches: string[][] = []
  for (let i = 0; i < addresses.length; i += DEXSCREENER_BATCH_SIZE) {
    batches.push(addresses.slice(i, i + DEXSCREENER_BATCH_SIZE))
  }

  const groups = await Promise.all(batches.map(fetchDexScreenerBatch))
  for (const pair of groups.flat()) {
    if (pair?.chainId && pair.chainId !== 'pulsechain') continue
    const id = addrToId.get(pair?.baseToken?.address?.toLowerCase())
    if (!id) continue
    const price = parseFloat(pair.priceUsd)
    if (!(price > 0)) continue
    const existing = out.get(id)
    const liquidity = pair.liquidity?.usd || 0
    if (existing && (existing.liquidity || 0) >= liquidity) continue // keep deepest pair
    out.set(id, {
      price,
      change24: typeof pair.priceChange?.h24 === 'number' ? pair.priceChange.h24 : undefined,
      liquidity: liquidity > 0 ? liquidity : undefined,
    })
  }
  return out
}

function mergeFastLane(
  current: MarketData,
  top: TokenPrice[],
  pulse: Map<string, FastPulseQuote>
): MarketData {
  const byId = new Map(top.map(t => [t.id, t]))
  const tokens = current.tokens.map(t => {
    const fresh = byId.get(t.id)
    if (fresh) {
      return {
        ...t,
        current_price: fresh.current_price || t.current_price,
        price_change_percentage_24h: fresh.price_change_percentage_24h ?? t.price_change_percentage_24h,
        price_change_percentage_1h: fresh.price_change_percentage_1h ?? t.price_change_percentage_1h,
        high_24h: fresh.high_24h ?? t.high_24h,
        low_24h: fresh.low_24h ?? t.low_24h,
        total_volume: fresh.total_volume || t.total_volume,
        market_cap: fresh.market_cap || t.market_cap,
      }
    }
    const dp = pulse.get(t.id)
    if (dp) {
      return {
        ...t,
        current_price: dp.price,
        price_change_percentage_24h: dp.change24 ?? t.price_change_percentage_24h,
        liquidity: dp.liquidity ?? t.liquidity,
      }
    }
    return t
  })
  return { tokens, sections: current.sections }
}

// ==================== MAIN HOOK ====================
export function usePrices() {
  const { data, error, isLoading, mutate } = useSWR<MarketData>(
    // Key bumped: the cached shape changed from TokenPrice[] to MarketData
    'coingecko-markets-v2',
    fetchAllCoins,
    {
      refreshInterval: REFRESH_INTERVAL,
      revalidateOnFocus: false,
      dedupingInterval: 60000, // avoid refetching too often
    }
  )

  // Fast lane: 60s price-only updates between the 5-minute full rebuilds
  const lastFastRun = useRef(0)
  const dataRef = useRef<MarketData | undefined>(undefined)
  useEffect(() => { dataRef.current = data }, [data])

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled || document.visibilityState === 'hidden') return
      // NEVER mutate before the first full load lands: SWR treats a mutation
      // as fresher than any in-flight fetch and DISCARDS its result — on slow
      // (rate-limited) initial loads that left the app empty forever.
      if (!dataRef.current) return
      if (Date.now() - lastFastRun.current < 45000) return
      lastFastRun.current = Date.now()

      try {
        const [top, pulse] = await Promise.all([
          fetchCoinGeckoPage(1),
          fetchFastPulseQuotes(),
        ])
        if (cancelled || (top.length === 0 && pulse.size === 0)) return
        mutate(curr => (curr ? mergeFastLane(curr, top, pulse) : curr), { revalidate: false })
      } catch { /* next tick catches up */ }
    }

    const interval = setInterval(tick, 60000)
    // Coming back to the tab refreshes immediately instead of waiting a minute
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [mutate])

  return {
    tokens: data?.tokens ?? [],
    sections: data?.sections ?? [],
    isLoading,
    error,
    lastUpdated: Date.now(),
  }
}

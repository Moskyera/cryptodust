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
import { useEffect, useRef, useState } from 'react'

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
/** Buy and sell TRADE COUNTS in one window. Counts, never dollars. */
export interface FlowWindow {
  buys: number
  sells: number
}

/**
 * DexScreener's per-window trade counts, carried straight through.
 *
 * Two things this is not, both of which the UI has to say out loud:
 *
 * 1. It is not volume. DexScreener publishes no per-side dollar figure, so two
 *    hundred dust buys from one bot outrank a single whale sell and the split
 *    reads bullish while the token is being unloaded. There is no fixing that
 *    from this data, only labelling it.
 * 2. It is not the whole token. These counts come from the single deepest pool,
 *    which is all the batch endpoint returns; PLSX's deepest pool carries only
 *    about a third of its chain-wide trades. It is a sample, and it is labelled
 *    as one.
 *
 * Shorter windows thin out sharply (h24 is on every mapped token, m5 on a
 * handful), so absent must render as absent, never as an even split.
 */
export interface TokenFlow {
  m5?: FlowWindow
  h1?: FlowWindow
  h6?: FlowWindow
  h24?: FlowWindow
}

/** Share of trades that were buys, 0..1, or null when the window is empty. */
export function flowShare(w: FlowWindow | undefined): number | null {
  if (!w) return null
  const total = w.buys + w.sells
  if (!(total > 0)) return null
  return w.buys / total
}

export interface TokenPrice {
  id: string
  symbol: string
  /**
   * The ticker as the source publishes it, present only where the displayed one
   * was overridden. Anything handing a ticker to a third party that has to
   * recognise it — the on-ramp link — needs this rather than our label.
   */
  sourceSymbol?: string
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
   * Buy/sell trade counts from the deepest pool. See TokenFlow for the two
   * things this is not.
   */
  flow?: TokenFlow
  /**
   * The DEX the flow counts were read from. Kept apart from dexSource, which
   * attributes fdv/liquidity: on the ecosystem tabs CoinGecko still owns the
   * valuation and only the flow comes from a pool, so conflating the two would
   * credit DexScreener with numbers it did not supply.
   */
  flowSource?: string
  /**
   * The flow pool's share of the token's 24h volume, 0..1. Shown in the panel
   * so a pool that only just clears the bar says so rather than implying it
   * speaks for the whole token.
   */
  flowPoolShare?: number
  /**
   * True for coins that exist only on DEXs and have no CoinGecko listing, so
   * the UI never offers a CoinGecko page that would 404.
   */
  dexOnly?: boolean
  /**
   * Set when neither source can honestly describe the coin's last 24 hours.
   * Such a coin is removed before render rather than shown with a percentage
   * we know to be wrong.
   */
  unpriceable?: boolean
  /**
   * Its price was compared against its own pool this cycle. False or absent
   * means the comparison never happened — no pool, or the source was down —
   * which is the difference between a figure that has been checked and one that
   * has only been received.
   */
  poolChecked?: boolean
  /**
   * Provenance of the price on screen. `priceSource` says which source wrote
   * current_price; `sourcePrice` is what the aggregator said before a pool
   * replaced it, kept so the reader can see how far the two sat apart rather
   * than take the repair on trust; `priceRepaired` means the gap was large
   * enough that the longer windows were restated against the pool price too.
   */
  priceSource?: 'pool' | 'aggregate'
  sourcePrice?: number
  priceRepaired?: boolean
  /**
   * The pool's own terms. Every pool is priced through some other asset and
   * DexScreener states the native price in it — 1 PLSX = 0.826 PLS, LUCKY =
   * 1.03 HEX — which is the reading the PulseChain community does by hand.
   * Read, never computed: both come off the same pair object that supplied
   * current_price, so the unit and the number can never disagree.
   */
  poolQuote?: string
  priceNative?: number
  /**
   * Real hourly closes for the last seven days, oldest first — CoinGecko's
   * sparkline_in_7d, 168 points.
   *
   * NOT filled by the list fetches. Asking for it there added roughly 2.3 MB to
   * every five-minute cycle so that a visitor could see one chart, because the
   * chart only ever appears in the detail panel for the single coin that is
   * open. It is fetched per coin on selection instead, by fetchCoinHistory, and
   * attached to the card when one is generated.
   */
  history7d?: number[]
}

// ==================== COINGECKO FETCH ====================
/**
 * A 24h volume this many times a coin's market cap is not a market, it is a
 * broken row upstream.
 *
 * Measured on the live top-500 the day this was written: CoinGecko reported
 * SAND at $14,551.9B of volume against a $0.135B cap, a ratio of 107,554x. It
 * alone made the header read "$14850.7B traded in 24 hours" for the whole
 * market, roughly fifty times the real figure. The next highest ratio in the
 * entire top-500 was TRUMP at 3.4x, and the median was 0.069x, so 50 sits in a
 * gap four orders of magnitude wide. Nothing legitimate is near it.
 *
 * Dropped rather than clamped: we do not know the true number, and inventing a
 * plausible one would be worse than showing none.
 */
const MAX_VOLUME_TO_MARKET_CAP = 50

function plausibleVolume(volume: unknown, marketCap: unknown): number | undefined {
  if (typeof volume !== 'number' || !Number.isFinite(volume) || volume < 0) return undefined
  // No cap to compare against (most PulseChain tokens) means no test to apply.
  if (typeof marketCap !== 'number' || !(marketCap > 0)) return volume
  return volume > marketCap * MAX_VOLUME_TO_MARKET_CAP ? undefined : volume
}

function mapCoinGeckoCoin(coin: any): TokenPrice {
  const change24h =
    coin.price_change_percentage_24h ??
    coin.price_change_percentage_24h_in_currency ??
    0

  return {
    id: coin.id,
    symbol: SYMBOL_OVERRIDES[coin.id] ?? coin.symbol.toUpperCase(),
    sourceSymbol: SYMBOL_OVERRIDES[coin.id] ? coin.symbol.toUpperCase() : undefined,
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
    total_volume: plausibleVolume(coin.total_volume, coin.market_cap),
    image: coin.image,
    history7d: Array.isArray(coin.sparkline_in_7d?.price)
      ? (coin.sparkline_in_7d.price as unknown[]).filter(
          (n): n is number => typeof n === 'number' && Number.isFinite(n)
        )
      : undefined,
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

  if (incoming.flow == null && existing.flow != null) {
    merged.flow = existing.flow
  }

  if (
    (incoming.history7d == null || incoming.history7d.length === 0) &&
    existing.history7d != null &&
    existing.history7d.length > 0
  ) {
    merged.history7d = existing.history7d
  }

  return merged
}

/**
 * How long any one outbound call may hold the page shut.
 *
 * There was no limit of any kind here, and the first render waits on a chain of
 * these. On 2026-08-24 DexScreener slowed to 6 seconds a call with two of them at
 * 25, and the site sat on "Loading market data" past thirty seconds — a third
 * party having a bad afternoon holding the whole page closed, with no way for it
 * to ever give up.
 *
 * The enrichment sources get the shorter budget: every one of those calls is
 * already written to survive coming back empty, so a deadline turns an outage
 * into a cycle with some fields missing that the next cycle fills. CoinGecko gets
 * longer because it is not enrichment — it is the coin list itself, and there is
 * nothing to draw without it. Both are far above the healthy response, measured
 * at well under a second for either.
 */
const MARKET_FETCH_TIMEOUT_MS = 12000
const ENRICH_FETCH_TIMEOUT_MS = 6000

/**
 * fetch that gives up. An abort rejects, which every caller here already treats
 * as "no data from this source this cycle".
 */
async function fetchWithTimeout(
  url: string,
  ms: number,
  init?: RequestInit
): Promise<Response> {
  // Wired by hand rather than with AbortSignal.timeout, which Safari only got in
  // 16 and this site is opened on older phones.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * A breaker in front of DexScreener, so one bad afternoon there costs a cycle
 * one probe instead of sixteen timeouts.
 *
 * The deadline above bounds each call, but the build makes many of them per
 * cycle in several serial stages. On 2026-08-24, with DexScreener answering
 * nothing, every cycle still paid the full six seconds at every stage — the
 * page opened, then re-paid the outage every five minutes, and the sixty-second
 * fast lane paid it again in between.
 *
 * After STRIKES consecutive failures the breaker opens. While open, each cycle
 * lets exactly ONE call through as a probe and rejects the rest on the spot;
 * a probe that answers closes it again. So a healthy source is never throttled
 * (it never accumulates strikes), an outage is detected within three calls, and
 * recovery is noticed within one cycle of it happening.
 *
 * Callers already treat a rejected call as "no pool data this cycle", and the
 * page already renders that honestly — this only makes the empty answer arrive
 * in milliseconds instead of after the deadline.
 */
const DEX_BREAKER_STRIKES = 3
const dexBreaker = { strikes: 0, open: false, probing: false, openedAt: 0, lastProbeAt: 0 }

/** Read-only view of the breaker, for anything that wants to say "pool data paused". */
export function getDexScreenerHealth(): { open: boolean; since: number | null } {
  return { open: dexBreaker.open, since: dexBreaker.open ? dexBreaker.openedAt : null }
}

async function fetchDexScreener(url: string): Promise<Response> {
  if (dexBreaker.open) {
    // One probe at a time, and not more often than the fast lane ticks, so a
    // burst of parallel batches does not all become probes at once.
    const now = Date.now()
    if (dexBreaker.probing || now - dexBreaker.lastProbeAt < 45000) {
      throw new Error('DexScreener breaker open')
    }
    dexBreaker.probing = true
    dexBreaker.lastProbeAt = now
  }

  try {
    const res = await fetchWithTimeout(url, ENRICH_FETCH_TIMEOUT_MS)
    if (res.ok) {
      if (dexBreaker.open) console.log('[CryptoDUST] DexScreener is answering again; pool data resumes.')
      dexBreaker.strikes = 0
      dexBreaker.open = false
    } else {
      strike()
    }
    return res
  } catch (error) {
    strike()
    throw error
  } finally {
    dexBreaker.probing = false
  }

  function strike() {
    dexBreaker.strikes++
    if (!dexBreaker.open && dexBreaker.strikes >= DEX_BREAKER_STRIKES) {
      dexBreaker.open = true
      dexBreaker.openedAt = Date.now()
      console.warn(
        `[CryptoDUST] DexScreener failed ${dexBreaker.strikes} times in a row; pausing pool lookups and probing once a cycle.`
      )
    }
  }
}

async function fetchCoinGecko(
  url: string,
  options: { usePulseKey?: boolean } = {}
): Promise<Response> {
  const { usePulseKey = false } = options

  if (USE_API_PROXY) {
    const proxyUrl = `/api/coingecko?url=${encodeURIComponent(url)}&pulse=${usePulseKey ? '1' : '0'}`
    return fetchWithTimeout(proxyUrl, MARKET_FETCH_TIMEOUT_MS)
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

  return fetchWithTimeout(finalUrl, MARKET_FETCH_TIMEOUT_MS)
}

// =====================================================
// Last-good cache: a transient failure in any one source must never shrink the
// coin list mid-session. Without this, one failed category fetch during a 5-minute
// SWR refresh dropped the PulseChain tab from ~107 coins to ~27 until the next cycle.
// =====================================================
const lastGoodResults = new Map<string, TokenPrice[]>()
/** When each last-good result was actually fetched, so a fallback can say how old it is. */
const lastGoodAt = new Map<string, number>()
/** Oldest fetch time among the sources served stale in the current build; null when none were. */
let staleDataAt: number | null = null

async function withLastGood(
  key: string,
  fetcher: () => Promise<TokenPrice[]>
): Promise<TokenPrice[]> {
  const result = await fetcher()
  if (result.length > 0) {
    lastGoodResults.set(key, result)
    lastGoodAt.set(key, Date.now())
    return result
  }

  const cached = lastGoodResults.get(key)
  if (cached?.length) {
    console.warn(
      `[CryptoDUST] ${key} returned nothing — reusing ${cached.length} tokens from the previous refresh.`
    )
    // Reported upward as the age of the oldest stale source, so the header can
    // say CACHED with a real age instead of LIVE. The caller never sees this
    // fallback otherwise: the build succeeds, just with older numbers in it.
    const fetchedAt = lastGoodAt.get(key) ?? Date.now()
    staleDataAt = staleDataAt === null ? fetchedAt : Math.min(staleDataAt, fetchedAt)
    // Shallow copies, not the stored objects. The originals are already inside
    // the rendered token list, and the enrichment steps downstream mutate what
    // they are given, which would be a write into live state React never hears
    // about — and would also corrupt this cache for every later cycle.
    return cached.map(t => ({ ...t }))
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

/**
 * Ticker shown in place of the one the source reports, keyed by coin id.
 *
 * The PulseChain tab carries two coins that both report the ticker HEX, and the
 * planet band, the hover pill and the list row are the only text either of them
 * gets — so without this they are two identical labels separated by their price
 * digits. CoinGecko itself splits them, and says why on the Ethereum one: due to
 * the price difference, HEX (PulseChain) is tracked separately to avoid
 * confusion.
 *
 * Keyed by id, never by symbol, for the same reason the CoinPaprika map below is:
 * the symbol is exactly the thing that is ambiguous here. The PulseChain one keeps
 * the plain ticker because that is the one this site is about.
 */
const SYMBOL_OVERRIDES: Record<string, string> = {
  hex: 'eHEX',
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
  // The Ethereum HEX, on this tab because the owner asked for it beside the
  // PulseChain one — see PULSE_TAB_BY_CHOICE for what that costs to keep true.
  'hex',
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
    const res = await fetchWithTimeout(
      `https://api.coinpaprika.com/v1/tickers/${paprikaId}?quotes=USD`,
      ENRICH_FETCH_TIMEOUT_MS
    )
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
  'provex': '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11',
  // Wrapped PLS. Here for its own row AND because it is the only way to check
  // the native coin: PLS has no contract, so it was the one coin on the tab
  // whose price was never compared against a pool — while being the asset
  // most of the tab is priced through. WPLS is PLS one-for-one by construction,
  // and its deepest pool (PulseX WPLS/DAI, $902k measured 2026-09-06) is the
  // deepest PLS market there is. CoinGecko sat 13% below it that day.
  'wrapped-pulse-wpls': '0xA1077a294dDE1B09bB078844df40758a5D0f9a27',                  // PRVX
  // DEV Coin, likewise absent from CoinGecko. Verified on-chain via
  // rpc.pulsechain.com: name "DEV Coin", symbol "DEVC", 18 decimals.
  'devc-pulsechain': '0xA804b9E522A2D1645a19227514CFe856Ad8C2fbC',          // DEVC
  'pulsex': '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab',                  // PLSX
  // PulseChain is a fork of Ethereum, so this exact string is ALSO the Ethereum
  // HEX's contract — CoinGecko returns it for coin id `hex` under `ethereum` and
  // for `hex-pulsechain` under `pulsechain`, byte for byte. Never add a second
  // key here holding it: this map is fed to DexScreener's pulsechain route, which
  // answers with the PulseX pool either way, so both ids would take pHEX's price,
  // liquidity and flow. It would not announce itself — the two prices are 2.46x
  // apart, well under the 20x that trips the repair branch — and the fast lane's
  // address -> id inversion would quietly drop whichever id came first.
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
// PLS (native coin, no token contract — CoinPaprika covers its market cap, and its PRICE is now mirrored from the WPLS pool below), the bridged DAI/HEX/USDC
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
 * Ids that sit on the PulseChain tab because the owner put them there, not
 * because they have a contract on the chain. They skip the visiting-token test,
 * which exists to keep coins off a tab they have no claim to and would otherwise
 * be right to remove these.
 */
const PULSE_TAB_BY_CHOICE = new Set(['hex'])

/**
 * The head of the PulseChain tab, in this order, by the owner's instruction.
 *
 * Ids rather than tickers, because HEX means two different coins on this tab and
 * PRVX means nothing to CoinGecko at all. PRVX is also the one that can go
 * missing: it has no listing anywhere and exists here only while DexScreener
 * prices its pool, so a cycle that loses the pool drops it entirely rather than
 * draw a $0 planet — better four pinned rows than a fifth that is a placeholder.
 */
const PULSE_PINNED_IDS = [
  'hex-pulsechain',         // HEX
  'pulsechain',             // PLS
  'pulsex',                 // PLSX
  'pulsex-incentive-token', // INC
  'provex',                 // PRVX
]

/**
 * Where a by-choice token's real pool lives, when it is not on PulseChain.
 *
 * The Ethereum HEX has no PulseChain pool at all, so the tab's own DexScreener
 * pass cannot see it and it would arrive with no liquidity and no flow — which
 * matters beyond a blank field, because the tab is ordered by market cap falling
 * back to pool depth, and CoinGecko reports a market cap of 0 for both HEX
 * listings. With neither, it would rank 0 and sort below all hundred-odd coins,
 * about as far from the HEX it is meant to sit beside as the tab allows.
 *
 * So it is read from the pool it actually trades in: Uniswap v2 on Ethereum,
 * measured at $589k depth against pHEX's $871k on PulseX. One keyless request
 * per cycle. Its price is deliberately NOT taken from there — unlike the
 * PulseChain tokens, eHEX trades across many venues and CoinGecko's aggregate is
 * the better figure, and its data is healthy: a clean 168-point week whose
 * largest hourly step is 9%, nothing like the 345x break next door.
 */
const ETHEREUM_POOL_TOKENS: Record<string, string> = {
  hex: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39',
}

/**
 * Uses /tokens/v1/{chain}/{addresses}, not the older /latest/dex/tokens.
 * The legacy route caps its response at 30 PAIRS in total, not per token — 10 addresses
 * came back as 30 pairs covering only 6 tokens, so most requested tokens were silently
 * absent. The v1 route returns the top pair per token (10 addresses -> 10 tokens) and is
 * scoped to one chain, which also removes the Ethereum/PulseChain address collision.
 */
async function fetchDexScreenerBatch(addresses: string[]): Promise<any[]> {
  try {
    const res = await fetchDexScreener(
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
 * Pulls the trade counts out of a pair, dropping windows the pair does not carry.
 *
 * These eight integers ride in every response the app already makes twice a
 * minute and were being thrown away. Reading them costs nothing: no extra call,
 * no extra key, and DexScreener edge-caches these responses for 30 seconds.
 */
/**
 * Below this a split is arithmetic, not information: one buy and no sells is
 * "100% buys" and would paint a solid green ring.
 *
 * Set on trades rather than on dollars deliberately. A dollar floor looks like
 * the same test and is not: PulseChain is a small-cap chain where FIRE turned
 * over 254 real trades on $790, so a $1,000 floor threw out two thirds of the
 * chain this site is built around while leaving a quiet $2,000 pool on BNB
 * untouched. Counting trades asks the question that actually matters — is
 * anyone trading here — without pricing one chain's whole ecosystem out.
 *
 * Measured at 15 with the share test below: PulseChain keeps 26 of 35, Base 12
 * of 80, Solana 23 of 81 and BNB 19 of 83.
 */
const FLOW_MIN_TRADES = 15

/**
 * The pool must carry at least this share of everything the token traded in 24
 * hours before its flow is allowed to stand for the token.
 *
 * This is the guard that makes order flow safe outside PulseChain. On a
 * DEX-native chain the deepest pool IS the market, so almost everything passes:
 * 31 of 35 mapped PulseChain tokens clear this, and the four that do not are
 * PHUX, PHAME, AXIS and PHIAT, each with a handful of trades on a pool doing
 * single-digit dollars. On Base, Solana and BNB the top hundred are mostly
 * large tokens whose real trading happens on centralised exchanges, and their
 * chain-specific pool is a backwater: MOVE showed one single buy on an
 * Aerodrome pool while the token itself did $57.7M that day. Ungated, that
 * rendered as a solid green ring, which is the exact species of lie this app
 * exists not to tell. Measured across the three tabs, 68 of 80 Base pools, 61
 * of 81 Solana pools and 64 of 83 BNB pools fail this test, and every one of
 * them deserves to.
 */
const FLOW_MIN_VOLUME_SHARE = 0.1

/**
 * A pool must hold at least this much before its price is allowed to override
 * an aggregator's. Deliberately low: PulseChain pools are small in dollar terms
 * and the alternative on that tab is a figure that is wrong by 337x.
 */
const PRICE_AUTHORITY_MIN_LIQUIDITY_USD = 250

/**
 * A gap this wide between the aggregator and the token's own deepest pool is a
 * data fault, not a market condition. Two pools of one token cannot sit twenty
 * times apart while anyone is watching, so a figure that far from the pool means
 * the aggregator's derivation broke rather than that the price moved.
 *
 * Measured across the live PulseChain tab: 29 coins sat above 100x on a uniform
 * ~337x break, 67 sat within 1.2x, and nothing at all sat between 8.6x and 100x.
 * The line is drawn inside that empty band rather than at either cluster's edge,
 * so it separates the two without having to adjudicate a borderline case.
 */
const PRICE_SERIES_BROKEN_GAP = 20

/**
 * A 24h move past this is not a day on this tab, it is the breakage.
 *
 * Measured: the broken coins printed between +26,000% and +45,000%, while the
 * whole PulseChain tab's real days sit under 40% and its wildest real week was
 * +204%. The line is drawn an order of magnitude above anything real seen here
 * and an order of magnitude below the fault — and it only ever applies to a coin
 * whose price could not be checked against a pool, so a genuine launch that ran
 * this far is still shown as long as its own pool confirms it.
 */
const IMPLAUSIBLE_24H_MOVE = 1000

/**
 * Restates a percentage change against a corrected current price.
 *
 * A change is (now / then - 1). When `now` was out by a known factor, dividing
 * the ratio by that factor recovers the same real change measured against the
 * corrected price — but only while `then` predates the break, which is why the
 * caller applies this to large recent faults and never to standing mismatches.
 */
function rescaleChange(change: number | undefined, factor: number): number | undefined {
  if (typeof change !== 'number' || !Number.isFinite(change)) return undefined
  const restated = ((1 + change / 100) / factor - 1) * 100
  return Number.isFinite(restated) ? restated : undefined
}

/**
 * Brings one absolute price back onto the real scale, but only if it is on the
 * discarded one. Each figure is judged on its own against the pool rather than
 * as part of a pair: measured across the 29 broken tokens, every single 24h high
 * had been recorded during the break while every single 24h low predated it, so
 * treating the two together would have dragged a good number down with a bad one.
 */
function rescalePrice(
  value: number | undefined,
  poolPrice: number,
  factor: number
): number | undefined {
  if (typeof value !== 'number' || !(value > 0)) return value
  if (Math.max(value / poolPrice, poolPrice / value) <= PRICE_SERIES_BROKEN_GAP) return value
  const restated = value / factor
  return Number.isFinite(restated) && restated > 0 ? restated : undefined
}

/**
 * Hands a token's price over to its own pool, and repairs what that breaks.
 * Returns how far apart the two sources were.
 *
 * 7d, 30d and 1y are each (price now / price then). Replacing the price now
 * leaves all three quoting the one that was just discarded, which is how a week
 * that moved +54% ends up on screen as +52,280%. DexScreener publishes no window
 * past 24h to swap in and does not need to: the past point was never touched, so
 * dividing out the measured factor restates the same real change against the
 * price now beside it.
 *
 * Checked against PUPPERS, whose sparkline carries the break as a 345x step three
 * hours from the end. Every point before it sits 1.17x from the pool, so the
 * reference is sound. Rescaling returns +53.7%, and measuring the pool against
 * the sparkline's own oldest close returns +54.6% — two independent routes to the
 * same week.
 *
 * Below the threshold this is deliberately not done. A steady 5x mismatch is
 * likelier to be CoinGecko following a different pair, and then its ratio is
 * internally consistent while a rescale would invent one: PRS at 4.6x would go
 * from +10% to +407%.
 *
 * Both PulseChain passes route through here. They used to overwrite the price
 * separately, and the first one doing it silently disarmed the second: by the
 * time the wider pass measured the gap it was reading its own repair, so 13
 * tokens kept a correct 24h move above a five-figure week.
 */
function adoptPoolPrice(token: TokenPrice, pairPrice: number, pair: any): number {
  // A token with no price yet — a DEX-only stub — has nothing to disagree with,
  // so it is adopted outright rather than treated as an infinite break.
  const cgOverPool = token.current_price > 0 ? token.current_price / pairPrice : 1
  const priceGap = Math.max(cgOverPool, 1 / cgOverPool)

  // Kept before the overwrite: the aggregator's figure is the second opinion
  // the panel shows beside the pool's, and the gap between them is the whole
  // reason the reader can trust either.
  // Only on the FIRST adoption of a cycle. The hand-mapped coins are adopted
  // by the address-map pass and again by the ecosystem pass, and the second
  // one would otherwise record the pool's own figure as the "aggregator said"
  // — a second opinion that agrees with itself.
  if (token.priceSource !== 'pool' && token.current_price > 0) token.sourcePrice = token.current_price
  token.current_price = pairPrice
  token.poolChecked = true
  token.priceSource = 'pool'
  // The pool's own terms, off the same pair object as the price.
  const native = parseFloat(pair?.priceNative)
  const quote = pair?.quoteToken?.symbol
  if (Number.isFinite(native) && native > 0 && typeof quote === 'string' && quote) {
    token.priceNative = native
    token.poolQuote = quote
  }

  if (Number.isFinite(priceGap) && priceGap > PRICE_SERIES_BROKEN_GAP) {
    token.priceRepaired = true
    token.price_change_percentage_7d = rescaleChange(token.price_change_percentage_7d, cgOverPool)
    token.price_change_percentage_30d = rescaleChange(token.price_change_percentage_30d, cgOverPool)
    token.price_change_percentage_1y = rescaleChange(token.price_change_percentage_1y, cgOverPool)
    // 1h is a ratio taken inside the broken scale, so it comes out right whenever
    // both of its ends fall after the break and wrong for the single hour that
    // straddles it. The pool reports that window from data that never broke, so
    // here it is preferred outright rather than only filling in a blank.
    if (typeof pair.priceChange?.h1 === 'number') {
      token.price_change_percentage_1h = pair.priceChange.h1
    }

    // The day's high can only have been recorded while the feed was wrong: every
    // close from before the break is smaller than every close after it, so the
    // maximum of the two is always the broken one. It came out that way in all
    // 29 cases, sitting exactly on the discarded price while the low sat on the
    // real one — which is why the panel was printing a high of $0.0160 above a
    // price of $0.000047.
    token.high_24h = rescalePrice(token.high_24h, pairPrice, cgOverPool)
    token.low_24h = rescalePrice(token.low_24h, pairPrice, cgOverPool)

    // The all-time high, unlike everything above, cannot be recovered. On 25 of
    // the 29 the break simply overwrote it — CoinGecko now records the glitch as
    // the peak and dates it hours ago — so the real one is gone from the feed and
    // "10% below its all-time high" is describing a spike that never traded. On
    // the remaining 4 the stored peak is genuinely years old and it is the
    // percentage beside it that is wrong instead. Nothing here can separate a
    // rescued figure from an invented one, so the block is dropped rather than
    // shown. Sizing by ATH already has a path for a coin that publishes none.
    token.ath = undefined
    token.ath_change_percentage = undefined
    token.ath_date = undefined
  }

  return priceGap
}

/**
 * What fraction of the token's 24h volume ran through this pool.
 *
 * `tokenVolume24` MUST be a figure from somewhere other than this pair. Passing
 * a volume that DexScreener itself supplied divides the pool by itself, scores
 * a guaranteed 100%, and turns the guard into a rubber stamp — which is exactly
 * what happened to PRVX and DEVC, whose total_volume is the DexScreener volume
 * fallback. Callers capture the independent figure before any fallback runs.
 *
 * Returns null when there is genuinely no independent figure. That is not a
 * pass: it means the share test cannot run and the absolute floor above has to
 * carry the decision alone.
 */
function poolVolumeShare(pairVolume24: number, tokenVolume24: number | undefined): number | null {
  if (!(tokenVolume24 && tokenVolume24 > 0)) return null
  if (!(pairVolume24 > 0)) return 0
  return pairVolume24 / tokenVolume24
}

function flowIsRepresentative(flow: TokenFlow, share: number | null): boolean {
  const h24 = flow.h24
  if (!h24 || h24.buys + h24.sells < FLOW_MIN_TRADES) return false
  // A null share means no independent volume exists to compare against, so
  // DexScreener's pool is the only market we can see and the trade floor above
  // is the whole test.
  return share == null || share >= FLOW_MIN_VOLUME_SHARE
}

/**
 * The share as the panel should print it, or undefined when it should print
 * nothing. A ratio above 1 means the two sources disagree about what this token
 * traded, and the honest response to that is to show no figure rather than to
 * round a contradiction up to "~all".
 */
function displayableShare(share: number | null): number | undefined {
  if (share == null) return undefined
  if (share <= 0 || share > 1.05) return undefined
  return Math.min(1, share)
}

function readFlow(pair: any): TokenFlow | undefined {
  const txns = pair?.txns
  if (!txns) return undefined

  const flow: TokenFlow = {}
  let any = false

  for (const key of ['m5', 'h1', 'h6', 'h24'] as const) {
    const w = txns[key]
    if (!w) continue
    const buys = typeof w.buys === 'number' ? w.buys : 0
    const sells = typeof w.sells === 'number' ? w.sells : 0
    // A window with no trades at all carries no information, and rendering it
    // would put an even split on screen where there was simply nothing.
    if (buys + sells <= 0) continue
    flow[key] = { buys, sells }
    any = true
  }

  return any ? flow : undefined
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

    // Captured before the volume fallback below can overwrite it with this very
    // pair's volume. Judging the pool against a number the pool supplied is not
    // a test of anything.
    const independentVolume24 = token.total_volume

    const fdv = pair.fdv ?? pair.marketCap
    const liquidity = pair.liquidity?.usd

    // DexScreener is the PRICE AUTHORITY for these tokens: it reads the pool
    // itself, so it is fresher than CoinGecko's aggregate. Without this, the
    // 5-minute full refresh kept reverting the fast lane's live pool prices
    // back to CoinGecko's staler ones and values flapped between sources.
    const pairPrice = parseFloat(pair.priceUsd)
    if (pairPrice > 0) adoptPoolPrice(token, pairPrice, pair)
    if (typeof pair.priceChange?.h24 === 'number') {
      token.price_change_percentage_24h = pair.priceChange.h24
    }

    // Fill the 1H chip only where nothing filled it already.
    //
    // Unlike the 24h price above, this is NOT an upgrade. CoinGecko's hourly
    // move covers every venue the token trades on; DexScreener's covers the
    // one pool this response describes. For a token listed on CoinGecko the
    // aggregate is the better number and overwriting it would be a quiet
    // downgrade. The tokens that gain something here are the DEX-only ones,
    // PRVX and DEVC, which have no CoinGecko listing at all and whose 1H chip
    // was simply blank.
    if (
      token.price_change_percentage_1h == null &&
      typeof pair.priceChange?.h1 === 'number'
    ) {
      token.price_change_percentage_1h = pair.priceChange.h1
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

    // Last, because it is judged against total_volume and the fallback above
    // may have just set it.
    const pairVolume24 = pair.volume?.h24 ?? 0
    const flow = readFlow(pair)
    const share = poolVolumeShare(pairVolume24, independentVolume24)
    if (flow && flowIsRepresentative(flow, share)) {
      token.flow = flow
      token.flowSource = pair.dexId || undefined
      token.flowPoolShare = displayableShare(share)
    } else {
      // Assign rather than skip. withLastGood can hand back the very objects
      // already on screen, so a token that no longer qualifies has to lose its
      // flow rather than keep whatever an earlier cycle wrote.
      token.flow = undefined
      token.flowSource = undefined
      token.flowPoolShare = undefined
    }
  }

  if (filled > 0) {
    console.log(`[CryptoDUST] DexScreener added FDV/liquidity for ${filled} PulseChain token(s).`)
  }
  return filled
}

/**
 * Pool depth and order flow for the by-choice tokens, read from Ethereum.
 *
 * Deliberately a separate pass rather than a chain argument on the one above:
 * that function is the PulseChain price authority and overwrites price and 24h
 * move from the pool it finds. Routing an Ethereum token through it would be one
 * refactor away from the exact accident the comment on the address map warns
 * about, so this one is kept small and writes nothing that CoinGecko already
 * answered — no price, and volume and FDV only where the value is missing.
 *
 * The chainId check is not ceremony. The same contract exists on PulseChain, and
 * a route that answered with the fork's pool would put pHEX's numbers on the
 * Ethereum row, which is the one failure this whole arrangement is built to
 * avoid.
 */
async function backfillFromEthereumPools(tokens: TokenPrice[]): Promise<number> {
  const targets = tokens.filter(t => ETHEREUM_POOL_TOKENS[t.id])
  if (targets.length === 0) return 0

  let pairs: any[] = []
  try {
    const addresses = targets.map(t => ETHEREUM_POOL_TOKENS[t.id])
    const res = await fetchDexScreener(
      `https://api.dexscreener.com/tokens/v1/ethereum/${addresses.join(',')}`
    )
    if (!res.ok) {
      console.warn(`[DexScreener] ethereum batch failed: ${res.status}`)
      return 0
    }
    const data = await res.json()
    pairs = Array.isArray(data) ? data : []
  } catch (error) {
    console.warn('[DexScreener] ethereum batch threw:', error)
    return 0
  }

  const deepest = new Map<string, any>()
  for (const pair of pairs) {
    if (pair?.chainId !== 'ethereum') continue
    const key = pair?.baseToken?.address?.toLowerCase()
    if (!key) continue
    const current = deepest.get(key)
    if (!current || (pair.liquidity?.usd || 0) > (current.liquidity?.usd || 0)) {
      deepest.set(key, pair)
    }
  }

  let filled = 0
  for (const token of targets) {
    const pair = deepest.get(ETHEREUM_POOL_TOKENS[token.id].toLowerCase())
    if (!pair) continue

    // Read before the fallback below can replace it with this pair's own volume:
    // a pool judged against a denominator it supplied is not judged at all.
    const independentVolume24 = token.total_volume

    if ((pair.liquidity?.usd ?? 0) > 0) token.liquidity = pair.liquidity.usd
    if ((token.fdv ?? 0) <= 0 && (pair.fdv ?? pair.marketCap ?? 0) > 0) {
      token.fdv = pair.fdv ?? pair.marketCap
    }
    if ((token.total_volume ?? 0) <= 0 && (pair.volume?.h24 ?? 0) > 0) {
      token.total_volume = pair.volume.h24
    }
    token.dexSource = pair.dexId || 'dexscreener'

    const flow = readFlow(pair)
    const share = poolVolumeShare(pair.volume?.h24, independentVolume24)
    // The same test every other pool on the site has to pass. eHEX trades on
    // centralised venues too, so one Uniswap pair is a smaller slice of its day
    // than a PulseX pair is of a PulseChain token's, and it is allowed to say so
    // only when it carries enough of the volume to mean anything.
    if (flow && flowIsRepresentative(flow, share)) {
      token.flow = flow
      token.flowSource = pair.dexId || undefined
      token.flowPoolShare = displayableShare(share)
    }

    filled++
  }

  return filled
}

// =====================================================
// SEVEN-DAY HISTORY, FETCHED PER COIN
//
// The chart lives in the detail panel, which shows exactly one coin at a time.
// Asking for sparkline_in_7d on the list calls filled it for all 861 at once
// and cost about 2.3 MB every five-minute cycle, for a picture the visitor was
// only ever going to see one of. This fetches it when a coin is opened.
//
// Cached for the session and deduplicated in flight, so reopening a coin is
// free and a double click is one request. The proxy's edge cache means a
// popular coin costs the API roughly one request a minute across every
// visitor, not one per visitor.
// =====================================================
const historyCache = new Map<string, number[]>()
const historyInFlight = new Map<string, Promise<number[] | null>>()

/**
 * The same fetch the chart uses, exposed so the share card can draw the same
 * line. Shares the cache, so opening a coin and then making its card is one
 * request, not two.
 */
export async function getCoinHistory(id: string): Promise<number[] | null> {
  return fetchCoinHistory(id)
}

async function fetchCoinHistory(id: string): Promise<number[] | null> {
  const cached = historyCache.get(id)
  if (cached) return cached

  const pending = historyInFlight.get(id)
  if (pending) return pending

  const run = (async (): Promise<number[] | null> => {
    try {
      const url =
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd` +
        `&ids=${encodeURIComponent(id)}&sparkline=true`
      const res = await fetchCoinGecko(url, { usePulseKey: true })
      if (!res.ok) return null

      const data = await res.json()
      const raw = Array.isArray(data) ? data[0]?.sparkline_in_7d?.price : null
      if (!Array.isArray(raw)) return null

      const points = (raw as unknown[]).filter(
        (n): n is number => typeof n === 'number' && Number.isFinite(n)
      )
      if (points.length === 0) return null

      historyCache.set(id, points)
      return points
    } catch {
      return null
    } finally {
      historyInFlight.delete(id)
    }
  })()

  historyInFlight.set(id, run)
  return run
}

/**
 * Seven days of closes for one coin.
 *
 * `pending` matters as much as the data. Without it the panel rendered no chart
 * at all for the couple of hundred milliseconds the fetch took, then grew a
 * 56-pixel block, shoving everything below it down — and on the phone, where
 * the sheet is anchored to the bottom edge, that jerks the whole panel. The
 * caller reserves the space while this is true.
 *
 * The DEX-only stubs have no CoinGecko listing to ask, so they are never
 * requested and never reserve space either.
 */
export function useCoinHistory(coin: TokenPrice | null | undefined): {
  history: number[] | undefined
  pending: boolean
} {
  const [history, setHistory] = useState<number[] | undefined>(undefined)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!coin || coin.dexOnly) {
      setHistory(undefined)
      setPending(false)
      return
    }

    const cached = historyCache.get(coin.id)
    if (cached) {
      setHistory(cached)
      setPending(false)
      return
    }

    // Cleared first, so the previous coin's line never lingers under a new name.
    setHistory(undefined)
    setPending(true)

    let alive = true
    void fetchCoinHistory(coin.id).then(points => {
      if (!alive) return
      if (points) setHistory(points)
      setPending(false)
    })
    return () => {
      alive = false
    }
  }, [coin?.id, coin?.dexOnly])

  return { history, pending }
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
  /**
   * The tab's ledger for this cycle, so the reader can see the checking rather
   * than take it on trust: how many coins were compared against their own
   * pool, how many of those had their source figure replaced because the two
   * disagreed past PRICE_SERIES_BROKEN_GAP, how many were left off because
   * they could not be checked and looked broken, and how many the visiting-
   * token filter removed for not being this chain's own coin. Counts, never
   * dollars; absent on a tab that does not run the check.
   */
  checked?: number
  repaired?: number
  withheld?: number
  filtered?: number
}

const EXTRA_ECOSYSTEMS = [
  // `chain` is DexScreener's own id for the chain, which is not always
  // CoinGecko's: the BNB chain is "binance-smart-chain" to one and "bsc" to
  // the other. It is what api/token-addresses and the pair lookup both take.
  // `nativeIsOwn` is false for Base alone: its gas token is Ethereum's ether,
  // not an asset Base issued, so an Ethereum staking derivative arriving on
  // Base is still an import. Solana, BNB and PulseChain each mint their own.
  { key: 'base', label: 'Base', category: 'base-ecosystem', limit: 100, chain: 'base', native: 'ETH', nativeIsOwn: false },
  { key: 'solana', label: 'Solana', category: 'solana-ecosystem', limit: 100, chain: 'solana', native: 'SOL', nativeIsOwn: true },
  { key: 'bnb', label: 'BNB', category: 'binance-smart-chain', limit: 100, chain: 'bsc', native: 'BNB', nativeIsOwn: true },
]

/**
 * Every chain tab this app intends to build, in the order they appear.
 *
 * Exported so the tab strip can be drawn complete on the first paint. The tabs
 * used to be derived from the sections that had actually arrived, which was
 * fine while nothing rendered until everything was ready — but now that the top
 * 500 go up after one round trip, deriving them meant three tabs appearing ten
 * seconds later and the strip growing under the reader's hand.
 *
 * What is intended and what has arrived are different questions, so they now
 * have different answers: this list draws the strip, and `sections` decides
 * which of them have coins behind them yet.
 */
export const ECOSYSTEM_TABS: Array<{ key: string; label: string }> = [
  { key: 'pulsechain', label: 'PulseChain' },
  ...EXTRA_ECOSYSTEMS.map(e => ({ key: e.key, label: e.label })),
]

// =====================================================
// KEEPING EACH CHAIN TAB TO ITS OWN COINS
//
// CoinGecko's "<chain>-ecosystem" categories answer a different question from
// the one these tabs ask. They list every asset that EXISTS on a chain, so the
// BNB tab arrived carrying Binance-Peg XRP, DOGE, ADA, SOL, SHIB, LTC and ZEC,
// and Base and Solana both opened on Wrapped Bitcoin. Those are travelling
// representations of assets that live somewhere else, and because they carry
// the market cap of the original they sort straight to the top and push the
// chain's actual projects off the tab.
//
// Three signals separate a chain's own coins from its imports, and they are
// applied in this order.
// =====================================================

/** Explicitly an import: it says so in the name CoinGecko publishes. */
const IMPORTED_TOKEN = /\b(bridged|binance[- ]peg|pegged)\b/i

/**
 * A derivative of some other asset. Which asset matters: staked SOL on Solana
 * is one of that chain's biggest native products, while staked BTC anywhere is
 * a visitor. Only cut when the underlying is not the chain's own coin.
 */
const DERIVATIVE_TOKEN = /\b(wrapped|staked|restaked)\b/i

/** Tickers shaped like a stand-in for a named asset: cbBTC, jitoSOL, weETH. */
const STAND_IN_TICKERS: Array<[string, RegExp, RegExp]> = [
  ['BTC', /BTC$/, /\bbitcoin\b/i],
  ['ETH', /ETH$/, /\bethereum\b/i],
  ['SOL', /SOL$/, /\bsolana\b/i],
]

/**
 * A token on this many chains is, by construction, a project of none of them.
 * WBTC is on 20, sUSDe and uniBTC on 27.
 *
 * Kept tight at 5, because loosening it to 6 let Syrup USDC and cbETH back onto
 * the Base tab, and those hundred slots are finite: the readmitted wrappers
 * simply pushed Zora and Degen off the bottom. The handful of real projects
 * that have bridged themselves this widely are rescued by name below instead.
 */
const MAX_CHAINS_FOR_ECOSYSTEM = 5

/**
 * A project that carries the chain in its own identity belongs to it, however
 * far it has bridged. Degen is deployed on five chains but its CoinGecko id is
 * `degen-base` and it is the Base memecoin; the chain-count rule alone would
 * throw out the tab's own flagship.
 *
 * Checked AFTER the import and derivative tests, so `usd-coin-pulsechain` and
 * `binance-peg-xrp` are already gone and cannot be rescued by the chain word
 * sitting in their names.
 */
const CHAIN_WORDS: Record<string, RegExp> = {
  ETH: /(^|-)base(-|$)/i,
  SOL: /(^|-)solana(-|$)/i,
  BNB: /(^|-)(bnb|binance)(-|$)/i,
  PLS: /(^|-)pulse(chain)?(-|$)/i,
}


/**
 * True when this coin is a visitor on the given chain rather than one of its
 * own. `chains` is the number of deployments, from api/token-addresses.
 */
function isVisitingToken(
  coin: TokenPrice,
  native: string,
  chains: number,
  nativeIsOwn: boolean
): boolean {
  const symbol = coin.symbol.toUpperCase()
  const name = coin.name || ''

  // The chain's own coin and its canonical wrapper always belong.
  if (symbol === native || symbol === `W${native}`) return false

  /**
   * Whether a derivative of the native asset is one of this chain's own
   * products. On Solana, PulseChain and BNB it plainly is: staked SOL is
   * Solana's largest native category. On Base it is not, because Base's gas
   * token is not Base's asset, it is Ethereum's ether arriving over a bridge,
   * so an Ethereum liquid-staking token on Base is an import twice over.
   */
  const ofNative =
    nativeIsOwn &&
    (symbol.endsWith(native) || new RegExp(String.raw`\b${native}\b`, 'i').test(name))

  if (IMPORTED_TOKEN.test(name)) return true
  if (DERIVATIVE_TOKEN.test(name) && !ofNative) return true

  // A ticker ending in BTC/ETH/SOL is weak evidence on its own: "Where Did The
  // ETH Go?" is a PulseChain memecoin. It needs a second deployment, or the
  // asset spelled out in the name — which is what catches Syntetika Bitcoin, a
  // single-chain BTC wrapper the old chains >= 2 gate waved straight through.
  if (!ofNative) {
    for (const [asset, ticker, fullName] of STAND_IN_TICKERS) {
      if (asset === native || !ticker.test(symbol)) continue
      if (chains >= 2 || fullName.test(name)) return true
    }
  }

  if (chains < MAX_CHAINS_FOR_ECOSYSTEM) return false

  const chainWord = CHAIN_WORDS[native]
  if (chainWord && (chainWord.test(coin.id) || chainWord.test(name))) return false

  return true
}

/** id -> {address on this chain, number of chains it is deployed on} */
type ChainTokenInfo = Map<string, { address: string; chains: number }>

/**
 * What a lookup actually established.
 *
 * `asked` is the set of ids the server answered for. It matters because an
 * absent id means one of three different things — the coin has no contract on
 * this chain, the request for its chunk failed, or it was never asked about —
 * and only the first is a reason to drop a coin from a tab. Without this the
 * filter turned one failed chunk into 120 silently missing coins.
 */
interface ChainLookup {
  info: ChainTokenInfo
  asked: Set<string>
}

/**
 * One lookup that serves both jobs: which coins belong on this tab, and where
 * to find their pool. Failing here returns an empty map, which leaves the tab
 * exactly as CoinGecko sent it — unfiltered, but never empty.
 */
async function resolveChainTokens(ids: string[], chain: string): Promise<ChainLookup> {
  const info: ChainTokenInfo = new Map()
  const asked = new Set<string>()
  if (ids.length === 0) return { info, asked }

  const chunks: string[][] = []
  // MAX_IDS in the function is 150; stay under it and keep the URL short.
  for (let i = 0; i < ids.length; i += 120) chunks.push(ids.slice(i, i + 120))

  const results = await Promise.all(
    chunks.map(async chunk => {
      try {
        const res = await fetchWithTimeout(
          `/api/token-addresses?chain=${chain}&ids=${encodeURIComponent(chunk.join(','))}`,
          ENRICH_FETCH_TIMEOUT_MS
        )
        if (!res.ok) return null
        return { chunk, map: (await res.json()) as Record<string, { a: string; n: number }> }
      } catch {
        return null
      }
    })
  )

  let failed = 0
  for (const result of results) {
    // A chunk that failed contributes nothing to `asked`, so its coins keep the
    // benefit of the doubt instead of being filtered out on missing evidence.
    if (!result) { failed++; continue }
    for (const id of result.chunk) asked.add(id)
    for (const [id, entry] of Object.entries(result.map)) {
      if (entry && typeof entry.a === 'string') {
        info.set(id, { address: entry.a, chains: typeof entry.n === 'number' ? entry.n : 1 })
      }
    }
  }

  if (failed > 0) {
    console.warn(
      `[CryptoDUST] ${chain} token lookup: ${failed}/${chunks.length} chunks failed, ` +
      'those coins are left unfiltered.'
    )
  }

  return { info, asked }
}

/**
 * Adds order-flow counts to a whole ecosystem tab.
 *
 * PulseChain gets its flow from a hand-kept map of 35 contract addresses. That
 * does not scale to three more chains, so these tabs resolve their addresses
 * through api/token-addresses, which answers with just the coins asked for.
 * Measured coverage on the current tabs: 100/100 Base, 99/100 Solana and 98/100
 * BNB resolve to an address, and 80, 81 and 83 of those have live 24h counts.
 *
 * Deliberately narrower than the PulseChain backfill: this writes `flow` and
 * nothing else. CoinGecko is the authority for price, market cap and volume on
 * these tabs and already serves them well; quietly repointing any of that at a
 * single pool would be a regression dressed up as a feature.
 *
 * Fails closed. Any error anywhere leaves the tab exactly as it was, which the
 * UI already renders correctly as "no flow data for this token".
 */
/**
 * When `priceAuthority` is set, the pool's own price and 24h move replace
 * CoinGecko's for tokens whose pool is deep enough to be their real market.
 *
 * Only PulseChain passes this, and it is not a preference — it is a measured
 * repair. On the day this was written CoinGecko had 26 of 110 PulseChain coins
 * showing moves between +35,000% and +45,000%, and 32 of 103 priced more than
 * 5x away from their own pool. The error was systematic: PINU, URMOM, PUPPERS,
 * BLAST and WHETH were all off by almost exactly the same factor, ~337x, which
 * is a broken conversion upstream rather than a market.
 *
 * The other three tabs measured clean — zero wild moves, and price disagreement
 * on 1 to 5 coins out of ~86, which look like genuinely thin bridged pools.
 * Overriding there would replace a good aggregate with a worse sample, so they
 * stay on CoinGecko.
 */
async function backfillEcosystemFlow(
  tokens: TokenPrice[],
  chain: string,
  known: ChainTokenInfo,
  priceAuthority = false
): Promise<number> {
  if (tokens.length === 0) return 0

  // The addresses were already resolved when the tab was filtered, so this
  // reuses them rather than asking again.
  const targets = tokens.filter(t => known.has(t.id))
  if (targets.length === 0) return 0

  const byAddress = new Map(targets.map(t => [known.get(t.id)!.address.toLowerCase(), t]))

  const batches: string[][] = []
  const list = targets.map(t => known.get(t.id)!.address)
  for (let i = 0; i < list.length; i += DEXSCREENER_BATCH_SIZE) {
    batches.push(list.slice(i, i + DEXSCREENER_BATCH_SIZE))
  }

  let groups: any[][]
  try {
    groups = await Promise.all(
      batches.map(async addrs => {
        const res = await fetchDexScreener(
          `https://api.dexscreener.com/tokens/v1/${chain}/${addrs.join(',')}`
        )
        if (!res.ok) return []
        const data = await res.json()
        return Array.isArray(data) ? data : []
      })
    )
  } catch (error) {
    console.warn(`[CryptoDUST] ${chain} flow fetch failed:`, error)
    return 0
  }

  // Keep the deepest pair per token, same rule the PulseChain backfill uses, so
  // "deepest pool" means the same thing on every tab.
  const deepest = new Map<string, any>()
  for (const pair of groups.flat()) {
    if (pair?.chainId && pair.chainId !== chain) continue
    const key = pair?.baseToken?.address?.toLowerCase()
    if (!key || !byAddress.has(key)) continue
    const current = deepest.get(key)
    if (!current || (pair.liquidity?.usd || 0) > (current.liquidity?.usd || 0)) {
      deepest.set(key, pair)
    }
  }

  // Cleared first, for the same reason as the PulseChain path: on a cycle where
  // the category fetch failed, withLastGood returns the objects that are already
  // rendered, and a stale ring outliving the pool that justified it is worse
  // than no ring.
  for (const token of targets) {
    token.flow = undefined
    token.flowSource = undefined
    token.flowPoolShare = undefined
  }

  let filled = 0
  for (const [key, pair] of deepest) {
    const token = byAddress.get(key)
    if (!token) continue
    const pairVolume24 = pair.volume?.h24 ?? 0
    // total_volume is CoinGecko's here and stays CoinGecko's: this function
    // never writes it, so it is a genuinely independent denominator.
    const share = poolVolumeShare(pairVolume24, token.total_volume)

    if (priceAuthority) {
      const pairPrice = parseFloat(pair.priceUsd)
      const liquidity = pair.liquidity?.usd ?? 0
      // A pool has to be a market before it is allowed to set a price. Without
      // this a dead pool holding a few dollars could overwrite a good figure.
      if (pairPrice > 0 && liquidity >= PRICE_AUTHORITY_MIN_LIQUIDITY_USD) {
        // Takes the price from the pool and, where the two were far enough apart
        // to be a fault rather than a spread, restates the longer windows that
        // were built on the price it just replaced.
        const priceGap = adoptPoolPrice(token, pairPrice, pair)

        if (typeof pair.priceChange?.h24 === 'number') {
          token.price_change_percentage_24h = pair.priceChange.h24
        } else if (Number.isFinite(priceGap) && priceGap > 5) {
          // The pool priced it but has no 24h move to report, and CoinGecko's
          // is derived from a series that was out by more than 5x. Neither
          // source can describe this coin's day, so it is marked and dropped
          // rather than shown with an invented or a known-false percentage —
          // the same rule this file already applies to an unpriced DEX stub.
          token.unpriceable = true
        }

        if ((token.liquidity ?? 0) <= 0) token.liquidity = liquidity
        if ((token.fdv ?? 0) <= 0 && (pair.fdv ?? pair.marketCap ?? 0) > 0) {
          token.fdv = pair.fdv ?? pair.marketCap
        }
        if (!token.dexSource) token.dexSource = pair.dexId || 'dexscreener'
      }
    }

    const flow = readFlow(pair)
    if (!flow) continue
    if (!flowIsRepresentative(flow, share)) continue
    token.flow = flow
    token.flowSource = pair.dexId || undefined
    token.flowPoolShare = displayableShare(share)
    filled++
  }

  return filled
}

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
  /** When this build completed. The header's age is measured from here, never from render time. */
  builtAt?: number
  /**
   * Set when any primary source came back empty and its previous result was
   * served in its place: the time that stale data was actually fetched. The
   * header shows CACHED with this age instead of LIVE. fetchAllCoins never
   * throws — a failed source is absorbed by the last-good cache — so SWR's own
   * error flag cannot carry this; it has to be reported from inside the build.
   */
  staleAsOf?: number
}

/**
 * @param onPartial called once, with the top 500 alone, the moment CoinGecko has
 * answered — long before the DexScreener and CoinPaprika work that follows. See
 * the call site for why it is safe to hand this list over early.
 */
async function fetchAllCoins(onPartial?: (partial: MarketData) => void): Promise<MarketData> {
  // Each build starts fresh; withLastGood sets this if any source falls back.
  staleDataAt = null
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

    // Hand the main list over NOW, and let the rest of this function keep going.
    //
    // Everything below this line is enrichment: pool depth, order flow, the
    // PulseChain price repair. On a bad afternoon at DexScreener that is four
    // serial rounds of six-second timeouts in front of a first paint that the
    // top 500 do not need at all — the site sat on "Loading market data" past
    // thirty seconds with these five hundred coins already sitting in memory.
    //
    // Safe because mainSection is FINISHED here, not a work in progress. The
    // filters and the HAC/HACD splice at 498 have run, so the offsets the tabs
    // are cut on are already final, and every pass after this point works on
    // limitedPulseTail or a per-ecosystem list — the tail only ever accepts ids
    // that are NOT in `seen`, so no object in this array is even reachable. It
    // is copied rather than passed by reference so that stays true no matter
    // what a later edit does.
    //
    // It also cannot leak an unrepaired PulseChain coin: every coin the repair
    // and the drop loop touch lives at index 500 or beyond, and this publishes
    // no sections at all, so the PulseChain tab renders its own empty state
    // until the real build lands.
    onPartial?.({ tokens: mainSection.slice(), sections: [] })

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

    // Same treatment as the other chain tabs: CoinGecko's pulsechain-ecosystem
    // category carries the bridged WETH, USDC, USDT, WBTC and the bridged copy
    // of HEX alongside PulseChain's own coins. The native HEX, WPLS, VPLS and
    // "Where Did The ETH Go?" all survive this; the bridged HEX does not.
    const pulseKnown = await resolveChainTokens(pulseTail.map(t => t.id), 'pulsechain')
    const ownPulse = pulseTail.filter(t => {
      // Never judged on evidence we do not have: a coin the lookup was not
      // asked about, or whose chunk failed, stays on the tab.
      // On the tab by the owner's decision rather than by contract. Checked
      // before the address evidence, because the evidence would say no: the
      // Ethereum HEX has no PulseChain deployment for the lookup to find, so
      // it falls into the `!info` branch below and is dropped every cycle with
      // nothing on screen and only a count in the console to show for it.
      if (PULSE_TAB_BY_CHOICE.has(t.id)) return true
      if (!pulseKnown.asked.has(t.id)) return true
      const info = pulseKnown.info.get(t.id)
      if (!info) return t.symbol.toUpperCase() === 'PLS'
      return !isVisitingToken(t, 'PLS', info.chains, true)
    })

    if (pulseTail.length > ownPulse.length) {
      console.log(
        `[CryptoDUST] PulseChain: dropped ${pulseTail.length - ownPulse.length} visiting tokens.`
      )
    }

    // The old limit was 98 while the Pulse sources return ~107, so the tab was
    // silently dropping the smallest coins every load. The cap is now just a
    // sanity bound, and truncation is reported instead of being invisible.
    const PULSE_TAIL_LIMIT = 200
    const limitedPulseTail = ownPulse.slice(0, PULSE_TAIL_LIMIT)

    if (ownPulse.length > PULSE_TAIL_LIMIT) {
      console.warn(
        `[CryptoDUST] PulseChain tab truncated: ${ownPulse.length} coins found, showing ${PULSE_TAIL_LIMIT}.`
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
    // The Ethereum pass runs alongside rather than after. It is the only one that
    // touches 'hex', which appears in neither of the other two maps, so there is
    // nothing here for the two to race over — and a slow afternoon at DexScreener
    // then costs the first render one wait instead of two.
    await Promise.all([
      backfillFromDexScreener(limitedPulseTail),
      // Neither pass beside it can see a token whose pool is on another chain.
      backfillFromEthereumPools(limitedPulseTail),
    ])

    // The native coin, checked through its wrapper. PLS has no contract, so no
    // pool can be asked about it directly, and it was the one coin on the tab
    // that was never compared against anything — while being the asset most of
    // the tab is priced through. WPLS is PLS one-for-one by construction, so
    // once the pass above has checked WPLS against its own pool, that reading
    // is the PLS reading, and it goes through the same adoption (second
    // opinion kept, longer windows restated only past the break threshold) as
    // every other coin. The pool's terms are carried across so the row can say
    // which pool it was.
    {
      const pls = limitedPulseTail.find(t => t.id === 'pulsechain')
      const wpls = limitedPulseTail.find(t => t.id === 'wrapped-pulse-wpls')
      if (pls && wpls?.poolChecked && wpls.current_price > 0) {
        adoptPoolPrice(pls, wpls.current_price, {
          priceChange: { h1: wpls.price_change_percentage_1h, h24: wpls.price_change_percentage_24h },
          priceNative: wpls.priceNative,
          quoteToken: wpls.poolQuote ? { symbol: wpls.poolQuote } : undefined,
        })
        if (typeof wpls.price_change_percentage_24h === 'number') {
          pls.price_change_percentage_24h = wpls.price_change_percentage_24h
        }
        if ((wpls.liquidity ?? 0) > 0) pls.liquidity = wpls.liquidity
        if (wpls.dexSource) pls.dexSource = wpls.dexSource
      }
    }

    // The pass above only knows the 35 hand-mapped addresses. This one covers
    // the whole tab from the lookup already done for the visitor filter, and it
    // is where the CoinGecko price breakage actually gets repaired: 32 of 103
    // PulseChain coins were priced more than 5x away from their own pool, and
    // 26 of them were showing moves above +35,000%.
    const repaired = await backfillEcosystemFlow(
      limitedPulseTail,
      'pulsechain',
      pulseKnown.info,
      true
    )
    if (repaired > 0) {
      console.log(`[CryptoDUST] PulseChain: ${repaired} token(s) priced from their own pool.`)
    }

    // A DEX-only stub is only real once DexScreener has priced it. If the call
    // failed or the pool vanished, drop it rather than render a $0 planet.
    // Counted around the loop rather than inside each branch, so a new reason
    // to withhold a coin cannot forget to count itself.
    const beforeWithholding = limitedPulseTail.length
    for (let i = limitedPulseTail.length - 1; i >= 0; i--) {
      const t = limitedPulseTail[i]
      if (DEX_ONLY_PULSE_IDS.has(t.id) && !(t.current_price > 0)) {
        console.warn(`[CryptoDUST] ${t.symbol} has no live DexScreener price this cycle, omitting it.`)
        limitedPulseTail.splice(i, 1)
      } else if (t.unpriceable) {
        console.warn(`[CryptoDUST] ${t.symbol}: no trustworthy 24h move from either source, omitting it.`)
        limitedPulseTail.splice(i, 1)
      } else if (
        !t.poolChecked &&
        Math.abs(t.price_change_percentage_24h || 0) > IMPLAUSIBLE_24H_MOVE
      ) {
        // A figure this size is the known CoinGecko breakage, and this coin is
        // one the pool comparison never reached — no pool of its own, or the
        // source was down for the cycle. Found the hard way: with DexScreener
        // timing out on every call, the repair could not run and MONAT rendered
        // at +26,271%. The whole point of the repair is that this number does
        // not reach the screen, so when it cannot be checked the coin waits for
        // a cycle that can rather than being shown unverified.
        console.warn(
          `[CryptoDUST] ${t.symbol}: ${Math.round(t.price_change_percentage_24h)}% with no pool to check it against, omitting it.`
        )
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
    limitedPulseTail.sort((a, b) => {
      // Five the owner wants held at the top in a fixed order, whatever the
      // ranking would otherwise do with them. Everything below them still sorts
      // on its own merits.
      //
      // Pinned HERE rather than in the list component so the tab reads the same
      // on the phone and on the desktop table, and so the section boundaries —
      // absolute offsets into this array — are computed after the order is final.
      //
      // The filter buttons above the list still win: Gainers, Losers, Volume and
      // Favs are applied to the page slice afterwards, and a pin that survived
      // them would leave those buttons doing nothing at the top of the screen.
      const pa = PULSE_PINNED_IDS.indexOf(a.id)
      const pb = PULSE_PINNED_IDS.indexOf(b.id)
      if (pa !== -1 && pb !== -1) return pa - pb
      if (pa !== -1) return -1
      if (pb !== -1) return 1
      return rank(b) - rank(a)
    })

    // First 500 (with HAC/HACD at 498-499) + every Pulse coin the sources returned.
    const result = [...mainSection, ...limitedPulseTail]
    const sections: EcosystemSection[] = [
      {
        key: 'pulsechain',
        label: 'PulseChain',
        start: mainSection.length,
        end: result.length,
        // The tab's ledger: what was checked, corrected, withheld and filtered
        // this cycle. Counts of coins, so the reader sees the checking happen
        // instead of taking a clean-looking tab on trust.
        checked: limitedPulseTail.filter(t => t.poolChecked).length,
        repaired: limitedPulseTail.filter(t => t.priceRepaired).length,
        withheld: beforeWithholding - limitedPulseTail.length,
        filtered: pulseTail.length - ownPulse.length,
      },
    ]

    // Extra galaxy tabs (Base, Solana, ...) — fetched sequentially to stay
    // gentle on the rate limit; each dedups against everything already shown.
    const flowJobs: Promise<void>[] = []
    for (const eco of EXTRA_ECOSYSTEMS) {
      const fetched = await withLastGood(`${eco.label} ecosystem`, () =>
        fetchEcosystemCategory(eco.category, eco.label)
      )
      const shown = new Set(result.map(t => t.id))
      const candidates = fetched.filter(t => !shown.has(t.id))

      // Resolved before the tab is cut to size, so that dropping the visitors
      // pulls real projects up from further down the category rather than
      // leaving holes where they were.
      const known = await resolveChainTokens(candidates.map(t => t.id), eco.chain)

      const own = candidates.filter(t => {
        // Never judged on evidence we do not have.
        if (!known.asked.has(t.id)) return true
        const info = known.info.get(t.id)
        // No contract on this chain at all means it is in the category only
        // because CoinGecko files these loosely. The chain's own coin is the
        // exception: a native coin has no contract by definition.
        if (!info) return t.symbol.toUpperCase() === eco.native
        return !isVisitingToken(t, eco.native, info.chains, eco.nativeIsOwn)
      })

      const dropped = candidates.length - own.length
      if (dropped > 0) {
        console.log(`[CryptoDUST] ${eco.label}: dropped ${dropped} visiting tokens.`)
      }

      const fresh = own.slice(0, eco.limit)
      if (fresh.length === 0) continue
      const start = result.length
      result.push(...fresh)
      // These tabs do not adopt pool prices, so checked/repaired/withheld stay
      // absent rather than read as zero-of-many; only the visitor filter is
      // reported, because it is the one thing this tab does to its list.
      sections.push({ key: eco.key, label: eco.label, start, end: result.length, filtered: dropped })

      // Collected rather than awaited here: three chains awaited in sequence
      // put three serial round trips in front of first paint and they have no
      // reason to wait for each other. Still awaited before this function
      // returns, because `fresh` is already inside the array it returns and
      // mutating it afterwards would be a write into rendered state.
      flowJobs.push(
        backfillEcosystemFlow(fresh, eco.chain, known.info).then(filled => {
          if (filled > 0) {
            console.log(`[CryptoDUST] order flow for ${filled}/${fresh.length} ${eco.label} tokens.`)
          }
        })
      )
    }

    await Promise.all(flowJobs)

    console.log(
      `[CryptoDUST] ${result.length} coins ready (${mainSection.length} main + ` +
      sections.map(s => `${s.end - s.start} ${s.label}`).join(' + ') + ').'
    )
    return { tokens: result, sections, builtAt: Date.now(), staleAsOf: staleDataAt ?? undefined }
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
  change1h?: number
  liquidity?: number
  flow?: TokenFlow
  pairVolume24?: number
  flowSource?: string
  /** Carried with the price so a 60-second refresh never prints a stale unit under a fresh number. */
  poolQuote?: string
  priceNative?: number
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
      change1h: typeof pair.priceChange?.h1 === 'number' ? pair.priceChange.h1 : undefined,
      liquidity: liquidity > 0 ? liquidity : undefined,
      // Read here as well as in the full backfill, so the ring tracks the pool
      // at the 60-second cadence rather than going stale for five minutes.
      flow: readFlow(pair),
      pairVolume24: pair.volume?.h24 ?? 0,
      flowSource: pair.dexId || undefined,
      poolQuote: typeof pair.quoteToken?.symbol === 'string' && pair.quoteToken.symbol ? pair.quoteToken.symbol : undefined,
      priceNative: parseFloat(pair.priceNative) > 0 ? parseFloat(pair.priceNative) : undefined,
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
    // PLS has no contract for the fast lane to ask about; WPLS's quote is its
    // quote, one-for-one, exactly as the full build mirrors it. flow is not a
    // concern here — the `t.flow &&` guard below refreshes flow only where the
    // build already set it, and it never sets it on PLS.
    const dp = pulse.get(t.id) ?? (t.id === 'pulsechain' ? pulse.get('wrapped-pulse-wpls') : undefined)
    if (dp) {
      return {
        ...t,
        current_price: dp.price,
        price_change_percentage_24h: dp.change24 ?? t.price_change_percentage_24h,
        // Same rule as the full backfill: the existing value wins, because it
        // may be CoinGecko's all-venue figure and this one is a single pool.
        price_change_percentage_1h: t.price_change_percentage_1h ?? dp.change1h,
        liquidity: dp.liquidity ?? t.liquidity,
        // Taken from THIS pair or not at all — never the previous build's. A
        // fresh USD price under a unit or native figure from five minutes ago
        // would read as one observation when it is two, and the pool that won
        // the depth contest can change quote asset between cycles.
        poolQuote: dp.poolQuote,
        priceNative: dp.priceNative,
        // The same representativeness test the full backfill applies. Without
        // it the fast lane would quietly reinstate, sixty seconds later, every
        // unrepresentative pool the backfill had just rejected.
        //
        // The share is REUSED from the last full rebuild rather than recomputed
        // here. Recomputing it divides the pool by a denominator the pool may
        // itself have supplied: PRVX and DEVC have no CoinGecko volume, so the
        // backfill's fallback sets total_volume from this very pair, and the
        // fast lane would then have printed a fabricated "~all" every minute.
        // The rebuild captured the independent figure before that fallback ran,
        // so its answer is the only trustworthy one. It is a 24-hour ratio; it
        // does not need refreshing on a 60-second tick.
        //
        // The three fields move together. flow without its source and its share
        // is a count with no provenance, and the panel would caption this
        // minute's numbers with the last rebuild's label.
        //
        // `t.flow &&` is load-bearing: the fast lane REFRESHES flow, it never
        // introduces it. Without that clause a token the rebuild had rejected
        // for an unrepresentative pool came back sixty seconds later, because
        // a rejected token carries no flowPoolShare and an absent share reads
        // as "no independent volume to check against", which the guard passes.
        ...(dp.flow && t.flow && flowIsRepresentative(dp.flow, t.flowPoolShare ?? null)
          ? {
              flow: dp.flow,
              flowSource: dp.flowSource ?? t.flowSource,
              flowPoolShare: t.flowPoolShare,
            }
          : {}),
      }
    }
    return t
  })
  // A successful tick refreshed the prices most readers look at, so the age
  // the header may show is measured from now, not from the last full build.
  // staleAsOf is carried, not cleared: a good tick refreshes the top 500 and
  // the hand-mapped PulseChain coins, but a stale chain tab stays stale until a
  // full build succeeds, and the header must not say LIVE over it.
  return { tokens, sections: current.sections, builtAt: Date.now(), staleAsOf: current.staleAsOf }
}

// =====================================================
// THE LAST COMPLETE BUILD, KEPT ON THE DEVICE
//
// Until now the only cache was in memory, so a returning visitor saw the boot
// screen and then nothing until the whole chain of calls finished, and a
// CoinGecko outage meant an empty page. The last complete build is now written
// to localStorage after every cycle and read back synchronously on the next
// visit, before any network — measured at ~470 KB for 830 coins, well inside
// the 5 MB the browser allows.
//
// What makes this honest rather than merely fast: the stored build is never
// shown as LIVE. It carries the time it was built, the header says STORED with
// that age beside it, and the moment a fresh build — even the early top-500 —
// arrives it is replaced. Past a day it is not shown at all: a price that old
// is not a price. The per-coin 7-day histories are stripped on write; they are
// fetched on demand and a stale one would be presented as the week.
// =====================================================
const STORE_KEY = 'cryptodust-market-v1'
const STORE_MAX_AGE_MS = 24 * 60 * 60 * 1000

interface StoredBuild {
  v: 1
  savedAt: number
  tokens: TokenPrice[]
  sections: EcosystemSection[]
}

function readStoredBuild(): StoredBuild | undefined {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<StoredBuild>
    if (parsed?.v !== 1 || !Array.isArray(parsed.tokens) || !Array.isArray(parsed.sections)) return undefined
    if (typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > STORE_MAX_AGE_MS) return undefined
    if (parsed.tokens.length < 100) return undefined
    return parsed as StoredBuild
  } catch {
    return undefined
  }
}

function writeStoredBuild(d: MarketData): void {
  try {
    const stored: StoredBuild = {
      v: 1,
      // A build that served a stale source is stored with that source's age,
      // so the next visit's STORED label does not claim freshness it never had.
      savedAt: d.staleAsOf ?? d.builtAt ?? Date.now(),
      tokens: d.tokens.map(t => (t.history7d ? { ...t, history7d: undefined } : t)),
      sections: d.sections,
    }
    localStorage.setItem(STORE_KEY, JSON.stringify(stored))
  } catch {
    // Quota, private mode, or storage disabled: the site simply behaves as it
    // did before this existed.
  }
}

/** "3m", "2h", "1d" — the age of the numbers on screen, for the header. */
export function formatAge(asOf: number | null | undefined): string {
  if (!asOf) return ''
  const s = Math.max(0, Math.round((Date.now() - asOf) / 1000))
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}d`
}

// ==================== MAIN HOOK ====================
export function usePrices() {
  const dataRef = useRef<MarketData | undefined>(undefined)

  /**
   * The top 500, shown while the rest of the build is still running.
   *
   * Held OUTSIDE SWR deliberately. The obvious way to publish early is to call
   * mutate, and the fast lane a few lines down carries the scar from doing
   * exactly that: SWR treats a mutation as fresher than the fetch already in
   * flight and throws that fetch's result away. Its own state cannot collide
   * with the fetch it is racing.
   */
  // Seeded from the device store when there is one, so the first render already
  // has coins in it. `partialKind` remembers what is standing in: a stored build
  // is replaced by the early top-500 (fresh beats stale), and the early publish
  // is taken once per session.
  const partialKind = useRef<'stored' | 'early' | null>(null)
  const storedAt = useRef<number | null>(null)
  const [partial, setPartial] = useState<MarketData | undefined>(() => {
    const stored = readStoredBuild()
    if (!stored) return undefined
    partialKind.current = 'stored'
    storedAt.current = stored.savedAt
    return { tokens: stored.tokens, sections: stored.sections, builtAt: stored.savedAt }
  })

  const { data, error, isLoading, mutate } = useSWR<MarketData>(
    // Key bumped: the cached shape changed from TokenPrice[] to MarketData
    'coingecko-markets-v2',
    () =>
      fetchAllCoins(early => {
        // Only ever for the first paint. Once a complete build exists the
        // partial is ignored below, so setting it again would be a re-render of
        // the whole page every five minutes for nothing. The kind guard is for
        // StrictMode, which runs this twice in development — and it lets the
        // fresh top-500 displace a stored build, never the other way round.
        if (dataRef.current || partialKind.current === 'early') return
        partialKind.current = 'early'
        setPartial(early)
      }),
    {
      refreshInterval: REFRESH_INTERVAL,
      revalidateOnFocus: false,
      dedupingInterval: 60000, // avoid refetching too often
    }
  )

  // Fast lane: 60s price-only updates between the 5-minute full rebuilds
  const lastFastRun = useRef(0)
  useEffect(() => {
    dataRef.current = data
    // Every complete build goes to the device store, so the next visit opens on
    // it. Only complete builds: a partial has no chain tabs and a stored one
    // would just be rewriting itself.
    if (data) writeStoredBuild(data)
  }, [data])

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

  // What is standing in for the feed, and how old it is. `asOf` is the build
  // time of whatever is on screen — never render time, which is the mistake
  // `lastUpdated: Date.now()` used to make.
  const showingStored = !data && !!partial && partialKind.current === 'stored'
  const freshness: 'live' | 'partial' | 'stored' = data ? 'live' : showingStored ? 'stored' : 'partial'
  // A build that served a stale source reports that source's age, not its own
  // completion time: the numbers on screen are as old as their oldest input.
  const asOf = data ? (data.staleAsOf ?? data.builtAt ?? null) : showingStored ? storedAt.current : null
  const stale = !!data?.staleAsOf

  return {
    // The complete build wins the moment it exists, and on every cycle after.
    tokens: data?.tokens ?? partial?.tokens ?? [],
    sections: data?.sections ?? partial?.sections ?? [],
    isLoading,
    error,
    freshness,
    asOf,
    stale,
  }
}

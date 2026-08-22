import type { FlowWindow, TokenFlow } from '../lib/prices'
import { flowShare } from '../lib/prices'

/**
 * Order flow: how many trades went each way, per window.
 *
 * Every number here is a COUNT, and the panel says so on its face. DexScreener
 * publishes no per-side dollar figure, so a bot doing two hundred dust buys
 * outranks one whale sell. Anything that implied dollars — the word "pressure",
 * a directional adjective, a score out of ten — would be inventing a claim the
 * data cannot support, so this component states the two integers and the share
 * they make up, and stops there.
 *
 * The counts also come from the single deepest pool, because that is all the
 * batched endpoint returns. For a token trading across eight venues that is a
 * sample, not a census, which is why the footer names the pool rather than the
 * token.
 */

const WINDOWS: Array<{ key: keyof TokenFlow; label: string }> = [
  { key: 'm5', label: '5M' },
  { key: 'h1', label: '1H' },
  { key: 'h6', label: '6H' },
  { key: 'h24', label: '24H' },
]

/**
 * Below this a window's percentage is noise dressed as a reading: one buy and
 * no sells is "100%". The counts are still shown, because two integers cannot
 * mislead; it is the percentage and the full-width bar that overstate them.
 */
const MIN_TRADES_FOR_PERCENT = 5

function count(n: number): string {
  return n >= 10000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString('en-US')
}

/** The split bar. Width follows the share of trades, not of money. */
function SplitBar({ w, height = 6 }: { w: FlowWindow; height?: number }) {
  const share = flowShare(w)
  if (share == null) return null
  const buyPct = share * 100

  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-white/[0.06]"
      style={{ height }}
    >
      <div className="bg-emerald-400/80" style={{ width: `${buyPct}%` }} />
      <div className="bg-red-400/80" style={{ width: `${100 - buyPct}%` }} />
    </div>
  )
}

export function FlowPanel({
  flow,
  change24h,
  dexSource,
  poolShare,
  compact = false,
}: {
  flow: TokenFlow | undefined
  change24h: number | undefined
  dexSource?: string
  /** The pool's share of the token's 24h volume, 0..1, when it is known. */
  poolShare?: number
  compact?: boolean
}) {
  // No data is rendered as no data. A missing window drawn as an even split
  // would read as balanced trading, which is a claim about the market rather
  // than about our coverage.
  if (!flow) return null

  const present = WINDOWS.filter(w => flow[w.key])
  if (present.length === 0) return null

  const main = flow.h24 ?? flow[present[present.length - 1].key]!
  const mainShare = flowShare(main)
  if (mainShare == null) return null

  /**
   * The one case worth pointing at: the price went one way while the trade
   * count leaned the other. It is phrased as the observation it is, never as
   * a conclusion about what happens next.
   */
  const move = change24h ?? 0
  // Below this a "divergence" is noise. Nine buys against one sell is not a
  // market turning, it is a quiet pool, and pointing at it in amber would give
  // a handful of trades the weight of a trend.
  const MIN_TRADES_TO_REMARK = 50
  const divergence =
    flow.h24 &&
    flow.h24.buys + flow.h24.sells >= MIN_TRADES_TO_REMARK &&
    Math.abs(move) >= 5
      ? move > 0 && mainShare < 0.45
        ? 'Price up, more sells than buys'
        : move < 0 && mainShare > 0.55
          ? 'Price down, more buys than sells'
          : null
      : null

  if (compact) {
    return (
      <div className="col-span-2 border-b border-white/10 pb-1.5">
        <div className="flex justify-between items-center mb-1">
          <span className="text-[#6b7280]">Trades 24h</span>
          <span className="font-medium tabular-nums">
            <span className="text-emerald-400">{count(main.buys)}</span>
            <span className="text-[#6b7280] mx-1">/</span>
            <span className="text-red-400">{count(main.sells)}</span>
          </span>
        </div>
        <SplitBar w={main} height={4} />
        <div className="mt-1 text-[9px] text-[#6b7280]">
          Trade count, not volume. Deepest pool{dexSource ? ` on ${dexSource}` : ''}
          {poolShare != null && `, ${Math.round(poolShare * 100)}% of 24h volume`}.
        </div>
        {divergence && (
          <div className="mt-1 text-[9px] text-amber-400/80">{divergence}</div>
        )}
      </div>
    )
  }

  return (
    <div
      className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2.5"
      title="Buy and sell trade counts from the deepest pool. These are counts, not dollar volume: DexScreener publishes no per-side value."
    >
      <div className="flex items-baseline justify-between mb-1.5">
        <div className="text-[9px] text-[#6b7280] tracking-[0.8px]">ORDER FLOW</div>
        <div className="text-[9px] text-[#6b7280]">trade count, not volume</div>
      </div>

      <div className="flex items-baseline justify-between mb-1.5 tabular-nums">
        <span className="text-[13px] font-semibold text-emerald-400">
          {count(main.buys)} <span className="text-[10px] font-normal text-emerald-400/70">buys</span>
        </span>
        <span className="text-[11px] text-[#6b7280]">{Math.round(mainShare * 100)}% buys</span>
        <span className="text-[13px] font-semibold text-red-400">
          <span className="text-[10px] font-normal text-red-400/70">sells</span> {count(main.sells)}
        </span>
      </div>

      <SplitBar w={main} />

      {present.length > 1 && (
        <div className="mt-2.5 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${present.length}, minmax(0, 1fr))` }}>
          {present.map(({ key, label }) => {
            const w = flow[key]!
            const share = flowShare(w)
            const thin = w.buys + w.sells < MIN_TRADES_FOR_PERCENT
            return (
              <div key={key} className="min-w-0">
                <div className="flex items-baseline justify-between mb-0.5">
                  <span className="text-[9px] text-[#6b7280]">{label}</span>
                  <span className="text-[9px] tabular-nums text-[#9ca3af]">
                    {share == null || thin ? '' : `${Math.round(share * 100)}%`}
                  </span>
                </div>
                {thin ? (
                  <div className="h-[3px] w-full rounded-full bg-white/[0.06]" />
                ) : (
                  <SplitBar w={w} height={3} />
                )}
                <div className="mt-0.5 text-[8px] tabular-nums text-[#6b7280] truncate">
                  {count(w.buys)}/{count(w.sells)}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {divergence && (
        <div className="mt-2 text-[10px] text-amber-400/90">{divergence}</div>
      )}

      <div className="mt-2 text-[9px] text-[#6b7280]">
        Deepest pool{dexSource ? ` on ${dexSource}` : ''}
        {poolShare != null && `, carrying ${
          poolShare >= 0.995 ? '~all' : `${Math.round(poolShare * 100)}%`
        } of this token's 24h volume`}
        . A token trading across several pools shows only this one here.
      </div>
    </div>
  )
}

import { formatCompactPrice, type TokenPrice } from '../lib/prices'

/**
 * Where this coin's number came from, and what it was checked against.
 *
 * This is the site's whole difference from every other market screen made
 * visible. The build already compares each PulseChain price against the coin's
 * own deepest pool, keeps what the aggregator said, restates the longer windows
 * when the two disagree past the break threshold, and withholds what it cannot
 * check — and until now the reader saw none of it, only a clean-looking tab that
 * had to be taken on trust. Now the panel says which source wrote the price,
 * shows the second opinion beside it with the gap between them, names the pool
 * the coin is priced through and the native figure in that pool's own terms,
 * and says out loud when a figure was corrected.
 *
 * Nothing here is computed from a model. Every line is a field read off the pair
 * object that supplied the price, or a ratio of two figures already on screen.
 * A coin the check never reached says so; it does not get a seal it did not earn.
 */

/** Quote assets that are a dollar by construction: the native figure would just repeat the USD price. */
const DOLLAR_QUOTES = new Set(['DAI', 'USDC', 'USDT', 'USDL', 'PXDC', 'EDAI', 'EUSDC', 'EUSDT', 'USDD'])

function fmtNative(n: number): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 0 })
  if (n >= 1) return n.toFixed(n >= 100 ? 1 : 3)
  return n.toPrecision(3)
}

export function Provenance({ coin, compact = false }: { coin: TokenPrice; compact?: boolean }) {
  const checked = !!coin.poolChecked
  const pool = coin.dexSource ? coin.dexSource.toUpperCase() : undefined

  // The second opinion: only when the aggregator actually said something
  // different. A gap of 0.0% would be the pool agreeing with itself.
  const hasSecondOpinion =
    checked && typeof coin.sourcePrice === 'number' && coin.sourcePrice > 0 && coin.sourcePrice !== coin.current_price
  const gapPct = hasSecondOpinion ? (coin.current_price / (coin.sourcePrice as number) - 1) * 100 : 0
  const gapFactor = hasSecondOpinion
    ? Math.max(coin.current_price / (coin.sourcePrice as number), (coin.sourcePrice as number) / coin.current_price)
    : 1

  // Priced through: the unit always, the native figure only where it is not a
  // restatement of the dollar price beside it.
  const through = checked && coin.poolQuote ? coin.poolQuote : undefined
  const showNative =
    !!through && typeof coin.priceNative === 'number' && coin.priceNative > 0 && !DOLLAR_QUOTES.has(through.toUpperCase())

  // FDV against the pool that has to absorb it: a ratio of two real figures.
  const fdvPerDepth =
    (coin.fdv ?? 0) > 0 && (coin.liquidity ?? 0) > 0 ? (coin.fdv as number) / (coin.liquidity as number) : undefined

  const seal = checked
    ? `Checked against its own pool${pool ? ` · ${pool}` : ''}`
    : pool
      ? `CoinGecko price · ${pool} pool read for depth and flow only`
      : 'CoinGecko aggregate · not pool-checked'

  const dim = 'text-[#6b7280]'
  const line = compact ? 'text-[9px]' : 'text-[10px]'

  const body = (
    <>
      <div className={`flex items-baseline justify-between gap-3 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
        <span className={dim}>Price source</span>
        <span className={`text-right ${checked ? 'text-[#67f6ff]/90' : 'text-white/70'}`}>
          {checked && <span className="mr-1" aria-hidden="true">✓</span>}
          {seal}
        </span>
      </div>

      {hasSecondOpinion && (
        <div className={`${line} ${dim} mt-1 tabular-nums`}>
          CoinGecko said {formatCompactPrice(coin.sourcePrice as number)} · pool says{' '}
          {formatCompactPrice(coin.current_price)} ·{' '}
          <span className={Math.abs(gapPct) >= 5 ? 'text-amber-400/90' : 'text-white/70'}>
            {gapPct > 0 ? '+' : ''}
            {Math.abs(gapPct) >= 100 ? `${gapFactor.toFixed(0)}× apart` : `${gapPct.toFixed(1)}%`}
          </span>
        </div>
      )}

      {through && (
        <div className={`${line} ${dim} mt-0.5 tabular-nums`}>
          Priced through {through}
          {showNative && (
            <>
              {' '}· 1 {coin.symbol} = <span className="text-white/80">{fmtNative(coin.priceNative as number)}</span> {through}
            </>
          )}
        </div>
      )}

      {coin.priceRepaired && (
        <div className={`${line} text-amber-400/90 mt-0.5`}>
          7d · 30d · 1y restated against the pool — the source sat {gapFactor.toFixed(0)}× from it.
        </div>
      )}

      {fdvPerDepth !== undefined && (
        <div className={`${line} ${dim} mt-0.5 tabular-nums`}>
          FDV is {fdvPerDepth >= 100 ? fdvPerDepth.toFixed(0) : fdvPerDepth.toFixed(1)}× the pool depth
        </div>
      )}
    </>
  )

  if (compact) {
    return <div className="col-span-2 border-b border-white/10 pb-1.5">{body}</div>
  }

  return (
    <div
      className="col-span-2 rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2.5"
      title="Which source wrote this price, what the other source said, and the pool it is priced through. Read off the pair that supplied the price; nothing modelled."
    >
      <div className="text-[9px] text-[#6b7280] tracking-[0.8px] mb-1.5">PROVENANCE</div>
      {body}
    </div>
  )
}

import { useCoinHistory, type TokenPrice } from '../lib/prices'
import { PriceChart } from './PriceChart'

/**
 * The seven-day chart block, including its own loading state.
 *
 * The state lives HERE rather than in App on purpose. App is a single 2,800
 * line component, so a setState in it re-renders the entire page. Fetching the
 * history from there turned one state update per coin opened into three, and
 * the last of them landed in the middle of the animation that slides the phone
 * sheet up — which is exactly when a re-render of everything is most visible.
 * Keeping it in a leaf means the arriving line repaints a chart, not an app.
 *
 * The block also holds its own height while loading. Without that it rendered
 * nothing until the fetch returned and then grew 56 pixels, shoving the rest of
 * the sheet down.
 */
export function CoinPriceChart({
  coin,
  height = 56,
  width,
  wrapperClass = 'pt-2 pb-1 border-t border-white/[0.07]',
}: {
  coin: TokenPrice | null | undefined
  height?: number
  width?: number
  /** Each panel spaces its blocks differently; this keeps both looking native. */
  wrapperClass?: string
}) {
  const { history, pending } = useCoinHistory(coin)

  const hasChart = !!history && history.length >= 8
  if (!coin || (!hasChart && !pending)) return null

  return (
    <div className={wrapperClass}>
      <div className="flex items-center justify-between text-[10px] text-[#6b7280] mb-1">
        <span className="tracking-[1px]">7D PRICE</span>
        <span className="text-[9px]">hourly closes</span>
      </div>
      <div style={{ height }}>
        <PriceChart
          history={history}
          currentPrice={coin.current_price}
          width={width}
          height={height}
        />
      </div>
    </div>
  )
}

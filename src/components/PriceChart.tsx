import { useId } from 'react'

/**
 * Seven days of real hourly closes.
 *
 * This replaces a chart that was drawn from a seeded sine wave and labelled
 * "24H TREND". That one could slope the opposite way to the actual move,
 * because the wiggles outweighed the only real term in it for any change under
 * about ten percent. Everything here is a plotted data point: CoinGecko's
 * sparkline_in_7d, oldest first, 168 of them, riding along on list calls the
 * app already makes.
 *
 * The window is seven days and the label says seven days. The old one said
 * 24H over a shape that was not a day of anything.
 */

/** Fewer points than this and a line is not a chart, it is a rumour. */
const MIN_POINTS = 8

export function PriceChart({
  history,
  width = 288,
  height = 56,
  currentPrice,
}: {
  history: number[] | undefined
  width?: number
  height?: number
  /** Drawn as the final point when it is fresher than the last hourly close. */
  currentPrice?: number
}) {
  const gradientId = useId()

  if (!history || history.length < MIN_POINTS) return null

  // The fast lane refreshes the price every 60 seconds while the history only
  // rebuilds every five, so the live price is often the newer number. Appending
  // it keeps the right-hand end of the line agreeing with the price above it.
  const points =
    typeof currentPrice === 'number' && currentPrice > 0
      ? [...history, currentPrice]
      : history

  let min = Infinity
  let max = -Infinity
  for (const p of points) {
    if (p < min) min = p
    if (p > max) max = p
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null

  // A flat week is a real result, not a bug. Give it a hairline of range so it
  // draws as a straight line through the middle rather than dividing by zero.
  const span = max - min || Math.abs(max) || 1
  const pad = height * 0.12

  const stepX = width / (points.length - 1)
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2)

  let line = ''
  points.forEach((v, i) => {
    const px = (i * stepX).toFixed(2)
    const py = y(v).toFixed(2)
    line += i === 0 ? `M ${px} ${py}` : ` L ${px} ${py}`
  })

  // Direction over the window itself, not the 24h field: this line covers seven
  // days, and colouring it by a different period would be the same category of
  // lie the old chart told.
  const up = points[points.length - 1] >= points[0]
  const stroke = up ? '#4ade80' : '#f87171'
  const area = `${line} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block w-full"
      preserveAspectRatio="none"
      role="img"
      aria-label={`Seven day price history, ${up ? 'up' : 'down'} over the period`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={width} cy={y(points[points.length - 1])} r="2" fill={stroke} />
    </svg>
  )
}

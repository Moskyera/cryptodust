import type { EcosystemSection } from '../lib/prices'

/**
 * The tab's ledger for this cycle: what was checked, corrected, withheld and
 * filtered — in coins, never dollars.
 *
 * A tab that shows only its survivors looks the same whether it did the work
 * or not. This line is the work made visible: the reader can see that 95 coins
 * were compared against their own pools, that 2 had a broken source figure
 * replaced, that 1 was left off because it could not be checked and looked
 * broken, and that 6 were removed for not being this chain's own coin. A tab
 * that does not run the price check reports only what it does run.
 *
 * The bridge figure is the number the HEX community argues about — the
 * PulseChain HEX price over the Ethereum HEX price — with each side's source
 * named beside it, because one is a pool reading and the other is an
 * aggregator's, and calling that a "premium" would claim more than two prices
 * from two markets can support.
 */
export interface HexBridge {
  ratio: number
  pSource: string
  eSource: string
}

export function TabLedger({
  section,
  bridge,
  className = '',
}: {
  section: EcosystemSection | undefined
  bridge?: HexBridge
  className?: string
}) {
  if (!section) return null
  const parts: Array<{ text: string; title: string; tone?: string }> = []

  if (typeof section.checked === 'number') {
    parts.push({
      text: `${section.checked} checked`,
      title: 'Coins whose price was compared against their own deepest pool this cycle.',
      tone: 'text-[#67f6ff]/85',
    })
  }
  if (typeof section.repaired === 'number' && section.repaired > 0) {
    parts.push({
      text: `${section.repaired} repaired`,
      title: 'Coins whose source figure sat more than 20× from their pool and was replaced by the pool reading.',
      tone: 'text-amber-400/85',
    })
  }
  if (typeof section.withheld === 'number' && section.withheld > 0) {
    parts.push({
      text: `${section.withheld} withheld`,
      title: 'Coins left off this cycle: no trustworthy price from either source, or an implausible move that could not be checked against a pool.',
      tone: 'text-red-400/80',
    })
  }
  if (typeof section.filtered === 'number' && section.filtered > 0) {
    parts.push({
      text: `${section.filtered} filtered`,
      title: 'Bridged, wrapped or multi-chain imports removed for not being this chain\'s own coin.',
    })
  }

  if (parts.length === 0 && !bridge) return null

  return (
    <div className={`flex items-center gap-x-2 text-[10px] tabular-nums text-[#6b7280] ${className}`} role="status">
      <span className="tracking-[0.8px] text-[9px]">THIS CYCLE</span>
      {parts.map((p, i) => (
        <span key={p.text} title={p.title} className="whitespace-nowrap">
          {i > 0 && <span className="mx-1 opacity-60">·</span>}
          <span className={p.tone ?? ''}>{p.text}</span>
        </span>
      ))}
      {bridge && (
        <span
          className="ml-2 whitespace-nowrap"
          title={`PulseChain HEX price divided by Ethereum HEX price. pHEX is a ${bridge.pSource} reading; eHEX is ${bridge.eSource}'s figure.`}
        >
          <span className="opacity-60 mr-1">·</span>
          pHEX/eHEX <span className="text-white/80">{bridge.ratio.toFixed(2)}×</span>
          <span className="ml-1 text-[9px]">({bridge.pSource} / {bridge.eSource})</span>
        </span>
      )}
    </div>
  )
}

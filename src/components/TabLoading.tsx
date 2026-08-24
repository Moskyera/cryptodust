/**
 * What a chain tab shows while its coins are still being assembled.
 *
 * The top 500 go up after a single CoinGecko round trip, but a chain tab needs
 * more than that: its coins have to be checked against their own pools before
 * any of them can be drawn, because that check is the only thing standing
 * between the reader and a token reading +26,271%. So these tabs are legitimately
 * later, and this is the wait made visible instead of an empty page that looks
 * like a tab with nothing in it.
 *
 * It wears the same two tilted orbits as the first-load screen, at a smaller
 * size, so arriving here does not feel like landing in a different application.
 * The copy says what is actually happening rather than "loading", because the
 * honest answer — the pools are being read — is also the more reassuring one.
 */
export function TabLoading({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 text-center ${
        compact ? 'py-16 px-6' : 'absolute inset-0 z-10 px-6'
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="boot-planet relative flex items-center justify-center w-9 h-9">
        <span className="boot-ring" />
        <span className="boot-ring boot-ring--outer" />
        <span className="relative block w-9 h-9 rounded-full bg-gradient-to-br from-[#67f6ff]/80 to-[#a78bfa]/80 shadow-[0_0_18px_rgba(103,246,255,0.35)]" />
      </div>

      <div className="mt-2">
        <div className="text-sm text-white/80 font-medium">Building the {label} tab</div>
        <div className="text-[11px] text-[#6b7280] mt-1 max-w-[15rem]">
          Reading each coin against its own pool, so nothing lands here unchecked.
        </div>
      </div>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { type CaseDef, RARITY, rollCase, nftById, normalizeCaseContents, type Nft, type CaseRollResult } from "@/lib/casino-data"
import { useStore } from "@/lib/store"
import { logCaseOpenActivity } from "@/lib/api-client"
import { useToast } from "@/components/toast"
import { useT } from "@/lib/i18n"
import { RarityBadge } from "@/components/rarity-badge"
import { TonIcon, ChevronLeftIcon, CheckIcon } from "@/components/icons"
import { playReelTick, playLand, playReveal, playClick, playError } from "@/lib/sound"

const ITEM_W = 108 // px item width
const GAP = 4 // gap-1
const STRIDE = ITEM_W + GAP // distance between item centers
const TRACK_PAD = 4 // px-1 left padding on the track
const REEL_LEN = 60
const WINNER_INDEX = 52

export function SpinSheet({ caseDef, free = false, deposit = false, referral = false, onClose }: { caseDef: CaseDef; free?: boolean; deposit?: boolean; referral?: boolean; onClose: () => void }) {
  const { ton, spendTon, addTon, addToInventory, claimFreeCase, claimDepositCase, claimReferralCase } = useStore()
  const toast = useToast()
  const { t, tCase } = useT()
  const [reel, setReel] = useState<CaseRollResult[]>([])
  const [offset, setOffset] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<CaseRollResult | null>(null)
  const [isDemo, setIsDemo] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)
  const tickTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Clear any pending reel-tick timers if the sheet closes mid-spin.
  useEffect(() => {
    return () => {
      tickTimeoutsRef.current.forEach(clearTimeout)
    }
  }, [])

  // build an initial idle reel
  useEffect(() => {
    // Pre-determine the winner, then build a reel that lands on it
    const winner = rollCase(caseDef.contents)
    const arr = buildReel(caseDef, winner)
    setReel(arr)
    setResult(null)
    setOffset(0)
  }, [caseDef])

  function randomPrize(c: CaseDef): CaseRollResult {
    const pool = normalizeCaseContents(c.contents)
    // Visual-only weighting for decoy reel items: NFTs get a healthy fixed
    // weight so they actually show up while the reel spins, even if the real
    // odds (used by rollCase for the actual winner) give NFTs a tiny chance.
    // This purely affects what flashes by visually — never the real result.
    const visual = pool.map((p) => ({ p, w: p.type === "nft" ? 30 : Math.max(0.2, (p.chance || 1) * 0.15) }))
    const total = visual.reduce((s, x) => s + x.w, 0)
    let r = Math.random() * total
    let pick = visual[visual.length - 1]?.p
    for (const x of visual) { r -= x.w; if (r <= 0) { pick = x.p; break } }
    if (!pick || pick.type === "ton") return { type: "ton", amount: pick?.type === "ton" ? pick.amount : 0.5, prize: pick || { type: "ton", amount: 0.5, chance: 1 } }
    return { type: "nft", nft: nftById(pick.id), prize: pick }
  }

  function buildReel(c: CaseDef, winner: CaseRollResult): CaseRollResult[] {
    const arr: CaseRollResult[] = []
    for (let i = 0; i < REEL_LEN; i++) {
      if (i === WINNER_INDEX) arr.push(winner)
      else arr.push(randomPrize(c))
    }
    return arr
  }

  // Schedules a run of ticks that spin up gently, then gradually space out as
  // the reel decelerates — avoids a jarring full-volume "pop" the instant the
  // spin starts, and matches the reel's own ease-out scroll at the end.
  function scheduleReelTicks(durationMs: number) {
    tickTimeoutsRef.current.forEach(clearTimeout)
    const timers: ReturnType<typeof setTimeout>[] = []
    const spinUpMs = 260
    let t = 70 // tiny delay so the first tick doesn't land right on the button tap
    let i = 0
    while (t < durationMs - 250) {
      const elapsed = t
      const spinUp = Math.min(1, elapsed / spinUpMs)
      const spinDown = Math.max(0, 1 - elapsed / durationMs)
      const intensity = Math.max(0.12, Math.min(spinUp, spinDown))
      timers.push(window.setTimeout(() => playReelTick(intensity), t))
      i++
      t += 60 + Math.pow(i, 1.65) * 1.5
    }
    tickTimeoutsRef.current = timers
  }

  function spin(demo = false) {
    if (spinning) return
    if (!demo && deposit) {
      claimDepositCase()
    } else if (!demo && referral) {
      claimReferralCase()
    } else if (!demo && free) {
      claimFreeCase()
    } else if (!demo && !spendTon(caseDef.price)) {
      playError()
      toast(t("cases.notEnough"), "error")
      return
    }
    
    // 1. Determine the winner first
    const winner = rollCase(caseDef.contents)

    // Persist the real case opening (server ignores demo spins entirely).
    if (!demo) {
      logCaseOpenActivity({
        caseId: caseDef.id,
        caseName: caseDef.name,
        nftId: winner.type === "nft" ? winner.nft.id : "ton",
        nftName: winner.type === "nft" ? winner.nft.name : `${winner.amount} TON`,
        nftPrice: winner.type === "nft" ? winner.nft.price : winner.amount,
        kind: deposit ? "deposit" : referral ? "free" : free ? "free" : "paid",
        cost: deposit || free || referral ? 0 : caseDef.price,
      })
    }
    
    // 2. Build a reel with the winner at WINNER_INDEX
    const newReel = buildReel(caseDef, winner)
    setReel(newReel)
    setResult(null)
    setSpinning(true)
    setIsDemo(demo)
    
    // 3. Reset position and prepare animation
    setOffset(0)
    scheduleReelTicks(5200)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const container = trackRef.current?.parentElement
        if (!container) return
        
        // Calculate target: where WINNER_INDEX should be after scroll
        // Item i center (within the track) = TRACK_PAD + i*STRIDE + ITEM_W/2.
        // We want that centered under the pointer at container center.
        const center = container.clientWidth / 2
        const itemCenter = TRACK_PAD + WINNER_INDEX * STRIDE + ITEM_W / 2
        const target = itemCenter - center

        // Small jitter for visual variety, kept well within the item so the
        // reel always stops with the winner under the center pointer.
        const jitter = (Math.random() - 0.5) * (ITEM_W - 36)
        setOffset(-(target + jitter))
      })
    })
    
    window.setTimeout(() => {
      setSpinning(false)
      setResult(winner)
      playLand()
      playReveal(winner.type === "nft" ? winner.nft.rarity : "Common")
    }, 5200)
  }

  function sell() {
    if (!result) return
    playClick()
    const amount = result.type === "nft" ? result.nft.price : result.amount
    addTon(amount)
    toast(t("cases.soldFor", { n: amount }), "win")
    setResult(null)
    onClose()
  }

  function keep() {
    if (!result) return
    playClick()
    if (result.type === "ton") {
      addTon(result.amount)
      toast(t("cases.soldFor", { n: result.amount }), "win")
    } else {
      addToInventory(result.nft.id)
      toast(t("cases.added", { name: result.nft.name }), "win")
    }
    setResult(null)
    onClose()
  }

  function closeDemo() {
    setResult(null)
    setIsDemo(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="animate-in slide-in-from-bottom relative z-10 w-full max-w-[480px] rounded-t-3xl px-4 pb-8 pt-4"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          borderTop: "3px solid rgba(0,255,65,0.4)",
          boxShadow: "0 -10px 40px rgba(0,255,65,0.25)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <button onClick={onClose} className="flex items-center gap-1 text-sm font-semibold text-muted-foreground">
            <ChevronLeftIcon className="h-5 w-5" /> {t("common.back")}
          </button>
          <h2 className="text-base font-extrabold">{tCase(caseDef.id, caseDef.name)}</h2>
          <div className="flex items-center gap-1 text-sm font-bold">
            <TonIcon className="h-4 w-4" />
            {ton.toFixed(2)}
          </div>
        </div>

        {/* reel */}
        <div className="relative mb-4 overflow-hidden rounded-2xl border border-[rgba(0,255,65,0.2)] bg-black/50 py-4">
          {/* center marker */}
          <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-[3px] -translate-x-1/2 bg-pepe-light shadow-[0_0_14px_rgba(0,255,65,0.9)]" />
          <div className="pointer-events-none absolute left-1/2 top-0 z-20 h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-pepe-light" />
          <div className="pointer-events-none absolute bottom-0 left-1/2 z-20 h-0 w-0 -translate-x-1/2 border-x-8 border-b-8 border-x-transparent border-b-pepe-light" />
          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-[#06120a] to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-[#06120a] to-transparent" />

          <div
            ref={trackRef}
            className="flex gap-1 px-1"
            style={{
              transform: `translateX(${offset}px)`,
              transition: spinning ? "transform 5s cubic-bezier(0.12,0.7,0.12,1)" : "none",
            }}
          >
            {reel.map((prize, i) => {
              const nft = prize.type === "nft" ? prize.nft : null
              const r = nft ? RARITY[nft.rarity] : null
              return (
                <div
                  key={i}
                  className="flex h-[104px] w-[108px] shrink-0 flex-col items-center justify-center rounded-xl bg-transparent"
                >
                  {nft ? (
                    <Image src={nft.img || "/placeholder.svg"} alt={nft.name} width={64} height={64} className="h-16 w-16 object-contain" style={{ filter: `drop-shadow(0 4px 10px ${r?.glow})` }} />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(0,255,65,0.12)] text-sm font-black text-pepe-light">
                      <TonIcon className="mr-1 h-4 w-4" /> {prize.amount}
                    </div>
                  )}
                  <span className="mt-1 max-w-full truncate px-1 text-[10px] font-semibold">{nft ? nft.name : "TON Prize"}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* result / action */}
        {result ? (
          <ResultCard result={result} onSell={sell} onKeep={keep} onCloseDemo={closeDemo} isDemo={isDemo} />
        ) : (
          <>
            <Contents caseDef={caseDef} />
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => spin(true)}
                disabled={spinning}
                className="flex-1 rounded-2xl border border-[rgba(0,255,65,0.3)] bg-black/40 py-4 text-base font-extrabold text-pepe-light disabled:cursor-not-allowed disabled:opacity-70"
              >
                {t("cases.demoSpin")}
              </button>
              <button
                onClick={() => spin(false)}
                disabled={spinning}
                className="btn-3d flex-1 rounded-2xl py-4 text-base font-extrabold disabled:cursor-not-allowed"
              >
                {spinning ? t("cases.spinning") : free || deposit || referral ? t("cases.openFree") : t("cases.openFor", { n: caseDef.price })}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ResultCard({ result, onSell, onKeep, onCloseDemo, isDemo }: { result: CaseRollResult; onSell: () => void; onKeep: () => void; onCloseDemo: () => void; isDemo: boolean }) {
  const nft = result.type === "nft" ? result.nft : null
  const r = nft ? RARITY[nft.rarity] : { color: "#39FF14", glow: "rgba(0,255,65,0.55)" }
  const { t } = useT()
  return (
    <div
      className="animate-in zoom-in-95 relative flex flex-col items-center overflow-hidden rounded-2xl p-5"
      style={{
        background: `linear-gradient(175deg, ${r.color}22 0%, #06120a 100%)`,
        border: `1px solid ${r.color}66`,
        boxShadow: `0 0 50px ${r.glow}`,
      }}
    >
      {isDemo && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <span className="-rotate-[18deg] select-none text-5xl font-black uppercase tracking-widest text-white/10">
            Demo
          </span>
        </div>
      )}
      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {isDemo ? t("cases.demoResult") : t("cases.youWon")}
      </span>
      {nft ? (
        <Image src={nft.img || "/placeholder.svg"} alt={nft.name} width={120} height={120} className="my-2 h-28 w-28 object-contain drop-shadow-[0_0_20px_rgba(0,255,65,0.4)]" />
      ) : (
        <div className="my-4 flex h-24 w-24 items-center justify-center rounded-full bg-[rgba(0,255,65,0.12)] text-2xl font-black text-pepe-light">
          <TonIcon className="mr-1 h-6 w-6" /> {result.amount}
        </div>
      )}
      <h3 className="text-lg font-extrabold">{nft ? nft.name : `${result.amount} TON`}</h3>
      <div className="mt-1 mb-4 flex items-center gap-2">
        {nft && <RarityBadge rarity={nft.rarity} />}
        <span className="flex items-center gap-1 text-sm font-bold">
          <TonIcon className="h-4 w-4" /> {nft ? nft.price : result.amount}
        </span>
      </div>
      {isDemo ? (
        <button
          onClick={onCloseDemo}
          className="btn-3d relative z-20 w-full rounded-xl py-3 text-sm font-extrabold"
        >
          {t("common.close")}
        </button>
      ) : (
        <div className="flex w-full gap-3">
          <button
            onClick={onSell}
            className="flex-1 rounded-xl border border-[rgba(0,255,65,0.25)] bg-black/40 py-3 text-sm font-bold text-pepe-light active:scale-95"
          >
            {nft ? `${t("common.sell")} ${nft.price} TON` : `Claim ${result.amount} TON`}
          </button>
          {nft && (
            <button onClick={onKeep} className="btn-3d flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-extrabold">
              <CheckIcon className="h-4 w-4" /> {t("common.keep")}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function Contents({ caseDef }: { caseDef: CaseDef }) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const items = normalizeCaseContents(caseDef.contents)
  const seen = new Set<string>()
  const unique = items.filter((p) => {
    const key = p.type === "ton" ? `ton:${p.amount}` : `nft:${p.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-[rgba(0,255,65,0.2)] bg-black/30 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-pepe-light active:scale-[0.98]"
      >
        <span>{open ? t("cases.hidePrizes") : t("cases.showPrizes")}</span>
        <span
          className="transition-transform duration-200"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {unique.map((p) => {
            const n = p.type === "nft" ? nftById(p.id) : null
            const r = n ? RARITY[n.rarity] : null
            return (
              <div
                key={p.type === "nft" ? n?.id : `ton-${p.amount}`}
                className="flex flex-col items-center rounded-xl bg-transparent p-1"
              >
                {n ? (
                  <Image
                    src={n.img || "/placeholder.svg"}
                    alt={n.name}
                    width={50}
                    height={50}
                    className="h-[50px] w-[50px] rounded-xl bg-transparent object-cover"
                    style={{ filter: `drop-shadow(0 2px 6px ${r?.glow})` }}
                  />
                ) : (
                  <div className="flex h-[50px] w-[50px] items-center justify-center rounded-xl bg-[rgba(0,255,65,0.12)] text-[11px] font-black text-pepe-light">
                    {p.amount}
                  </div>
                )}
                <span className="mt-0.5 flex items-center gap-0.5 text-[9px] font-bold leading-none">
                  <TonIcon className="h-2.5 w-2.5" />
                  {n ? n.price : p.amount}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

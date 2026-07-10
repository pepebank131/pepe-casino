"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import {
  CASES, FREE_CASE, FREE_CASE_COOLDOWN_MS,
  DEPOSIT_CASE, DEPOSIT_CASE_COOLDOWN_MS,
  REFERRAL_CASE_COOLDOWN_MS,
  PROMO_CASE,
  type CaseDef, nftById, RARITY, normalizeCaseContents,
} from "@/lib/casino-data"
import { SpinSheet } from "@/components/spin-sheet"
import { CaseCover } from "@/components/case-cover"
import { TonIcon, GiftIcon, UsersIcon } from "@/components/icons"
import { useToast } from "@/components/toast"
import { useStore } from "@/lib/store"
import { useT } from "@/lib/i18n"
import { loadCases, redeemPromo } from "@/lib/api-client"
import { SubscriptionGate } from "@/components/subscription-gate"

// Hook: countdown timer that updates every second
function useCountdown(targetMs: number) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - Date.now()))
  useEffect(() => {
    if (targetMs <= Date.now()) { setRemaining(0); return }
    setRemaining(Math.max(0, targetMs - Date.now()))
    const iv = setInterval(() => {
      const left = targetMs - Date.now()
      setRemaining(left > 0 ? left : 0)
      if (left <= 0) clearInterval(iv)
    }, 1000)
    return () => clearInterval(iv)
  }, [targetMs])
  return remaining
}

export function CasesScreen() {
  const [spinCase, setSpinCase] = useState<{ def: CaseDef; mode: "paid" | "free" | "deposit" | "referral" | "promo" } | null>(null)
  const [showSubGate, setShowSubGate] = useState(false)
  const [pendingFreeCase, setPendingFreeCase] = useState<CaseDef | null>(null)
  const [promoPrompt, setPromoPrompt] = useState<CaseDef | null>(null) // case waiting for promo code
  const toast = useToast()
  const { freeCaseAt, depositCaseAt, depositedSinceOpen, referralCaseAt, referrals } = useStore()
  const { t, tCase } = useT()

  // CRITICAL: cases must NEVER be openable until the real server config has
  // loaded. Showing bundled defaults as a placeholder is fine for the UI, but
  // they must be visually locked + non-clickable, otherwise a user can open a
  // case during the loading window using stale (often cheaper / wrong-prize)
  // data while the admin panel's real config hasn't arrived yet — a real
  // money exploit. `casesReady` gates every open handler below.
  const [casesReady, setCasesReady] = useState(false)
  const [allCases, setAllCases] = useState<CaseDef[]>([
    ...CASES,
    { ...FREE_CASE, model: "free" as const },
    { ...DEPOSIT_CASE, model: "deposit" as const },
    { ...PROMO_CASE, model: "promo" as const },
  ])

  useEffect(() => {
    let active = true
    loadCases().then((cfg) => {
      if (!active) return
      const paid = Array.isArray(cfg.cases) && cfg.cases.length > 0 ? cfg.cases as CaseDef[] : CASES
      const free = cfg.free ? [{ ...(cfg.free as CaseDef), model: "free" as const }] : [{ ...FREE_CASE, model: "free" as const }]
      const deposit = cfg.deposit ? [{ ...(cfg.deposit as CaseDef), model: "deposit" as const }] : [{ ...DEPOSIT_CASE, model: "deposit" as const }]
      const referral = (cfg as any).referral ? [{ ...(cfg as any).referral as CaseDef, model: "referral" as const }] : []
      const promo = (cfg as any).promo ? [{ ...(cfg as any).promo as CaseDef, model: "promo" as const }] : [{ ...PROMO_CASE, model: "promo" as const }]
      setAllCases([...paid, ...free, ...deposit, ...referral, ...promo])
      setCasesReady(true)
    }).catch(() => {
      if (active) setCasesReady(true)
    })
    return () => { active = false }
  }, [])

  // Separate by model
  const paidCases = allCases.filter(c => !c.model || c.model === "paid")
  const freeCaseDef = allCases.find(c => c.model === "free") ?? { ...FREE_CASE, model: "free" as const }
  const depositCases = allCases.filter(c => c.model === "deposit")
  const referralCases = allCases.filter(c => c.model === "referral")
  const promoCases = allCases.filter(c => c.model === "promo")

  // Free case countdown
  const freeReadyAt = freeCaseAt ? freeCaseAt + (freeCaseDef.cooldownMs ?? FREE_CASE_COOLDOWN_MS) : 0
  const freeRemaining = useCountdown(freeReadyAt)
  const freeOnCooldown = freeRemaining > 0

  // Deposit cases state (per-case cooldown all share depositCaseAt for now)
  const depCooldownMs = depositCases[0]?.cooldownMs ?? DEPOSIT_CASE_COOLDOWN_MS
  const depReadyAt = depositCaseAt ? depositCaseAt + depCooldownMs : 0
  const depRemaining = useCountdown(depReadyAt)
  const depOnCooldown = depRemaining > 0

  // Referral cases state
  const refCooldownMs = referralCases[0]?.cooldownMs ?? REFERRAL_CASE_COOLDOWN_MS
  const refReadyAt = referralCaseAt ? referralCaseAt + refCooldownMs : 0
  const refRemaining = useCountdown(refReadyAt)
  const refOnCooldown = refRemaining > 0
  const totalRefDeposited = referrals.reduce((s, r) => s + r.wagered, 0)

  function handleFreeClick() {
    if (!casesReady) { toast("Завантаження кейсів…", "info"); return }
    if (freeOnCooldown) { toast(t("cases.nextFreeLabel") + " " + fmtCountdown(freeRemaining), "info"); return }
    setPendingFreeCase(freeCaseDef)
    setShowSubGate(true)
  }

  function handleDepositClick(c: CaseDef) {
    if (!casesReady) { toast("Завантаження кейсів…", "info"); return }
    if (depOnCooldown) { toast(t("cases.depositCooldown") + " " + fmtCountdown(depRemaining), "info"); return }
    const required = c.price || 1
    if (depositedSinceOpen < required) {
      const need = required - depositedSinceOpen
      toast(t("cases.depositNeedToast").replace("{n}", need.toFixed(2)), "info")
      return
    }
    setSpinCase({ def: c, mode: "deposit" })
  }

  function handleReferralClick(c: CaseDef) {
    if (!casesReady) { toast("Завантаження кейсів…", "info"); return }
    if (refOnCooldown) { toast(t("cases.referralCooldown") + " " + fmtCountdown(refRemaining), "info"); return }
    const required = c.price || 1
    if (totalRefDeposited < required) {
      const need = required - totalRefDeposited
      toast(t("cases.referralNeedToast").replace("{n}", need.toFixed(2)), "info")
      return
    }
    setSpinCase({ def: c, mode: "referral" })
  }

  function handlePromoClick(c: CaseDef) {
    if (!casesReady) { toast("Завантаження кейсів…", "info"); return }
    setPromoPrompt(c)
  }

  function handlePaidClick(c: CaseDef) {
    if (!casesReady) { toast("Завантаження кейсів…", "info"); return }
    setSpinCase({ def: c, mode: "paid" })
  }

  return (
    <div className="relative px-4 pb-28 pt-2">

      {/* Loading guard — blocks all interaction until real server config has
          arrived, preventing exploitation of stale bundled-default cases. */}
      {!casesReady && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3"
          style={{ background: "rgba(6, 10, 8, 0.92)", backdropFilter: "blur(2px)" }}
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[color:var(--pepe)] border-t-transparent" />
          <p className="text-sm font-semibold text-muted-foreground">Завантаження кейсів…</p>
        </div>
      )}

      {/* Special cards row: Free + first Deposit */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <FreeCaseCard
          caseDef={freeCaseDef}
          onCooldown={freeOnCooldown}
          remaining={freeRemaining}
          onClick={handleFreeClick}
        />
        {depositCases[0] ? (
          <DepositCaseCard
            caseDef={depositCases[0]}
            onCooldown={depOnCooldown}
            remaining={depRemaining}
            deposited={depositedSinceOpen}
            onClick={() => handleDepositClick(depositCases[0])}
          />
        ) : (
          <div /> // empty slot if no deposit case
        )}
      </div>

      {/* Extra deposit cases (if more than 1) */}
      {depositCases.slice(1).map(c => (
        <DepositCaseCard
          key={c.id}
          caseDef={c}
          onCooldown={depOnCooldown}
          remaining={depRemaining}
          deposited={depositedSinceOpen}
          onClick={() => handleDepositClick(c)}
          fullWidth
        />
      ))}

      {/* Referral cases */}
      {referralCases.map(c => (
        <ReferralCaseCard
          key={c.id}
          caseDef={c}
          onCooldown={refOnCooldown}
          remaining={refRemaining}
          totalRefDeposited={totalRefDeposited}
          onClick={() => handleReferralClick(c)}
        />
      ))}

      {/* Hero banner */}
      <div
        className="relative mb-5 overflow-hidden rounded-3xl p-5"
        style={{
          background: "radial-gradient(120% 120% at 80% 10%, rgba(200,30,58,0.55), #2a0509 70%)",
          border: "1px solid rgba(255,90,110,0.3)",
          boxShadow: "0 14px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
        }}
      >
        <div className="relative z-10 max-w-[58%]">
          <h2 className="mt-1 text-2xl font-black leading-tight text-balance text-white">
            {paidCases[0] ? tCase(paidCases[0].id, paidCases[0].name) : "Mega Case"}
          </h2>
          <button
            onClick={() => {
              const c = paidCases.find(c => c.id === "epic-vault") ?? paidCases[0]
              if (c) handlePaidClick(c)
            }}
            className="btn-3d mt-3 rounded-xl px-6 py-2.5 text-sm font-extrabold"
          >
            PLAY
          </button>
        </div>
        <Image
          src={paidCases[0]?.cover || "/hero-case.png"}
          alt="Pepe mega case"
          width={170} height={170} priority
          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg" }}
          className="absolute -bottom-3 -right-2 z-0 h-40 w-40 object-contain drop-shadow-[0_0_30px_rgba(0,255,65,0.4)]"
        />
      </div>

      {/* Paid + Promo cases grid */}
      <div className="mb-3 flex items-center gap-2">
        <GiftIcon className="h-5 w-5 text-pepe-light" />
        <h3 className="text-base font-extrabold">{t("cases.heading")}</h3>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-6">
        {paidCases.map(c => (
          <CaseCard key={c.id} caseDef={c} onOpen={() => handlePaidClick(c)} />
        ))}
        {promoCases.map(c => (
          <CaseCard key={c.id} caseDef={c} onOpen={() => handlePromoClick(c)} promoLocked />
        ))}
      </div>

      {/* SpinSheet */}
      {spinCase && (
        <SpinSheet
          caseDef={spinCase.def}
          free={spinCase.mode === "free" || spinCase.mode === "promo"}
          deposit={spinCase.mode === "deposit"}
          referral={spinCase.mode === "referral"}
          onClose={() => setSpinCase(null)}
        />
      )}

      {/* Promo code modal — shown when clicking a promo case */}
      {promoPrompt && (
        <PromoCaseModal
          caseDef={promoPrompt}
          onClose={() => setPromoPrompt(null)}
          onSuccess={() => {
            setPromoPrompt(null)
            setSpinCase({ def: promoPrompt, mode: "promo" })
          }}
        />
      )}

      {/* Subscription gate before free case */}
      {showSubGate && pendingFreeCase && (
        <SubscriptionGate
          onClose={() => { setShowSubGate(false); setPendingFreeCase(null) }}
          onVerified={() => {
            setShowSubGate(false)
            setSpinCase({ def: pendingFreeCase!, mode: "free" })
            setPendingFreeCase(null)
          }}
        />
      )}
    </div>
  )
}

function fmtCountdown(ms: number) {
  const total = Math.floor(ms / 1000)
  const h = String(Math.floor(total / 3600)).padStart(2, "0")
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0")
  const s = String(total % 60).padStart(2, "0")
  return `${h}:${m}:${s}`
}

// ─── Free Case Card ───────────────────────────────────────────────────────────
function FreeCaseCard({ caseDef, onCooldown, remaining, onClick }: {
  caseDef: CaseDef; onCooldown: boolean; remaining: number; onClick: () => void
}) {
  const { t } = useT()
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-start overflow-hidden rounded-2xl p-3 text-left active:scale-[0.97]"
      style={{
        background: "linear-gradient(160deg, rgba(0,255,65,0.22), rgba(11,15,18,0.9))",
        border: "1px solid rgba(0,255,65,0.4)",
        boxShadow: "0 8px 22px rgba(0,255,65,0.18)",
      }}
    >
      <GiftIcon className="mb-1 h-6 w-6" style={{ color: "#39FF14" }} />
      <span className="text-sm font-extrabold">{caseDef.name}</span>
      {onCooldown ? (
        <>
          <span className="mb-2 text-[11px] text-white/60">{t("cases.nextFreeLabel")}</span>
          <span className="rounded-lg bg-black/50 px-3 py-1 text-[12px] font-black tabular-nums text-pepe-light">
            {fmtCountdown(remaining)}
          </span>
        </>
      ) : (
        <>
          <span className="mb-2 text-[11px] text-white/60">Раз на добу</span>
          <span className="rounded-lg px-3 py-1 text-[11px] font-bold" style={{ background: "linear-gradient(180deg,#0aff45,#00a52c)", color: "#04130a" }}>
            {t("cases.open")}
          </span>
        </>
      )}
    </button>
  )
}

// ─── Deposit Case Card ────────────────────────────────────────────────────────
function DepositCaseCard({ caseDef, onCooldown, remaining, deposited, onClick, fullWidth }: {
  caseDef: CaseDef; onCooldown: boolean; remaining: number; deposited: number; onClick: () => void; fullWidth?: boolean
}) {
  const { t } = useT()
  const required = caseDef.price || 1
  const need = Math.max(0, required - deposited)
  const eligible = !onCooldown && deposited >= required

  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-start overflow-hidden rounded-2xl p-3 text-left active:scale-[0.97] ${fullWidth ? "mb-3 w-full" : ""}`}
      style={{
        background: "linear-gradient(160deg, rgba(255,140,30,0.28), rgba(11,15,18,0.9))",
        border: `1px solid ${eligible ? "rgba(255,176,77,0.7)" : "rgba(255,140,30,0.45)"}`,
        boxShadow: "0 8px 22px rgba(255,140,30,0.18)",
      }}
    >
      <GiftIcon className="mb-1 h-6 w-6" style={{ color: "#ff9a3d" }} />
      <span className="text-sm font-extrabold">{caseDef.name}</span>
      {onCooldown ? (
        <>
          <span className="mb-2 text-[11px] text-white/60">{t("cases.depositCooldown")}</span>
          <span className="rounded-lg bg-black/50 px-3 py-1 text-[12px] font-black tabular-nums text-[#ffb04d]">
            {fmtCountdown(remaining)}
          </span>
        </>
      ) : eligible ? (
        <>
          <span className="mb-2 text-[11px] text-white/60">{t("cases.depositReady")}</span>
          <span className="rounded-lg px-3 py-1 text-[11px] font-bold" style={{ background: "linear-gradient(180deg,#ffb04d,#ff8a00)", color: "#04130a" }}>
            {t("cases.open")}
          </span>
        </>
      ) : (
        <>
          <span className="mb-1 text-[11px] text-white/60">{t("cases.depositSub")}</span>
          <span className="flex items-center gap-1 rounded-lg bg-black/50 px-3 py-1 text-[11px] font-bold text-[#ffb04d]">
            <TonIcon className="h-3 w-3" />
            {deposited.toFixed(2)} / {required} TON
          </span>
          {need > 0 && (
            <span className="mt-1 text-[10px] text-orange-400 font-semibold">
              {t("cases.deposited")} {need.toFixed(2)} TON
            </span>
          )}
        </>
      )}
    </button>
  )
}

// ─── Referral Case Card ───────────────────────────────────────────────────────
function ReferralCaseCard({ caseDef, onCooldown, remaining, totalRefDeposited, onClick }: {
  caseDef: CaseDef; onCooldown: boolean; remaining: number; totalRefDeposited: number; onClick: () => void
}) {
  const { t } = useT()
  const required = caseDef.price || 1
  const need = Math.max(0, required - totalRefDeposited)
  const progress = Math.min(1, required > 0 ? totalRefDeposited / required : 0)
  const eligible = !onCooldown && totalRefDeposited >= required

  return (
    <button
      onClick={onClick}
      className="relative mb-4 flex w-full items-center gap-4 overflow-hidden rounded-2xl p-4 text-left active:scale-[0.98] transition"
      style={{
        background: "linear-gradient(150deg, rgba(138,43,226,0.28), rgba(11,15,18,0.92))",
        border: `1px solid ${eligible ? "rgba(186,85,211,0.7)" : "rgba(138,43,226,0.35)"}`,
        boxShadow: eligible ? "0 8px 28px rgba(138,43,226,0.35)" : "0 6px 18px rgba(0,0,0,0.3)",
      }}
    >
      <div className="shrink-0">
        <img
          src={caseDef.cover || "/placeholder.svg"}
          alt={caseDef.name}
          className="h-16 w-16 rounded-xl object-contain"
          onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg" }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <UsersIcon className="h-4 w-4 shrink-0" style={{ color: "#ba55d3" }} />
          <span className="text-sm font-extrabold truncate">{caseDef.name}</span>
        </div>
        {onCooldown ? (
          <div>
            <p className="text-[11px] text-white/60 mb-1">{t("cases.referralCooldown")}</p>
            <span className="rounded-lg bg-black/50 px-3 py-1 text-[12px] font-black tabular-nums" style={{ color: "#ba55d3" }}>
              {fmtCountdown(remaining)}
            </span>
          </div>
        ) : eligible ? (
          <div>
            <p className="text-[11px] text-white/60 mb-1">{t("cases.referralReady")}</p>
            <span className="rounded-lg px-3 py-1 text-[11px] font-bold" style={{ background: "linear-gradient(180deg,#ba55d3,#7b2fa8)", color: "#fff" }}>
              {t("cases.open")}
            </span>
          </div>
        ) : (
          <div>
            <p className="text-[11px] text-white/60 mb-1.5">
              <TonIcon className="inline h-3 w-3 mr-1" />
              <span className="font-bold text-white">{totalRefDeposited.toFixed(2)}</span>
              {" / "}
              <span className="font-bold" style={{ color: "#ba55d3" }}>{required} TON</span>
            </p>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden mb-1">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg,#7b2fa8,#ba55d3)" }}
              />
            </div>
            {need > 0 && (
              <p className="text-[10px] font-semibold" style={{ color: "#ba55d3" }}>
                {t("cases.referralNeed").replace("{n}", need.toFixed(2))}
              </p>
            )}
          </div>
        )}
      </div>
    </button>
  )
}

// ─── Paid Case Card ───────────────────────────────────────────────────────────
function CaseCard({ caseDef, onOpen, promoLocked }: { caseDef: CaseDef; onOpen: () => void; promoLocked?: boolean }) {
  const { tCase } = useT()
  const prizes = normalizeCaseContents(caseDef.contents)
  const pool = prizes.flatMap(p => p.type === "nft" ? [nftById(p.id)] : [])
  const best = pool.length
    ? pool.reduce((a, b) => RARITY[a.rarity].weight < RARITY[b.rarity].weight ? a : b)
    : nftById("chillflame")
  const glow = RARITY[best.rarity].glow
  const nftOnly = prizes.length > 0 && prizes.every(p => p.type === "nft")
  const badge = (caseDef as any).badge !== undefined
    ? (caseDef as any).badge
    : caseDef.id === "starter" ? "НОВИНКА" : nftOnly ? "ТОЛЬКО NFT" : ""

  const displayBadge = promoLocked ? "🎟️ ПРОМО" : badge

  return (
    <button
      onClick={onOpen}
      className="group relative flex min-h-[230px] flex-col items-center overflow-hidden rounded-[22px] p-3 text-center transition active:scale-[0.97]"
      style={{
        background: "linear-gradient(180deg, #252638 0%, #1a1a2e 58%, #151526 100%)",
        border: "1px solid rgba(255,255,255,0.08)",
        boxShadow: `0 16px 32px rgba(0,0,0,0.42), 0 0 20px ${glow}`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition group-hover:opacity-100" style={{ boxShadow: "inset 0 0 38px rgba(255,255,255,0.08)" }} />
      {displayBadge && (
        <span
          className="absolute left-3 top-3 z-20 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wide text-white shadow-lg"
          style={{
            background: promoLocked
              ? "linear-gradient(180deg, #ffd600, #e6a800)"
              : displayBadge === "НОВИНКА"
              ? "linear-gradient(180deg, #60f06f, #17a83a)"
              : "linear-gradient(180deg, #b66cff, #7a35d8)",
            color: promoLocked ? "#1a1400" : "#fff",
            transform: "rotate(-8deg)",
          }}
        >
          {displayBadge}
        </span>
      )}
      <div className="relative z-10 flex aspect-[1.18] w-full items-center justify-center overflow-hidden rounded-2xl">
        <CaseCoverImage caseDef={caseDef} />
      </div>
      <span className="relative z-10 mt-3 min-h-[40px] text-center text-[18px] font-black leading-tight text-white">
        {tCase(caseDef.id, caseDef.name)}
      </span>
      <span
        className="relative z-10 mt-2 inline-flex min-w-[96px] items-center justify-center gap-2 rounded-2xl px-4 py-2 text-lg font-black text-white"
        style={{
          background: promoLocked
            ? "linear-gradient(180deg, #554200, #3a2d00)"
            : "linear-gradient(180deg, #303143, #252638)",
          border: promoLocked ? "1px solid rgba(255,214,0,0.3)" : "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 10px 18px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}
      >
        {promoLocked ? (
          <span className="text-[#ffd600]">🎟️ Промокод</span>
        ) : (
          <><TonIcon className="inline-block mr-1 align-middle h-4 w-4" />{caseDef.price}</>
        )}
      </span>
    </button>
  )
}

function CaseCoverImage({ caseDef }: { caseDef: CaseDef }) {
  const [failed, setFailed] = useState(false)
  const cover = caseDef.cover?.trim()
  if (cover && !failed) {
    return (
      <img
        src={cover} alt={caseDef.name} width={84} height={84}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover drop-shadow-[0_0_18px_rgba(255,255,255,0.22)]"
      />
    )
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#202133]">
      <CaseCover caseId={caseDef.id} size={132} />
    </div>
  )
}

// ─── Promo Case Modal ─────────────────────────────────────────────────────────
function PromoCaseModal({ caseDef, onClose, onSuccess }: {
  caseDef: CaseDef
  onClose: () => void
  onSuccess: () => void
}) {
  const [code, setCode] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()
  const { t } = useT()

  async function submit() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      const res = await redeemPromo(trimmed)
      if (!res.ok) {
        const msgs: Record<string, string> = {
          not_found: t("deposit.promoNotFound"),
          inactive: t("deposit.promoInactive"),
          expired: t("deposit.promoExpired"),
          depleted: t("deposit.promoDepleted"),
          already: t("deposit.promoAlready"),
          unauthorized: t("deposit.promoAuthError"),
        }
        setError(msgs[res.error || ""] || t("deposit.promoInvalid"))
        return
      }
      if (res.type !== "case") {
        setError(t("deposit.promoInvalid"))
        return
      }
      toast(t("deposit.promoActivatedCase"), "win")
      onSuccess()
    } catch {
      setError(t("deposit.promoNetworkError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="animate-in slide-in-from-bottom relative z-10 w-full max-w-[480px] rounded-t-3xl p-6 pb-10"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          borderTop: "3px solid rgba(255,214,0,0.5)",
          boxShadow: "0 -10px 40px rgba(255,214,0,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/20" />

        {/* Case preview */}
        <div className="mb-5 flex items-center gap-4">
          <img
            src={caseDef.cover || "/placeholder.svg"}
            alt={caseDef.name}
            className="h-16 w-16 rounded-2xl object-contain"
            onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg" }}
          />
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#ffd600] mb-1">🎟️ Promo Case</p>
            <p className="text-lg font-extrabold text-white">{caseDef.name}</p>
            <p className="text-xs text-muted-foreground">{t("cases.promoEnter")}</p>
          </div>
        </div>

        {/* Code input */}
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null) }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={t("deposit.promoPlaceholder")}
          autoFocus
          className="mb-3 w-full rounded-2xl border border-[rgba(255,214,0,0.35)] bg-black/60 px-4 py-4 text-center text-xl font-black font-mono uppercase tracking-widest outline-none focus:border-[#ffd600]"
          style={{ color: "#ffd600" }}
        />

        {error && (
          <p className="mb-3 text-center text-sm font-semibold text-red-400">{error}</p>
        )}

        <button
          onClick={submit}
          disabled={loading || !code.trim()}
          className="w-full rounded-2xl py-4 text-base font-extrabold disabled:opacity-50"
          style={{
            background: "linear-gradient(180deg,#ffe14d,#e6a800)",
            color: "#1a1400",
            boxShadow: "0 6px 0 #8a6200, 0 10px 22px rgba(255,214,0,0.3)",
          }}
        >
          {loading ? t("deposit.promoChecking") : t("deposit.promoActivate")}
        </button>
      </div>
    </div>
  )
}

"use client"

import { useState } from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/components/toast"
import { TonIcon, StarIcon } from "@/components/icons"
import { useTonConnectUI, useTonAddress } from "@tonconnect/ui-react"
import { TREASURY_WALLET } from "@/components/ton-provider"
import { payWithStars, isTelegram, redeemPromo, confirmTonDeposit } from "@/lib/api-client"
import { useT } from "@/lib/i18n"

const PRESETS = [0.1, 0.5, 1, 5, 10, 50, 100]
const MIN_DEPOSIT = 0.1
const TON_PER_STAR = 0.3 / 50
const STAR_PRESETS = [50, 100, 250, 500]

export function DepositModal({ onClose }: { onClose: () => void }) {
  const { addTon, recordDeposit, refreshFromServer, setTon } = useStore()
  const toast = useToast()
  const { t } = useT()
  const [tonConnectUI] = useTonConnectUI()
  const walletAddress = useTonAddress()
  const [tab, setTab] = useState<"ton" | "stars" | "promo">("ton")
  const [tonAmt, setTonAmt] = useState("0.1")
  const [starAmt, setStarAmt] = useState("250")
  const [sending, setSending] = useState(false)
  const [payingStars, setPayingStars] = useState(false)

  // Promo state
  const [promoCode, setPromoCode] = useState("")
  const [promoLoading, setPromoLoading] = useState(false)
  const [appliedBonus, setAppliedBonus] = useState<{ percent: number; code: string } | null>(null)

  async function sendTon() {
    const n = Number.parseFloat(tonAmt)
    if (!n || n < MIN_DEPOSIT) return toast(t("deposit.minAmount", { n: MIN_DEPOSIT }), "error")
    if (!walletAddress) {
      toast(t("deposit.connectFirst"), "error")
      tonConnectUI.openModal()
      return
    }
    setSending(true)
    try {
      const result = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 360,
        messages: [{ address: TREASURY_WALLET, amount: Math.round(n * 1e9).toString() }],
      })
      const bonus = appliedBonus ? Math.round(n * (appliedBonus.percent / 100) * 1000) / 1000 : 0
      const total = Math.round((n + bonus) * 1000) / 1000

      if (isTelegram()) {
        await new Promise((r) => setTimeout(r, 4000))
        const boc = String((result as any)?.boc || "")
        const credited = await confirmTonDeposit({
          amount: n,
          boc,
          txHash: boc ? await sha256Hex(boc) : undefined,
          fromAddress: walletAddress,
        })
        setTon(credited.ton)
        await refreshFromServer().catch(() => {})
        toast(t("deposit.success", { n }), "win")
        setAppliedBonus(null)
      } else {
        addTon(total)
        recordDeposit(total)
        if (bonus > 0) toast(t("deposit.depositedBonus", { n, b: bonus, p: appliedBonus!.percent, t: total }), "win")
        else toast(t("deposit.success", { n: total }), "win")
        setAppliedBonus(null)
      }
      onClose()
    } catch {
      toast(t("deposit.cancelled"), "error")
    } finally {
      setSending(false)
    }
  }

  async function sha256Hex(str: string) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  }

  async function payStars() {
    const n = Number.parseInt(starAmt)
    if (!n || n <= 0) return toast(t("deposit.starsAmountInvalid"), "error")
    const tonValue = Math.round(n * TON_PER_STAR * 100) / 100

    if (!isTelegram()) {
      const bonus = appliedBonus ? Math.round(tonValue * (appliedBonus.percent / 100) * 1000) / 1000 : 0
      const total = Math.round((tonValue + bonus) * 1000) / 1000
      addTon(total)
      recordDeposit(total)
      if (bonus > 0) toast(t("deposit.paidStarsBonus", { n, t: total, b: bonus }), "win")
      else toast(t("deposit.paidStars", { n, t: total }), "win")
      setAppliedBonus(null)
      onClose()
      return
    }

    setPayingStars(true)
    try {
      const status = await payWithStars({
        stars: n,
        title: "TON Deposit",
        description: `Add ${tonValue} TON to your balance`,
        kind: "deposit",
        ton: tonValue,
      })
      if (status === "paid") {
        // Stars are credited by the Telegram webhook — refresh authoritative balance.
        await refreshFromServer().catch(() => {})
        toast(t("deposit.paidStars", { n, t: tonValue }), "win")
        setAppliedBonus(null)
        onClose()
      } else if (status === "cancelled") {
        toast(t("deposit.paymentCancelled"), "info")
      } else {
        toast(t("deposit.paymentFailed"), "error")
      }
    } catch (e: any) {
      toast(e.message || t("deposit.paymentFailed"), "error")
    } finally {
      setPayingStars(false)
    }
  }

  async function applyPromo() {
    const code = promoCode.trim().toUpperCase()
    if (!code) return toast(t("deposit.promoEmpty"), "error")
    setPromoLoading(true)
    try {
      const res = await redeemPromo(code)
      if (!res.ok) {
        const msgs: Record<string, string> = {
          not_found: t("deposit.promoNotFound"),
          inactive: t("deposit.promoInactive"),
          expired: t("deposit.promoExpired"),
          depleted: t("deposit.promoDepleted"),
          already: t("deposit.promoAlready"),
          unauthorized: t("deposit.promoAuthError"),
        }
        toast(msgs[res.error || ""] || t("deposit.promoInvalid"), "error")
        return
      }
      if (res.type === "ton") {
        const reward = res.reward ?? 0
        if (isTelegram()) await refreshFromServer().catch(() => {})
        else {
          addTon(reward)
          recordDeposit(0)
        }
        toast(t("deposit.promoActivatedTon", { n: reward }), "win")
        setPromoCode("")
        onClose()
      } else if (res.type === "percent") {
        const pct = res.bonusPercent ?? 0
        // Bonus is stored server-side and applied on the next verified deposit.
        setAppliedBonus({ percent: pct, code })
        setPromoCode("")
        toast(t("deposit.promoActivatedPercent", { p: pct }), "win")
      } else if (res.type === "case") {
        // Case promo codes should be used in the Cases screen, not here
        toast(t("deposit.promoInvalid"), "error")
      }
    } catch {
      toast(t("deposit.promoInvalid"), "error")
    } finally {
      setPromoLoading(false)
    }
  }

  const bonusAmt = appliedBonus
    ? Math.round(Number(tonAmt) * (appliedBonus.percent / 100) * 1000) / 1000
    : 0

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="animate-in slide-in-from-bottom relative z-10 w-full max-w-[480px] rounded-t-3xl p-5 pb-8"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          borderTop: "3px solid rgba(0,255,65,0.4)",
          boxShadow: "0 -10px 40px rgba(0,255,65,0.2)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-white/20" />
        <h2 className="mb-4 text-center text-lg font-extrabold">{t("deposit.title")}</h2>        {/* Active bonus banner */}
        {appliedBonus && (
          <div className="mb-4 flex items-center justify-between rounded-2xl px-4 py-2.5"
            style={{ background: "rgba(0,255,65,0.12)", border: "1px solid rgba(0,255,65,0.3)" }}>
            <span className="text-sm font-bold text-[#39FF14]">{t("deposit.bonusActive", { p: appliedBonus.percent })}</span>
            <button onClick={() => setAppliedBonus(null)} className="text-xs text-muted-foreground hover:text-white">✕</button>
          </div>
        )}

        {/* Tabs */}
        <div className="mb-5 flex gap-2 rounded-2xl bg-black/40 p-1">
          <TabBtn active={tab === "ton"} onClick={() => setTab("ton")}>
            <TonIcon className="h-4 w-4" /> {t("deposit.tabTon")}
          </TabBtn>
          <TabBtn active={tab === "stars"} onClick={() => setTab("stars")}>
            <StarIcon className="h-4 w-4 text-gold" /> {t("deposit.tabStars")}
          </TabBtn>
          <TabBtn active={tab === "promo"} onClick={() => setTab("promo")}>
            🎟️ {t("deposit.tabPromo")}
          </TabBtn>
        </div>

        {tab === "ton" && (
          <div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button key={p} onClick={() => setTonAmt(String(p))}
                  className="rounded-xl border py-2.5 text-sm font-bold transition active:scale-95"
                  style={{
                    background: tonAmt === String(p) ? "var(--pepe)" : "rgba(0,255,65,0.06)",
                    color: tonAmt === String(p) ? "#04130a" : "#eafff0",
                    borderColor: tonAmt === String(p) ? "var(--pepe)" : "rgba(0,255,65,0.2)",
                  }}>
                  {p}
                </button>
              ))}
            </div>
            <input value={tonAmt} onChange={(e) => setTonAmt(e.target.value)}
              inputMode="decimal" placeholder={t("deposit.customAmount")}
              className="mb-2 w-full rounded-xl border border-[rgba(0,255,65,0.28)] bg-black/50 px-4 py-3 text-center text-lg font-bold outline-none focus:border-[var(--pepe)]" />
            {appliedBonus && Number(tonAmt) > 0 && (
              <div className="mb-3 rounded-xl px-3 py-2 text-center text-sm"
                style={{ background: "rgba(0,255,65,0.08)", border: "1px solid rgba(0,255,65,0.2)" }}>
                <span className="text-muted-foreground">{tonAmt} TON </span>
                <span className="font-bold text-[#39FF14]">+ {bonusAmt} TON ({appliedBonus.percent}%) </span>
                <span className="font-extrabold text-white">= {(Number(tonAmt) + bonusAmt).toFixed(3)} TON</span>
              </div>
            )}
            {!walletAddress && (
              <p className="mb-3 text-center text-xs text-[#7cc4ff]">{t("deposit.connectHint")}</p>
            )}
            <button onClick={sendTon} disabled={sending}
              className="btn-3d w-full rounded-2xl py-4 text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-70">
              {sending
                ? t("deposit.confirmInWallet")
                : walletAddress
                  ? (appliedBonus
                      ? t("deposit.sendAmountBonus", { n: tonAmt || "0", p: appliedBonus.percent })
                      : t("deposit.sendAmount", { n: tonAmt || "0" }))
                  : t("deposit.connectAndSend")}
            </button>
          </div>
        )}

        {tab === "stars" && (
          <div>
            <div className="mb-3 grid grid-cols-4 gap-2">
              {STAR_PRESETS.map((p) => (
                <button key={p} onClick={() => setStarAmt(String(p))}
                  className="rounded-xl border py-2.5 text-sm font-bold transition active:scale-95"
                  style={{
                    background: starAmt === String(p) ? "rgba(255,214,0,0.9)" : "rgba(255,214,0,0.06)",
                    color: starAmt === String(p) ? "#1a1400" : "#ffe88a",
                    borderColor: starAmt === String(p) ? "#ffd600" : "rgba(255,214,0,0.25)",
                  }}>
                  {p}
                </button>
              ))}
            </div>
            <input value={starAmt} onChange={(e) => setStarAmt(e.target.value)}
              inputMode="numeric" placeholder={t("deposit.tabStars")}
              className="mb-2 w-full rounded-xl border border-[rgba(0,255,65,0.28)] bg-black/50 px-4 py-3 text-center text-lg font-bold outline-none focus:border-[var(--pepe)]" />
            {(() => {
              const tonValue = Math.round((Number.parseInt(starAmt || "0") || 0) * TON_PER_STAR * 100) / 100
              const bonus = appliedBonus ? Math.round(tonValue * (appliedBonus.percent / 100) * 1000) / 1000 : 0
              return (
                <p className="mb-4 text-center text-sm text-muted-foreground">
                  {t("deposit.starsRate")} ·{" "}
                  <span className="font-bold text-pepe-light">{t("deposit.starsApprox", { n: tonValue })}</span>
                  {bonus > 0 && <span className="font-bold text-[#39FF14]"> {t("deposit.starsBonus", { n: bonus })}</span>}
                </p>
              )
            })()}
            <button onClick={payStars} disabled={payingStars}
              className="w-full rounded-2xl py-4 text-base font-extrabold text-[#04130a] active:translate-y-1 disabled:cursor-not-allowed disabled:opacity-70"
              style={{ background: "linear-gradient(180deg,#ffe14d,#ffc400)", boxShadow: "0 6px 0 #a87f00, 0 10px 22px rgba(255,214,0,0.35)" }}>
              {payingStars
                ? t("deposit.starsOpeningInvoice")
                : appliedBonus
                  ? t("deposit.payStarsBonus", { n: starAmt || "0", p: appliedBonus.percent })
                  : t("deposit.payStars", { n: starAmt || "0" })}
            </button>
          </div>
        )}

        {tab === "promo" && (
          <div>
            <p className="mb-3 text-center text-sm text-muted-foreground">
              {t("deposit.promoHint")}
            </p>
            <input
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder={t("deposit.promoPlaceholder")}
              className="mb-4 w-full rounded-xl border border-[rgba(0,255,65,0.28)] bg-black/50 px-4 py-3 text-center text-lg font-bold font-mono uppercase outline-none focus:border-[var(--pepe)] tracking-widest"
              onKeyDown={(e) => e.key === "Enter" && applyPromo()}
            />
            <button onClick={applyPromo} disabled={promoLoading || !promoCode.trim()}
              className="btn-3d w-full rounded-2xl py-4 text-base font-extrabold disabled:opacity-50">
              {promoLoading ? t("deposit.promoChecking") : t("deposit.promoActivate")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition"
      style={{
        background: active ? "rgba(0,255,65,0.14)" : "transparent",
        color: active ? "#eafff0" : "#5f8f6e",
        border: active ? "1px solid rgba(0,255,65,0.4)" : "1px solid transparent",
      }}>
      {children}
    </button>
  )
}

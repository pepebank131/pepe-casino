"use client"

import { useState } from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/components/toast"
import { useT, LANGS, type Lang } from "@/lib/i18n"
import { CoinFlipSheet } from "@/components/mini-games"
import { LeaderboardSheet } from "@/components/leaderboard-sheet"
import { CoinIcon, UpgradeIcon, TrophyIcon, SettingsIcon, GiftIcon } from "@/components/icons"
import { isTelegram, redeemPromo } from "@/lib/api-client"

export function MenuScreen({ onUpgrade }: { onUpgrade: () => void }) {
  const { addTon, refreshFromServer } = useStore()
  const toast = useToast()
  const { t, lang, setLang } = useT()
  const [game, setGame] = useState<"coin" | null>(null)
  const [showLb, setShowLb] = useState(false)
  const [promo, setPromo] = useState("")
  const [redeeming, setRedeeming] = useState(false)
  const [langOpen, setLangOpen] = useState(false)

  async function redeem() {
    const code = promo.trim().toUpperCase()
    if (!code) return toast(t("menu.enterPromo"), "error")
    if (redeeming) return
    setRedeeming(true)
    try {
      if (isTelegram()) {
        const res = await redeemPromo(code)
        if (res.ok && res.type === "ton" && typeof res.reward === "number") {
          await refreshFromServer().catch(() => {})
          toast(t("menu.promoRedeemed", { n: res.reward }), "win")
        } else if (res.ok && res.type === "case") {
          toast("Promo case unlocked — open it from Cases", "win")
        } else if (res.error === "already") {
          toast(t("menu.promoAlready"), "error")
        } else {
          toast(t("menu.invalidPromo"), "error")
        }
      } else if (code === "PEPE100") {
        addTon(1)
        toast(t("menu.promoRedeemed", { n: 1 }), "win")
      } else if (code === "FROG") {
        addTon(0.5)
        toast(t("menu.promoRedeemed", { n: 0.5 }), "win")
      } else {
        toast(t("menu.invalidPromo"), "error")
      }
    } catch {
      toast(t("menu.invalidPromo"), "error")
    } finally {
      setRedeeming(false)
      setPromo("")
    }
  }

  const currentLangLabel = LANGS.find((l) => l.code === lang)?.label ?? "English"

  return (
    <div className="px-4 pb-28 pt-2">
      <h2 className="mb-3 text-lg font-extrabold">{t("menu.miniGames")}</h2>
      <div className="mb-5 grid grid-cols-3 gap-3">
        <GameCard label={t("menu.coinFlip")} glow="#ffd600" onClick={() => setGame("coin")}>
          <CoinIcon className="h-8 w-8 text-gold" />
        </GameCard>

        <GameCard label={t("menu.upgrade")} glow="#00ff41" onClick={onUpgrade}>
          <UpgradeIcon className="h-8 w-8 text-pepe-light" />
        </GameCard>
      </div>

      {/* leaderboard */}
      <button
        onClick={() => setShowLb(true)}
        className="mb-5 flex w-full items-center justify-between rounded-2xl p-4 active:scale-[0.98]"
        style={{
          background: "linear-gradient(150deg, rgba(255,214,0,0.18), rgba(11,15,18,0.92))",
          border: "1px solid rgba(255,214,0,0.4)",
          boxShadow: "0 10px 28px rgba(255,214,0,0.15)",
        }}
      >
        <div className="flex items-center gap-3">
          <TrophyIcon className="h-7 w-7 text-gold" />
          <div className="text-left">
            <p className="text-sm font-extrabold">{t("menu.leaderboard")}</p>
            <p className="text-[11px] text-white/60">{t("menu.leaderboardSub")}</p>
          </div>
        </div>
        <span className="text-xl font-black text-gold">›</span>
      </button>

      {/* promo code */}
      <h3 className="mb-2 text-sm font-extrabold">{t("menu.promoCode")}</h3>
      <div className="glass-card mb-5 flex items-center gap-2 rounded-2xl p-2">
        <input
          value={promo}
          onChange={(e) => setPromo(e.target.value)}
          placeholder={t("menu.promoPlaceholder")}
          className="flex-1 rounded-xl bg-black/40 px-3 py-2.5 text-sm font-semibold outline-none placeholder:text-muted-foreground"
        />
        <button onClick={redeem} disabled={redeeming} className="btn-3d rounded-xl px-5 py-2.5 text-sm font-extrabold disabled:opacity-50">
          {redeeming ? "…" : t("menu.redeem")}
        </button>
      </div>

      {/* settings */}
      <h3 className="mb-2 text-sm font-extrabold">{t("menu.settings")}</h3>
      <div className="glass-card overflow-hidden rounded-2xl">
        <button
          onClick={() => setLangOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3.5"
        >
          <span className="flex items-center gap-3 text-sm font-semibold">
            <SettingsIcon className="h-5 w-5 text-pepe-light" /> {t("menu.language")}
          </span>
          <span className="text-sm font-bold text-muted-foreground">{currentLangLabel} ▾</span>
        </button>
        {langOpen && (
          <div className="border-t border-[rgba(0,255,65,0.1)]">
            {LANGS.map((l) => (
              <button
                key={l.code}
                onClick={() => {
                  setLang(l.code as Lang)
                  setLangOpen(false)
                  toast(t("menu.langSet", { l: l.label }), "info")
                }}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold active:bg-[rgba(0,255,65,0.06)]"
                style={{ color: lang === l.code ? "#39FF14" : "#eafff0" }}
              >
                {l.label}
                {lang === l.code && <span>✓</span>}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => toast(t("menu.provablyFairToast"), "info")}
          className="flex w-full items-center gap-3 border-t border-[rgba(0,255,65,0.1)] px-4 py-3.5 text-sm font-semibold"
        >
          <GiftIcon className="h-5 w-5 text-pepe-light" /> {t("menu.provablyFair")}
        </button>
      </div>

      {game === "coin" && <CoinFlipSheet onClose={() => setGame(null)} />}
      
      {showLb && <LeaderboardSheet onClose={() => setShowLb(false)} />}
    </div>
  )
}

function GameCard({ label, glow, onClick, children }: { label: string; glow: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2 rounded-2xl py-5 active:scale-95"
      style={{
        background: "linear-gradient(165deg, rgba(0,255,65,0.07), rgba(11,15,18,0.92))",
        border: "1px solid rgba(0,255,65,0.2)",
        boxShadow: `0 10px 26px rgba(0,0,0,0.45), 0 0 18px ${glow}33`,
      }}
    >
      {children}
      <span className="text-xs font-bold">{label}</span>
    </button>
  )
}

"use client"

import { useState } from "react"
import { useT } from "@/lib/i18n"
import { checkChannelSubscription } from "@/lib/api-client"
import { GiftIcon, CheckIcon } from "@/components/icons"

export const REQUIRED_CHANNEL_URL = "https://t.me/pepe_GiftsNFT"

// Blocking modal shown when the player tries to open the free case without
// being subscribed to the required gifts channel. It never auto-dismisses —
// only a successful "Check subscription" closes it (via onVerified).
export function SubscriptionGate({ onVerified, onClose }: { onVerified: () => void; onClose: () => void }) {
  const { t } = useT()
  const [checking, setChecking] = useState(false)
  const [notYet, setNotYet] = useState(false)

  function openChannel() {
    try {
      const tg = (window as any)?.Telegram?.WebApp
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(REQUIRED_CHANNEL_URL)
        return
      }
    } catch {}
    window.open(REQUIRED_CHANNEL_URL, "_blank")
  }

  async function check() {
    if (checking) return
    setChecking(true)
    setNotYet(false)
    try {
      const ok = await checkChannelSubscription()
      if (ok) {
        onVerified()
      } else {
        setNotYet(true)
      }
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-[380px] rounded-3xl p-6 text-center"
        style={{
          background: "linear-gradient(180deg,#0b0f12,#06120a)",
          border: "1px solid rgba(0,255,65,0.35)",
          boxShadow: "0 20px 60px rgba(0,255,65,0.18)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
          style={{ background: "rgba(0,255,65,0.12)", border: "1px solid rgba(0,255,65,0.3)" }}
        >
          <GiftIcon className="h-8 w-8 text-pepe-light" />
        </div>
        <h2 className="mb-2 text-lg font-extrabold">{t("sub.title")}</h2>
        <p className="mb-5 text-sm text-muted-foreground">{t("sub.desc")}</p>

        <button
          onClick={openChannel}
          className="btn-3d mb-3 w-full rounded-2xl py-3.5 text-sm font-extrabold"
        >
          {t("sub.subscribe")}
        </button>

        <button
          onClick={check}
          disabled={checking}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[rgba(0,255,65,0.3)] bg-black/30 py-3.5 text-sm font-extrabold text-pepe-light active:scale-[0.98] disabled:opacity-60"
        >
          <CheckIcon className="h-4 w-4" />
          {checking ? t("sub.checking") : t("sub.check")}
        </button>

        {notYet && (
          <p className="mt-3 text-xs font-semibold text-[#ff8094]">{t("sub.notYet")}</p>
        )}
      </div>
    </div>
  )
}

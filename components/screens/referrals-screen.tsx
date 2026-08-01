"use client"

import { useState } from "react"
import { useStore } from "@/lib/store"
import { useToast } from "@/components/toast"
import { useT } from "@/lib/i18n"
import { TonIcon, CopyIcon, UsersIcon, CheckIcon } from "@/components/icons"
import Image from "next/image"

export function ReferralsScreen() {
  const { refLink, referrals, refEarned } = useStore()
  const toast = useToast()
  const { t } = useT()
  const [copied, setCopied] = useState(false)

  const totalDeposited = referrals.reduce((s, r) => s + r.wagered, 0)

  function copy() {
    navigator.clipboard?.writeText(refLink).catch(() => {})
    setCopied(true)
    toast("Invite link copied", "win")
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className="px-4 pb-28 pt-2">
      {/* banner */}
      <div
        className="relative mb-4 overflow-hidden rounded-3xl p-5"
        style={{
          background: "linear-gradient(150deg, rgba(0,255,65,0.22), rgba(11,15,18,0.92))",
          border: "1px solid rgba(0,255,65,0.4)",
          boxShadow: "0 14px 40px rgba(0,255,65,0.18)",
        }}
      >
        <UsersIcon className="mb-2 h-8 w-8 text-pepe-light" />
        <h2 className="text-xl font-black leading-tight text-balance">{t("ref.heading")}</h2>
        <p className="mt-1 text-sm text-white/70">{t("ref.headingSub")}</p>
      </div>

      {/* invite link */}
      <div className="glass-card mb-4 rounded-2xl p-4">
        <label className="mb-2 block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Your invite link</label>
        <div className="flex items-center gap-2">
          <div className="flex-1 truncate rounded-xl border border-[rgba(0,255,65,0.2)] bg-black/50 px-3 py-2.5 text-xs font-semibold text-pepe-light">
            {refLink}
          </div>
          <button
            onClick={copy}
            className="btn-3d flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            aria-label="Copy link"
          >
            {copied ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* stats */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        <StatCard label="Referrals" value={String(referrals.length)} />
        <StatCard label="Deposited" value={`${totalDeposited.toFixed(1)}`} ton />
        <StatCard label="You earned" value={`${refEarned.toFixed(2)}`} ton highlight />
      </div>

      {/* referred list */}
      <h3 className="mb-3 text-base font-extrabold">Your Referrals</h3>
      {referrals.length === 0 ? (
        <p className="text-sm text-muted-foreground">No referrals yet. Share your link to start earning.</p>
      ) : (
        <div className="space-y-2">
          {referrals.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-xl px-3 py-3"
              style={{
                background: "linear-gradient(160deg, rgba(0,255,65,0.04), rgba(11,15,18,0.8))",
                border: "1px solid rgba(0,255,65,0.1)",
              }}
            >
              <div className="flex items-center gap-3">
                {r.photoUrl ? (
                  <Image
                    src={r.photoUrl}
                    alt={r.name}
                    width={36}
                    height={36}
                    className="h-9 w-9 rounded-full object-cover shrink-0"
                  />
                ) : (
                  <span
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-black text-black shrink-0"
                    style={{ background: `hsl(${r.avatarHue} 70% 55%)` }}
                  >
                    {r.name[0].toUpperCase()}
                  </span>
                )}
                <div>
                  <p className="text-sm font-bold">@{r.name}</p>
                  <p className="text-[11px] text-muted-foreground">Deposited {r.wagered} TON</p>
                </div>
              </div>
              <span className="flex items-center gap-1 text-sm font-bold text-pepe-light">
                +<TonIcon className="h-3.5 w-3.5" />
                {(r.wagered * 0.1).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, ton, highlight }: { label: string; value: string; ton?: boolean; highlight?: boolean }) {
  return (
    <div
      className="rounded-2xl p-3 text-center"
      style={{
        background: highlight ? "linear-gradient(160deg, rgba(0,255,65,0.16), rgba(11,15,18,0.9))" : "rgba(11,15,18,0.8)",
        border: highlight ? "1px solid rgba(0,255,65,0.4)" : "1px solid rgba(0,255,65,0.12)",
      }}
    >
      <p className="flex items-center justify-center gap-1 text-lg font-black tabular-nums">
        {ton && <TonIcon className="h-4 w-4" />}
        {value}
      </p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  )
}
